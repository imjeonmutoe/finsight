export const meta = {
  name: 'lighthouse-loop',
  description: 'Lighthouse 성능 점수를 autoresearch 방식으로 올린다 — 실험 하나씩, 오르면 커밋 아니면 되돌림',
  whenToUse: '/lighthouse-loop 커맨드가 브랜치를 판 뒤 호출한다. 지침은 docs/LIGHTHOUSE_LOOP.md.',
  phases: [
    { title: 'Baseline', detail: '기준 점수와 기준 스크린샷' },
    { title: 'Experiment', detail: '한 번에 하나씩 — 측정이 겹치면 서로의 점수를 깎는다' },
  ],
}

// ── 입력 ──────────────────────────────────────────────────────────────────
// patience: 연속으로 이만큼 keep이 없으면 멈춘다 ("더 안 오를 때까지")
// maxTrials: 폭주 방지 상한
const P = args || {}
const PATIENCE = P.patience || 5
const MAX_TRIALS = P.maxTrials || 30

const BT = '`'
const TRIAL = 'python3 scripts/lighthouse_loop.py'

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['keep', 'discard', 'crash', 'error'], description: 'trial 출력 JSON의 status 그대로' },
    score: { type: 'number', description: 'trial 출력의 score (후보)' },
    ref_score: { type: 'number', description: 'trial 출력의 ref_score (같은 시간대에 잰 HEAD)' },
    delta: { type: 'number', description: 'trial 출력의 delta' },
    description: { type: 'string', description: 'trial에 넘긴 설명' },
    reason: { type: 'string', description: 'trial 출력의 reason' },
  },
  required: ['status', 'score', 'ref_score', 'delta', 'description', 'reason'],
}

// ── 기준선 ────────────────────────────────────────────────────────────────
phase('Baseline')
const baseline = await agent(
  [
    '지금 브랜치의 Lighthouse 기준선을 잡는다. 코드는 고치지 마라.',
    `1. ${BT}${TRIAL} status${BT}를 돌린다. status가 keep인 행이 이미 있으면 그 행으로 아래 형식을 채워 반환한다(status는 keep).`,
    `2. 없으면 ${BT}${TRIAL} trial baseline${BT}을 Bash 타임아웃 600000으로 돌리고 출력 JSON(한 줄)을 읽는다. 빌드·측정 로그는 ${BT}.autoresearch/lighthouse/run.log${BT}에 있으니 실패했을 때만 꼬리를 본다.`,
    `3. 기준 스크린샷을 찍는다: 경로 /, /login, /demo, /privacy 각각 ${BT}OUT=.autoresearch/lighthouse/baseline-<이름>.png bash scripts/preview-shot.sh <경로>${BT} (이름은 root, login, demo, privacy). 이미 있으면 건너뛴다.`,
  ].join('\n'),
  { label: '기준선', phase: 'Baseline', schema: VERDICT_SCHEMA, effort: 'low' },
)
if (!baseline || baseline.status !== 'keep') {
  return { stopped: 'baseline-failed', baseline }
}
log(`기준선 ${baseline.score.toFixed(1)}점 (A/A 차이 ${baseline.delta.toFixed(1)})`)

// ── 실험 루프 ──────────────────────────────────────────────────────────────
const history = []
let last = baseline.score
let stale = 0
let stopped = 'max-trials'

const experimentPrompt = (n) =>
  [
    `Lighthouse 성능 autoresearch 루프의 실험 #${n}이다. 최근 측정에서 HEAD는 약 ${last.toFixed(1)}점(공개 4개 화면 성능 평균)이었다.`,
    '판정은 절대 점수가 아니라 같은 시간대에 번갈아 잰 HEAD 대비 차이로 한다. 머신 부하에 따라 절대 점수는 몇 점씩 흐른다.',
    `${BT}docs/LIGHTHOUSE_LOOP.md${BT}를 먼저 읽어라 — 할 수 있는 것·하지 말 것·평가 방식이 거기 있다.`,
    '',
    '순서:',
    `1. ${BT}${TRIAL} status${BT}와 ${BT}.autoresearch/lighthouse/results.tsv${BT}로 이미 해 본 것을 확인한다. 같은 실험을 반복하지 마라.`,
    `   ${BT}.autoresearch/lighthouse/last.json${BT}(마지막 Lighthouse 리포트)의 audit에서 점수를 깎는 항목을 찾는다.`,
    '2. 가설 하나를 골라 코드를 고친다. 한 실험에 한 가지 아이디어만.',
    `3. 화면에 영향이 있을 수 있으면 ${BT}bash scripts/preview-shot.sh <경로>${BT}로 찍어 ${BT}.autoresearch/lighthouse/baseline-*.png${BT}와 비교한다. 보이는 차이가 있으면 고쳐서 없애거나, 아이디어를 버린다.`,
    `4. ${BT}${TRIAL} trial "<무엇을 왜 바꿨는지 한 줄>"${BT}을 Bash 타임아웃 600000으로 돌린다(5~9분 걸린다). 이 명령이 커밋·되돌림을 알아서 한다. 네가 직접 커밋하거나 되돌리지 마라.`,
    '   status가 crash이고 원인이 오타·import 누락 같은 사소한 것이면 고쳐서 한 번 더 돌려도 된다. 아이디어 자체가 틀렸으면 그대로 끝낸다.',
    '5. trial 출력 JSON의 마지막 줄을 그대로 옮겨 반환한다. 숫자를 고쳐 적지 마라.',
    '',
    history.length
      ? '이번 실행에서 이미 해 본 것:\n' + history.map((h, i) => `- #${i + 1} ${h.status} ${h.delta >= 0 ? '+' : ''}${h.delta.toFixed(1)} — ${h.description}`).join('\n')
      : '이번 실행의 첫 실험이다.',
  ].join('\n')

phase('Experiment')
for (let n = 1; n <= MAX_TRIALS; n++) {
  const r = await agent(experimentPrompt(n), { label: `실험 #${n}`, phase: 'Experiment', schema: VERDICT_SCHEMA })
  if (!r) {
    stale++
    log(`#${n} 에이전트 실패 — 개선 없음으로 센다 (${stale}/${PATIENCE})`)
  } else {
    history.push(r)
    // error(실험 안 함)·crash는 측정값이 0이라 HEAD 점수로 쓰면 다음 지시문에 "약 0.0점"이 찍힌다
    if (r.status === 'keep') last = r.score
    else if (r.status === 'discard') last = r.ref_score
    if (r.status === 'keep') {
      stale = 0
    } else {
      stale++
    }
    log(`#${n} ${r.status} 기준 ${r.ref_score.toFixed(1)} → ${r.score.toFixed(1)} · 연속 미개선 ${stale}/${PATIENCE} — ${r.description}`)
  }
  if (r && r.status === 'keep' && r.score >= 100) {
    stopped = 'perfect'
    break
  }
  if (stale >= PATIENCE) {
    stopped = 'plateau'
    break
  }
}

return {
  stopped,
  baseline: baseline.score,
  last,
  trials: history.length,
  kept: history.filter((h) => h.status === 'keep').map((h) => `+${h.delta.toFixed(1)} ${h.description}`),
}
