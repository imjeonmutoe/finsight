#!/usr/bin/env node
/**
 * .claude/workflows/lighthouse-loop.js 정지 조건 테스트.
 *
 * test-review-workflow.mjs와 같은 방식: 파일을 함수 본문으로 감싸고 agent()만 가짜로 바꾼다.
 * 실험 결과를 고정하면 "연속 N번 미개선이면 멈춘다"가 결정론적으로 검사된다.
 *
 * 돌리는 법: node scripts/test-lighthouse-workflow.mjs
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = readFileSync(join(ROOT, '.claude/workflows/lighthouse-loop.js'), 'utf-8')

const makeWorkflow = new Function(
  'return async function (agent, pipeline, parallel, log, phase, args, budget, workflow) {\n' +
    SRC.replace('export const meta', 'const meta') +
    '\n}'
)()

const v = (status, score = 80, ref = 80) => ({ status, score, ref_score: ref, delta: score - ref, description: status, reason: '' })

// 첫 호출은 기준선, 이후는 실험 순서대로 응답한다. 응답이 다 떨어지면 discard.
async function runWith(responses, args) {
  const queue = [...responses]
  const prompts = []
  const agent = async (prompt) => {
    prompts.push(prompt)
    return queue.length ? queue.shift() : v('discard')
  }
  const result = await makeWorkflow(agent, null, null, () => {}, () => {}, args, null, null)
  return { result, prompts }
}

const tests = {
  async '연속 미개선이 patience에 닿으면 plateau로 멈춘다'() {
    const { result } = await runWith([v('keep'), v('discard'), v('crash'), v('discard')], { patience: 3 })
    assert.equal(result.stopped, 'plateau')
    assert.equal(result.trials, 3)
  },
  async 'keep이 나오면 미개선 카운트가 0으로 돌아간다'() {
    const seq = [v('keep'), v('discard'), v('discard'), v('keep', 85), v('discard'), v('discard'), v('discard')]
    const { result } = await runWith(seq, { patience: 3 })
    assert.equal(result.stopped, 'plateau')
    assert.equal(result.trials, 6)
    assert.equal(result.kept.length, 1)
  },
  async 'maxTrials에서 멈춘다'() {
    const seq = [v('keep'), ...Array.from({ length: 10 }, () => v('keep'))]
    const { result } = await runWith(seq, { patience: 3, maxTrials: 4 })
    assert.equal(result.stopped, 'max-trials')
    assert.equal(result.trials, 4)
  },
  async '실험 점수가 100이고 keep이면 멈춘다'() {
    const { result } = await runWith([v('keep'), v('keep', 100, 97)], { patience: 3 })
    assert.equal(result.stopped, 'perfect')
  },
  async '에이전트가 죽으면 미개선으로 센다'() {
    const { result } = await runWith([v('keep'), null, null], { patience: 2 })
    assert.equal(result.stopped, 'plateau')
  },
  async '기준선이 keep이 아니면 실험을 시작하지 않는다'() {
    const { result, prompts } = await runWith([v('crash')], {})
    assert.equal(result.stopped, 'baseline-failed')
    assert.equal(prompts.length, 1)
  },
  async '앞선 실험 내역을 다음 프롬프트에 넘긴다'() {
    const first = { ...v('discard'), description: '폰트 preload' }
    const { prompts } = await runWith([v('keep'), first], { patience: 2 })
    assert.match(prompts[2], /폰트 preload/)
  },
}

let failed = 0
for (const [name, fn] of Object.entries(tests)) {
  try {
    await fn()
    console.log(`ok   ${name}`)
  } catch (e) {
    failed++
    console.log(`FAIL ${name}\n     ${e.message}`)
  }
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
