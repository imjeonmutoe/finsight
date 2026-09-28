export const meta = {
  name: 'review-code',
  description: 'FinSight 변경분을 3개 차원으로 병렬 리뷰하고 차원마다 반박 검증한다',
  whenToUse: '/review-code 커맨드가 diff 팩을 만든 뒤 호출한다. 직접 부르지 마라 — args.packDir이 필요하다.',
  phases: [
    { title: 'Review', detail: 'correctness / security / architecture 3개 차원 동시 리뷰' },
    { title: 'Verify', detail: '차원별 반박 검증 — 리뷰가 끝난 차원부터 즉시 시작' },
    { title: 'Summarize', detail: 'walkthrough·잘된 점·다음 액션 종합' },
  ],
}

// ── 입력 ──────────────────────────────────────────────────────────────────
// 스크립트에는 파일시스템 접근이 없다. diff 팩 생성과 타임스탬프는 /review-code 커맨드가
// 바깥에서 하고 args로 넘긴다.
const P = args || {}
if (!P.packDir) throw new Error('args.packDir 없음. /review-code 커맨드가 팩을 먼저 만들어야 한다.')

const PACK = P.packDir
const BASE = P.base || 'merge-base(main)'
const HEAD = P.head || 'HEAD'
const DIFF = PACK + '/diff.patch'
const FILES = PACK + '/files.txt'

const BT = '`' // 백틱. 템플릿 리터럴 안에서 코드 스팬을 만들 때 쓴다.

const DIMENSIONS = [
  { key: 'correctness', agentType: 'review-correctness', label: '정확성' },
  { key: 'security', agentType: 'review-security', label: '보안·프라이버시' },
  { key: 'architecture', agentType: 'review-architecture', label: '아키텍처' },
]

// ── 스키마 ────────────────────────────────────────────────────────────────
const SEVERITIES = ['critical', 'major', 'minor', 'nit']

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string', description: '리포 루트 기준 상대 경로' },
          line: { type: 'integer', description: '변경 후 파일의 줄 번호' },
          severity: { type: 'string', enum: SEVERITIES },
          critical_rule: {
            type: 'boolean',
            description: 'CLAUDE.md가 `CRITICAL:`로 표시한 규칙의 위반이면 true. 이 값이 true면 심각도가 major 아래로 내려가지 않는다',
          },
          title: { type: 'string', description: '한 줄 제목' },
          tldr: { type: 'string', description: '왜 문제인지 한 문장' },
          good: { type: 'string', description: '이 코드가 잘한 부분. 없으면 빈 문자열' },
          fix: { type: 'string', description: '고칠 코드. 설명이 아니라 코드' },
          failure_scenario: { type: 'string', description: '구체적 입력/상황 → 잘못된 결과' },
        },
        required: ['file', 'line', 'severity', 'critical_rule', 'title', 'tldr', 'good', 'fix', 'failure_scenario'],
      },
    },
  },
  required: ['findings'],
}

const VERDICTS_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: '검증 대상 지적의 번호' },
          refuted: { type: 'boolean', description: '반박에 성공했으면 true' },
          phantom: { type: 'boolean', description: '지적한 코드가 워크스페이스에 실재하지 않으면 true' },
          reason: { type: 'string', description: '반박 근거 또는 유지 근거' },
          severity_correction: { type: 'string', enum: SEVERITIES, description: '심각도가 과장·축소됐을 때만 채운다' },
        },
        required: ['id', 'refuted', 'reason'],
      },
    },
  },
  required: ['verdicts'],
}

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    walkthrough: { type: 'string', description: '이 변경이 무엇을 하는지 2~3줄' },
    good_points: { type: 'array', items: { type: 'string' }, description: '실제로 잘된 점. 없으면 빈 배열' },
    next_actions: { type: 'array', items: { type: 'string' }, description: '작성자가 다음에 할 일. 3개 이내' },
  },
  required: ['walkthrough', 'good_points', 'next_actions'],
}

