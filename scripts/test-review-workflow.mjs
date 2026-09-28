#!/usr/bin/env node
/**
 * .claude/workflows/review-code.js 후처리 테스트.
 *
 * 워크플로우 스크립트는 런타임이 주입하는 전역(agent/pipeline/log/...) 위에서 도는 async 본문이라
 * import할 수 없다. 그래서 파일을 읽어 같은 모양의 함수로 감싸고, agent()만 가짜로 바꿔 돌린다.
 * 에이전트 응답을 고정하면 집계·중복 제거·심각도 바닥·검증 표기가 전부 결정론적으로 검사된다.
 *
 * 돌리는 법: node scripts/test-review-workflow.mjs
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = readFileSync(join(ROOT, '.claude/workflows/review-code.js'), 'utf-8')

// 런타임과 같은 문맥으로 감싼다. export만 떼면 그대로 함수 본문이 된다.
const makeWorkflow = new Function(
  'return async function (agent, pipeline, parallel, log, phase, args, budget, workflow) {\n' +
    SRC.replace('export const meta', 'const meta') +
    '\n}'
)()

// ── 런타임 스텁 ────────────────────────────────────────────────────────────

function pipeline(items, ...stages) {
  return Promise.all(
    items.map(async (item, i) => {
      let v = item
      for (const stage of stages) v = await stage(v, item, i)
      return v
    })
  )
}

const parallel = (thunks) => Promise.all(thunks.map((t) => t().catch(() => null)))

/** responses: {label -> 반환값}. 없는 label은 null (에이전트 실패와 같은 취급). */
function run(responses) {
  const logs = []
  const agent = (_prompt, opts) => Promise.resolve(responses[opts.label] ?? null)
  return makeWorkflow(agent, pipeline, parallel, (m) => logs.push(m), () => {}, { packDir: '/tmp/pack' }, {}, () => {}).then(
    (out) => ({ ...out, logs })
  )
}

const SUMMARY = { walkthrough: '변경 요약', good_points: ['잘한 점'], next_actions: ['다음 액션'] }

function finding(over) {
  return {
    file: 'src/lib/a.ts',
    line: 10,
    severity: 'major',
    critical_rule: false,
    title: '제목',
    tldr: '왜 문제인지',
    good: '잘한 부분',
    fix: 'const fixed = true',
    failure_scenario: '입력 → 잘못된 결과',
    ...over,
  }
}

const verdict = (id, over) => ({ id, refuted: false, phantom: false, reason: '재현됨', ...over })

// ── 미니 테스트 러너 ───────────────────────────────────────────────────────

let passed = 0
const failures = []
const tests = []
const test = (name, fn) => tests.push([name, fn])

function eq(actual, expected, what) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${what}: 기대 ${e}, 실제 ${a}`)
}

function ok(cond, what) {
  if (!cond) throw new Error(what)
}

// ── 회귀: 같은 줄의 서로 다른 지적이 사라지면 안 된다 ──────────────────────

test('같은 file:line이라도 지적이 다르면 둘 다 남는다', async () => {
  const out = await run({
    'review:correctness': { findings: [finding({ title: 'kind 필터가 없다' })] },
    'review:security': { findings: [finding({ title: 'user_id 조건이 없다' })] },
    'review:architecture': { findings: [] },
    'verify:correctness': { verdicts: [verdict(0)] },
    'verify:security': { verdicts: [verdict(0)] },
    summary: SUMMARY,
  })
  eq(out.findings.length, 2, '같은 줄 두 지적이 모두 살아남아야 한다')
  eq(
    out.findings.map((f) => f.title).sort(),
    ['kind 필터가 없다', 'user_id 조건이 없다'],
    '두 지적의 본문이 모두 보존돼야 한다'
  )
  eq(out.counts.major, 2, 'major 집계')
})

test('제목까지 같으면 하나로 합치고 차원을 합집합으로 남긴다', async () => {
  const out = await run({
    'review:correctness': { findings: [finding({ title: '똑같은 제목' })] },
    'review:security': { findings: [finding({ title: '똑같은 제목', severity: 'minor' })] },
    'review:architecture': { findings: [] },
    'verify:correctness': { verdicts: [verdict(0)] },
    'verify:security': { verdicts: [verdict(0)] },
    summary: SUMMARY,
  })
  eq(out.findings.length, 1, '동일 지적은 한 건으로 합쳐야 한다')
  eq(out.findings[0].severity, 'major', '심각도가 높은 쪽이 이겨야 한다')
  eq(out.findings[0].dims.sort(), ['correctness', 'security'], '두 차원이 모두 기록돼야 한다')
})

// ── 회귀: 판정이 없는 지적을 검증 통과로 찍으면 안 된다 ────────────────────

test('검증자가 빠뜨린 지적은 verified: false로 남는다', async () => {
  const out = await run({
    'review:correctness': {
      findings: [finding({ line: 1, title: '첫째' }), finding({ line: 2, title: '둘째' })],
    },
    'review:security': { findings: [] },
    'review:architecture': { findings: [] },
    'verify:correctness': { verdicts: [verdict(0)] }, // id 1에 대한 판정이 없다
    summary: SUMMARY,
  })
  eq(out.findings.length, 2, '판정 누락이 지적을 없애지는 않는다')
  eq(out.findings.find((f) => f.title === '첫째').verified, true, '판정 받은 건')
  eq(out.findings.find((f) => f.title === '둘째').verified, false, '판정 누락 건')
  eq(out.stats.unverified, 1, '미검증 집계')
  ok(out.summaryMd.includes('검증 통과 1/2'), '검증 통과 수에서 미검증이 빠져야 한다')
  ok(out.summaryMd.includes('미검증 1'), '미검증 건수를 요약에 드러내야 한다')
})

test('검증 에이전트가 통째로 죽으면 전부 미검증으로 통과시킨다', async () => {
  const out = await run({
    'review:correctness': { findings: [finding({})] },
    'review:security': { findings: [] },
    'review:architecture': { findings: [] },
    // verify:correctness 없음 → null
    summary: SUMMARY,
  })
  eq(out.findings.length, 1, '검증 실패가 지적을 삼키면 안 된다')
  eq(out.findings[0].verified, false, '미검증 표시')
  eq(out.stats.unverified, 1, '미검증 집계')
})

// ── 기존 계약 (깨지지 않았는지) ────────────────────────────────────────────

test('반박당한 지적은 탈락한다', async () => {
  const out = await run({
    'review:correctness': { findings: [finding({ title: '허위' })] },
    'review:security': { findings: [] },
    'review:architecture': { findings: [] },
    'verify:correctness': { verdicts: [verdict(0, { refuted: true, phantom: true })] },
    summary: SUMMARY,
  })
  eq(out.findings.length, 0, '기각된 지적은 남지 않는다')
  eq(out.stats.killed, 1, '탈락 집계')
  eq(out.stats.phantom, 1, 'phantom 집계')
  eq(out.decision, 'Approve', '남은 지적이 없으면 Approve')
})

test('CRITICAL 규칙 위반은 검증자가 깎아도 major로 되돌아온다', async () => {
  const out = await run({
    'review:security': { findings: [finding({ critical_rule: true })] },
    'review:correctness': { findings: [] },
    'review:architecture': { findings: [] },
    'verify:security': { verdicts: [verdict(0, { severity_correction: 'nit' })] },
    summary: SUMMARY,
  })
  eq(out.findings[0].severity, 'major', '심각도 바닥')
  eq(out.decision, 'Changes Requested', 'major가 남으면 Changes Requested')
})

test('CRITICAL 규칙이 아니면 검증자의 하향이 그대로 먹는다', async () => {
  const out = await run({
    'review:security': { findings: [finding({ critical_rule: false })] },
    'review:correctness': { findings: [] },
    'review:architecture': { findings: [] },
    'verify:security': { verdicts: [verdict(0, { severity_correction: 'nit' })] },
    summary: SUMMARY,
  })
  eq(out.findings[0].severity, 'nit', '바닥이 없는 지적은 내려가야 한다')
  eq(out.decision, 'Approve', 'nit만 남으면 Approve')
})

test('critical이 하나라도 있으면 Blocked', async () => {
  const out = await run({
    'review:security': { findings: [finding({ severity: 'critical' })] },
    'review:correctness': { findings: [] },
    'review:architecture': { findings: [] },
    'verify:security': { verdicts: [verdict(0)] },
    summary: SUMMARY,
  })
  eq(out.decision, 'Blocked', '판정')
})

test('리뷰 에이전트가 죽은 차원은 결과 없이 넘어간다', async () => {
  const out = await run({
    'review:correctness': { findings: [finding({})] },
    // security, architecture 없음 → null
    'verify:correctness': { verdicts: [verdict(0)] },
    summary: SUMMARY,
  })
  eq(out.findings.length, 1, '살아있는 차원의 결과는 남는다')
  ok(
    out.logs.some((m) => m.includes('리뷰 에이전트 실패')),
    '실패한 차원을 로그에 드러내야 한다'
  )
})

test('packDir이 없으면 즉시 멈춘다', async () => {
  let threw = false
  try {
    await makeWorkflow(() => {}, pipeline, parallel, () => {}, () => {}, {}, {}, () => {})
  } catch {
    threw = true
  }
  ok(threw, 'args.packDir 없이 돌면 안 된다')
})

// ── 실행 ──────────────────────────────────────────────────────────────────

for (const [name, fn] of tests) {
  try {
    await fn()
    passed += 1
    console.log('  ok   ' + name)
  } catch (e) {
    failures.push(name)
    console.log('  FAIL ' + name)
    console.log('       ' + e.message)
  }
}

console.log(`\npassed: ${passed}, failed: ${failures.length}`)
process.exit(failures.length ? 1 : 0)