// ── 프롬프트 ──────────────────────────────────────────────────────────────
function reviewPrompt(d) {
  return [
    '리뷰 대상 diff: ' + DIFF,
    '변경 파일 목록: ' + FILES,
    '베이스 ' + BASE + ' → ' + HEAD + '.',
    '',
    'git 명령을 다시 실행하지 마라. diff는 이미 위 파일에 떠 있다.',
    'diff.patch는 2000줄을 넘을 수 있다. Read의 offset을 옮겨가며 끝까지 읽어라.',
    '',
    '너는 ' + d.label + ' 차원만 본다. 다른 차원은 다른 에이전트가 동시에 보고 있으므로',
    '네 체크리스트 밖의 것을 지적하면 중복이 되거나 노이즈가 된다.',
    '지적할 게 없으면 findings를 빈 배열로 반환하라.',
  ].join('\n')
}

function verifyPrompt(d, found) {
  const listed = found
    .map((f, i) => [
      '[' + i + '] ' + f.file + ':' + f.line + ' (' + f.severity + (f.critical_rule ? ', CRITICAL 규칙' : '') + ') ' + f.title,
      '    주장: ' + f.tldr,
      '    실패 시나리오: ' + f.failure_scenario,
    ].join('\n'))
    .join('\n')

  return [
    '아래는 ' + d.label + ' 리뷰어가 보고한 지적 ' + found.length + '건이다. 너는 반박자다.',
    '각 항목을 통과시키는 게 아니라 무너뜨리는 것이 네 일이다.',
    '',
    listed,
    '',
    '검증 방법: ' + DIFF + ' 와 해당 소스 파일 원본을 직접 읽어라. 너는 읽기 전용이다.',
    '리뷰어가 diff만 보고 문맥을 놓쳤을 수 있다 — 호출부, 타입 정의, 기존 테스트를 확인하라.',
    '',
    '먼저 phantom부터 걸러라. 지적한 file:line의 코드가 **워크스페이스 실제 파일에 존재하는지**',
    '직접 열어 확인하라. diff 헤더의 줄 번호를 잘못 읽었거나, 삭제된 줄을 지적했거나,',
    '존재하지 않는 함수·필드를 지어냈으면 phantom=true, refuted=true로 기각하고',
    'reason에 실제로 그 위치에 무엇이 있는지 적어라. diff에 보인다는 것만으로는 실재의 근거가 아니다.',
    '',
    '판정 기준:',
    '- 실패 시나리오가 실제로 재현되지 않으면 refuted=true.',
    '- 이미 다른 곳에서 방어되고 있으면 refuted=true.',
    '- 확신이 서지 않으면 refuted=true로 기울여라. 근거 없는 지적을 통과시키는 비용이,',
    '  애매한 지적을 놓치는 비용보다 크다.',
    '- 심각도가 과장·축소됐으면 severity_correction에 맞는 값을 적어라.',
    '  critical = 데이터 유출·금전 손실·데이터 손상이 실제로 일어난다.',
    '  major = 기능이 틀린다. minor = 규칙 위반이지만 동작은 맞다. nit = 취향.',
    '- 위 목록에서 [CRITICAL 규칙]으로 표시된 항목은 심각도 바닥이 걸려 있다.',
    '  severity_correction으로 minor·nit을 적어도 코드가 major로 되돌린다. 내리려고 시도하지 마라.',
    '  규칙 위반 자체가 성립하지 않는다고 보면 심각도를 낮추지 말고 refuted=true로 기각하라.',
    '  심각도를 깎아 무마하는 것과 기각하는 것은 다른 판단이다. 둘 중 하나를 골라라.',
    '',
    '모든 항목에 대해 id를 붙여 verdict를 반환하라. 빠뜨리지 마라.',
  ].join('\n')
}

function summaryPrompt(findings) {
  const listed = findings.length
    ? findings.map((f) => '- [' + f.severity + '] ' + f.file + ':' + f.line + ' — ' + f.title).join('\n')
    : '(확정된 지적 없음)'

  return [
    '변경 파일 목록: ' + FILES,
    '리뷰 대상 diff: ' + DIFF,
    '베이스 ' + BASE + ' → ' + HEAD + '.',
    '',
    '검증을 통과한 지적:',
    listed,
    '',
    '세 가지를 써라.',
    '1. walkthrough — 이 변경이 무엇을 하는지 2~3줄. 지적을 나열하지 마라. 변경의 의도와 범위다.',
    '2. good_points — 실제로 잘된 점 2~3개. 억지로 만들지 마라. 없으면 빈 배열.',
    '3. next_actions — 작성자가 다음에 할 일. 위 지적 중 critical/major 중심으로 3개 이내.',
    '   지적이 없으면 머지해도 된다는 취지의 한 줄만.',
    '',
    '전부 한국어로 써라.',
  ].join('\n')
}

// ── 판정 로직 (코드로 계산한다. LLM에게 집계를 시키지 않는다) ─────────────────
const SEV_RANK = { critical: 0, major: 1, minor: 2, nit: 3 }
const rank = (s) => (s in SEV_RANK ? SEV_RANK[s] : 9)

// 심각도 바닥: CRITICAL 규칙 위반은 major 아래로 못 내린다.
// 검증자가 깎으려 해도, 아예 검증이 못 돌아도 여기서 되돌린다.
const floorSev = (f, sev) => (f.critical_rule && rank(sev) > rank('major') ? 'major' : sev)

function applyVerdicts(d, found, res) {
  if (!res || !res.verdicts) {
    log(d.key + ': 검증 에이전트 실패 — ' + found.length + '건을 미검증 상태로 통과시킨다')
    return {
      kept: found.map((f) => ({ ...f, severity: floorSev(f, f.severity), dims: [d.key], verified: false })),
      raw: found.length,
      killed: 0,
      phantom: 0,
      unverified: found.length,
      failed: 0,
    }
  }
  const byId = new Map(res.verdicts.map((v) => [v.id, v]))
  const kept = []
  let killed = 0
  let phantom = 0
  let floored = 0
  let unverified = 0
  found.forEach((f, i) => {
    const v = byId.get(i)
    // 검증자가 이 id를 빠뜨렸으면 아무도 반박을 시도하지 않은 것이다. 통과로 세지 않는다.
    if (!v) unverified += 1
    // phantom은 '지적한 코드가 워크스페이스에 없다'는 판정이다. 실재하지 않는 것을
    // 리포트에 남길 수 없으므로 refuted를 켜지 않았더라도 기각한다. 스키마상 둘은
    // 독립이라, 묶지 않으면 통과 + 기각의 합이 raw를 넘는 집계 모순이 생긴다.
    if (v && (v.phantom || v.refuted)) {
      if (v.phantom) phantom += 1
      killed += 1
      return
    }
    const asked = v && v.severity_correction ? v.severity_correction : f.severity
    const sev = floorSev(f, asked)
    if (sev !== asked) floored += 1
    kept.push({ ...f, severity: sev, dims: [d.key], verified: Boolean(v) })
  })
  const tail =
    (phantom ? ' (phantom ' + phantom + '건 포함)' : '') +
    (floored ? ', 바닥 복원 ' + floored + '건' : '') +
    (unverified ? ', 판정 누락 ' + unverified + '건' : '')
  log(d.key + ': ' + found.length + '건 중 ' + killed + '건 반박 탈락' + tail + ', ' + kept.length + '건 확정')
  return {
    kept: kept,
    raw: found.length,
    killed: killed,
    phantom: phantom,
    unverified: unverified,
    failed: 0,
  }
}

// 같은 줄에 두 차원이 **다른** 문제를 짚는 일이 있다. file:line만으로 묶으면 그중 하나가
// 본문째 사라진다. 제목까지 키에 넣어 글자 그대로 같은 지적만 합친다.
// 대가: 같은 문제를 다르게 표현하면 둘 다 남아 PR에 비슷한 코멘트가 두 개 달린다.
// 중복 노출보다 지적 유실이 나쁘다고 보고 이쪽을 택했다.
function dedupe(list) {
  const byKey = new Map()
  for (const f of list) {
    const key = f.file + ':' + f.line + ':' + f.title
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, f)
      continue
    }
    const winner = rank(f.severity) < rank(prev.severity) ? f : prev
    const loser = winner === f ? prev : f
    winner.dims = Array.from(new Set(winner.dims.concat(loser.dims)))
    byKey.set(key, winner)
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const s = rank(a.severity) - rank(b.severity)
    if (s !== 0) return s
    if (a.file !== b.file) return a.file < b.file ? -1 : 1
    return a.line - b.line
  })
}

// ── 렌더링 ────────────────────────────────────────────────────────────────
const EMOJI = { critical: '🔴', major: '🟠', minor: '🟡', nit: '⚪' }

function renderInline(f) {
  const dims = f.dims.join(', ')
  const flag = f.verified ? '' : ' *(미검증)*'
  return [
    '**' + f.file + ':' + f.line + '**  `' + dims + '`' + flag,
    '[' + EMOJI[f.severity] + ' ' + f.severity + '] ' + f.title,
    'TL;DR: ' + f.tldr,
    '✓ Good: ' + (f.good || '—'),
    '→ Fix: ' + BT + f.fix + BT,
  ].join('\n')
}

function renderSummary(decision, counts, findings, summary, stats) {
  const tally = SEVERITIES.map((s) => EMOJI[s] + ' ' + s + ' ' + counts[s]).join(' · ')
  // '검증 통과'는 반박 검증을 실제로 받고 살아남은 건수다. 판정이 누락된 건은 여기서 빠진다.
  const pass =
    '(검증 통과 ' +
    (stats.passed - stats.unverified) +
    '/' +
    stats.raw +
    (stats.unverified ? ', 미검증 ' + stats.unverified : '') +
    (stats.phantom ? ', phantom 기각 ' + stats.phantom : '') +
    ')'
  const blocking = findings.filter((f) => f.severity === 'critical' || f.severity === 'major')

  const out = []
  out.push('# Layer 2 — 전체 요약')
  out.push('')
  out.push('## 판정: ' + decision)
  out.push('')
  out.push(tally + '   ' + pass)
  if (stats.failed) {
    out.push('')
    out.push(
      '> ⚠️ **차원 ' + stats.failed + '개가 미실행이다.** 그 차원은 한 번도 보지 않았으므로 ' +
        '여기 없는 문제가 없다는 뜻이 아니다. 재실행을 권한다.'
    )
  }
  out.push('')
  out.push('### 변경 요약')
  out.push(summary ? summary.walkthrough : '(종합 에이전트 실패)')
  out.push('')

  const goods = summary && summary.good_points ? summary.good_points : []
  if (goods.length) {
    out.push('### 잘된 점')
    goods.forEach((g) => out.push('- ' + g))
    out.push('')
  }

  out.push('### 짚어야 할 것 (critical / major)')
  if (blocking.length) {
    blocking.forEach((f) =>
      out.push(
        '- ' + EMOJI[f.severity] + ' [' + f.dims.join('][') + '] ' + f.file + ':' + f.line + ' — ' + f.title
      )
    )
  } else {
    out.push('- 없음')
  }
  out.push('')

  const actions = summary && summary.next_actions ? summary.next_actions : []
  if (actions.length) {
    out.push('### 다음 액션')
    actions.forEach((a, i) => out.push(String(i + 1) + '. ' + a))
  }
  return out.join('\n')
}

function renderInlineLayer(findings) {
  const out = ['# Layer 1 — 인라인']
  if (!findings.length) {
    out.push('')
    out.push('없음.')
    return out.join('\n')
  }
  let currentFile = null
  findings
    .slice()
    .sort((a, b) => (a.file !== b.file ? (a.file < b.file ? -1 : 1) : a.line - b.line))
    .forEach((f) => {
      if (f.file !== currentFile) {
        currentFile = f.file
        out.push('')
        out.push('## ' + currentFile)
      }
      out.push('')
      out.push(renderInline(f))
    })
  return out.join('\n')
}

// ── 실행 ──────────────────────────────────────────────────────────────────
log('리뷰 대상: ' + BASE + ' → ' + HEAD + ' / 팩: ' + PACK)

const reviewed = await pipeline(
  DIMENSIONS,
  (d) =>
    agent(reviewPrompt(d), {
      agentType: d.agentType,
      label: 'review:' + d.key,
      phase: 'Review',
      schema: FINDINGS_SCHEMA,
    }),
  (review, d) => {
    const clean = { kept: [], raw: 0, killed: 0, phantom: 0, unverified: 0, failed: 0 }
    if (!review) {
      // 이 차원은 한 번도 안 봤다. '지적 0건'과 같은 값을 돌려주면 안 된다 —
      // 그러면 보안 리뷰가 통째로 빠진 PR에 Approve가 붙는다.
      log(d.key + ': 리뷰 에이전트 실패 — 이 차원은 결과 없음')
      return { ...clean, failed: 1 }
    }
    const found = review.findings || []
    if (!found.length) {
      log(d.key + ': 지적 0건')
      return clean
    }
    return agent(verifyPrompt(d, found), {
      agentType: 'review-verify',
      label: 'verify:' + d.key,
      phase: 'Verify',
      schema: VERDICTS_SCHEMA,
    }).then((res) => applyVerdicts(d, found, res))
  }
)

const parts = reviewed.filter(Boolean)
// 스테이지가 예외로 끝난 차원은 pipeline이 null로 떨군다. filter가 지워 버리면
// 로그조차 남지 않으므로, 사라진 개수를 여기서 세어 미실행에 합친다.
const dropped = reviewed.length - parts.length
if (dropped) log(dropped + '개 차원이 예외로 중단됐다')
const stats = parts.reduce(
  (a, r) => ({
    raw: a.raw + r.raw,
    passed: a.passed + r.kept.length,
    killed: a.killed + r.killed,
    phantom: a.phantom + r.phantom,
    unverified: a.unverified + r.unverified,
    failed: a.failed + r.failed,
  }),
  { raw: 0, passed: 0, killed: 0, phantom: 0, unverified: 0, failed: dropped }
)
const findings = dedupe(parts.flatMap((r) => r.kept))

const counts = { critical: 0, major: 0, minor: 0, nit: 0 }
findings.forEach((f) => {
  if (f.severity in counts) counts[f.severity] += 1
})

// 차원이 하나라도 안 돌았으면 '깨끗하다'고 말할 근거가 없다. Approve만은 못 준다.
const decision =
  counts.critical > 0
    ? 'Blocked'
    : counts.major > 0
      ? 'Changes Requested'
      : stats.failed > 0
        ? 'Incomplete'
        : 'Approve'
log('확정 ' + findings.length + '건 → 판정 ' + decision + (stats.failed ? ' (미실행 차원 ' + stats.failed + '개)' : ''))

phase('Summarize')
const summary = await agent(summaryPrompt(findings), {
  agentType: 'review-summary',
  label: 'summary',
  phase: 'Summarize',
  schema: SUMMARY_SCHEMA,
})

const summaryMd = renderSummary(decision, counts, findings, summary, stats)
const inlineMd = renderInlineLayer(findings)

return {
  decision: decision,
  counts: counts,
  stats: stats,
  findings: findings,
  summaryMd: summaryMd,
  inlineMd: inlineMd,
  markdown: summaryMd + '\n\n---\n\n' + inlineMd,
}
