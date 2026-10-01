# 프로젝트: FinSight

CSV로 받은 카드 명세서·은행 거래내역을 Claude API로 분석해 개인 지출을 보여주는 SaaS.

> 이 파일과 `CLAUDE.md`는 같은 규칙을 담는다. Codex는 `AGENTS.md`를, Claude Code는 `CLAUDE.md`를
> 자동으로 읽는다. **규칙을 고치면 두 파일을 함께 고쳐라.** 한쪽만 고치면 에이전트마다 다른 규칙으로
> 움직인다.

## 기술 스택

버전은 ADR-010에 따라 의도적으로 고정돼 있다. **임의로 올리지 마라.**

Next 16은 학습 데이터와 관례가 다르다. Next API·파일 규칙(미들웨어 위치, 라우트 시그니처 등)을
건드리기 전에 `node_modules/next/dist/docs/`의 해당 가이드를 읽고, 사용 중단 경고를 무시하지 마라.
이유: 규칙이 틀려도 `next build`는 통과한다. 미들웨어를 리포 루트에 두면 조용히 무시되어
세션 갱신이 통째로 사라진다. (`next dev`가 AGENTS.md에 같은 경고를 자동으로 덧붙이던 것을
`next.config.ts`의 `agentRules: false`로 끄고 두 규칙 파일에 직접 옮겼다.)

- Next.js 16.3.4 (App Router)
- React 19.2.8
- TypeScript 5.9.3 strict mode + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`
- Tailwind CSS v4 (4.3.3) — `@theme` 토큰만 사용. v3 문법은 v4에서 에러 없이 조용히 무시된다
- Vitest 4.1.11 / ESLint 9.39.5 / zod 4.5.4
- Supabase (Auth / Postgres / Storage)
- Anthropic Claude API — 컬럼 매핑·카테고리 분류는 플랜 무관 `claude-sonnet-5`. AI 인사이트는 **Free도 `claude-sonnet-5`로 생성**하고 Pro만 `claude-opus-5`를 쓴다 (ADR-015)
- Polar **샌드박스** (구독 결제) — `sandbox-api.polar.sh`. 프로덕션 토큰을 쓰지 않는다
- Vercel (배포)

## 아키텍처 규칙
- CRITICAL: 모든 외부 API 호출(Claude, Supabase service role, Polar)은 서버에서만 한다. `src/app/api/` 라우트 핸들러 또는 Server Component/Server Action에서만 호출하고, 클라이언트 컴포넌트에서 직접 호출하지 않는다.
- CRITICAL: `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`은 절대 `NEXT_PUBLIC_` 접두사를 붙이지 않는다. 클라이언트 번들에 들어가면 즉시 유출이다.
- CRITICAL: 집계·통계·탐지는 전부 코드(TypeScript 순수 함수 또는 SQL)로 계산한다. LLM에게 합계·평균·비율을 계산시키지 않는다. LLM의 역할은 (1) CSV 컬럼 매핑 추론, (2) 거래 카테고리 분류, (3) 이미 계산된 숫자를 설명하는 문장 생성 — 이 세 가지뿐이다.
- CRITICAL: 카테고리 분류는 **3단 순서**를 지킨다. ① `merchant_rules`(사용자가 수정해 만든 규칙) ② 내장 가맹점 규칙 사전(`src/lib/merchant-rules.ts`) ③ 위 둘이 못 잡은 것만 Claude 배치 분류. 순서를 바꾸거나 단계를 건너뛰지 않는다. 이유: ①②는 결정론적이고 비용이 0이며 테스트 가능하다. 전량 LLM으로 돌리면 같은 가맹점이 배치마다 다르게 분류될 수 있다.
- CRITICAL: 금액은 원 단위 정수(`bigint` / TS `number` 정수)로만 다룬다. 부동소수점 금액 금지.
- CRITICAL: 저장 금액은 0 이상 절댓값이고 `kind`로 지출·수입·환불·이체를 구분한다. 총지출은 지출-환불이며 수입·이체를 포함하지 않는다.
- CRITICAL: 모든 사용자 데이터 테이블과 Storage 버킷에 RLS를 건다. RLS 없는 테이블을 만들지 않는다.
- CRITICAL: `profiles`는 사용자의 자기 행 SELECT만 허용한다. 플랜·만료일·Polar ID를 클라이언트가 INSERT/UPDATE/DELETE할 수 없게 권한을 철회한다.
- CRITICAL: 매핑용 LLM 입력은 원본 헤더·행이 아닌 `SanitizedMappingInput`만 허용한다.
- CRITICAL: AI 인사이트는 `insight_cache`를 먼저 읽고, 미스일 때만 모델을 호출한다. 캐시를 우회하는 인사이트 호출 경로를 만들지 마라. 이유: 대시보드가 Server Component라 페이지를 열 때마다 모델이 돌아간다. LLM 호출량 쿼터 시스템(`llm_usage`·lease·사용량 예약·429/503)은 이 캐싱으로 대체했으므로 **만들지 마라** (ADR-012).
- CRITICAL: `kind`는 매핑에서 결정론적으로 도출하며 NOT NULL이다. 사용자 확인 단계나 `kind=null` 미확정 상태를 만들지 마라. 수정은 `PATCH /api/transactions/[id]`가 담당한다 (ADR-013).
- CRITICAL: 거래 중복은 카드/계좌 출처 안에서 판정한다. 파일 내 순번으로 파일 간 정상 거래를 자동 병합하지 않는다. 상세 규약은 `docs/ARCHITECTURE.md`를 따른다.
- 카테고리는 `src/types/category.ts`의 고정 목록(12개)을 벗어나지 않는다. 새 카테고리를 임의로 추가하지 않는다.
- CRITICAL: 모든 UI 문구·에러 메시지·빈 상태 문구는 **한국어**로 쓴다. 영문을 병기하지 않는다. `<html lang="ko">`를 세우고, `body`에 `word-break: keep-all`과 `overflow-wrap: break-word`를 함께 적용한다. 이유: `keep-all`이 없으면 한글이 어절 중간에서 잘려 문법적으로 틀린 위치에서 줄바꿈된다. 상세 규칙은 `docs/UI_GUIDE.md`의 `## 한국어 타이포그래피`.
- 한글에 `uppercase`·`tracking-tight`·`tracking-wide`·`font-light`를 쓰지 않는다. 라틴 타이포 관용구이며 한글에서는 효과가 없거나 깨져 보인다.
- CRITICAL: 금융 데이터를 로그에 남기지 마라. 거래 내용·가맹점명·금액을 `console.log`하지 않는다. 에러 로그에는 행 내용 대신 **행 번호**만 남긴다. Vercel 함수 로그도 유출 경로다.
- CRITICAL: `dangerouslySetInnerHTML`을 쓰지 마라. LLM 출력에는 사용자가 올린 CSV에서 온 임의 문자열이 섞일 수 있다. React 기본 이스케이프가 유일한 XSS 방어선이다.
- CRITICAL: RLS를 믿되 라우트 핸들러 쿼리에도 `user_id` 조건을 명시하라. RLS 정책을 나중에 잘못 고쳐도 한 겹이 남는다.
- 디렉토리: 페이지·API는 `src/app/`, UI는 `src/components/`, 타입은 `src/types/`, 순수 유틸과 집계 쿼리는 `src/lib/`(집계 쿼리만 I/O 예외이며 Supabase 클라이언트를 주입받아 쓰고 모듈 안에서 생성하지 않는다), 외부 API 래퍼는 `src/services/`.

## 개발 프로세스
- CRITICAL: 새 기능 구현 시 반드시 테스트를 먼저 작성하고, 테스트가 통과하는 구현을 작성할 것 (TDD)
- CRITICAL: 훅이 테스트 없는 소스 파일 작성을 막는다. `src/components/*.tsx`, `src/lib/*.ts`, `src/services/*.ts`, `src/app/api/**/route.ts`를 만들기 전에 같은 디렉토리에 `<이름>.test.ts(x)`를 먼저 만들어라. (`page.tsx`, `layout.tsx`, `src/types/*`, 설정 파일은 면제). 자세한 동작은 아래 `## 에이전트 하네스`.
- Stop 훅이 매 세션 종료 시 `npm run lint && npm run build && npm run test`를 실행한다. 세 개 모두 통과하는 상태로 끝내라.
- CRITICAL: UI(화면·컴포넌트·스타일)를 만졌으면 **렌더된 화면을 실제로 보고** 끝낸다. `bash scripts/preview-shot.sh <경로>`로 스크린샷을 찍고 그 PNG를 열어 확인한다. 이유: Tailwind v4는 잘못된 문법을 에러 없이 조용히 무시하므로 `npm run build` 통과가 화면이 맞다는 뜻이 아니다. Chrome을 못 찾으면 건너뛰지 말고 사용자에게 확인을 요청한다.
- UI 작업 전에 `docs/UX_GUIDE.md`를 읽는다. 화면 순서·단계 전환·빈 상태와 실패 상태의 다음 행동을 정한다. 스타일 값은 `docs/UI_GUIDE.md`가, 레이아웃은 `finsight-design` 스킬이 정한다.
- UI를 검증할 때는 `docs/BROWSER_TESTS.md`의 시나리오를 따른다. 화면별 통과 기준과 각 항목이 어느 step에서 열리는지가 거기 있다. **macOS의 Chrome 창은 폭 500px 밑으로 내려가지 않는다** — 좁은 폭 검증은 CDP 뷰포트 에뮬레이션으로만 되고, Chrome 확장도 `preview-shot.sh`도 못 한다. 테마는 확장으로 `localStorage` 경로를 직접 태운다 (문서의 `## 실행 방법`).
- 커밋 메시지는 conventional commits 형식을 따를 것 (feat:, fix:, docs:, refactor:, chore:)
- 작업을 마치면 커밋하고 push까지 한다. 기본 브랜치(main)에 직접 커밋하지 말고 브랜치를 먼저 판다.

## 에이전트 하네스

이 리포는 codex와 Claude Code 양쪽에서 돌아간다. 훅 스크립트(`scripts/hooks/`)는 공유하고,
설정 파일만 에이전트별로 둔다.

| | codex | Claude Code |
|---|---|---|
| 규칙 파일 | `AGENTS.md` | `CLAUDE.md` |
| 훅 설정 | `.codex/hooks.json` | `.claude/settings.json` |
| step 실행 | `python3 scripts/execute.py <phase> --push` (기본) | `python3 scripts/execute.py <phase> --push --agent claude` |

훅 설정의 스키마는 양쪽이 같다 (`{"hooks": {"<이벤트>": [{"matcher": ..., "hooks": [...]}]}}`).
훅에 들어오는 페이로드도 같은 wire 포맷이다 (`tool_name`, `tool_input`, `permissionDecision` 등).

### TDD 가드가 두 겹인 이유

- `scripts/hooks/tdd-guard.sh` — **PreToolUse**. 쓰기를 선제적으로 막는다.
  Claude의 `tool_input.file_path`, codex `apply_patch`의 패치 헤더, 셸 리다이렉션(`>`·`>>`·`tee`)을 본다.
- `scripts/hooks/tdd-backstop.sh` — **PostToolUse**(codex 전용). 명령어가 아니라 작업트리를 본다.
  HEAD 이후 변경·추가된 파일 중 테스트 없는 소스가 있으면 지적한다.

백스톱이 필요한 이유: codex는 파일을 쓸 때 `apply_patch`를 쓰지 않고 셸로 직행하는 경우가 많고,
그 셸 명령이 `python3 -c "Path(...).write_text(...)"` 같은 형태일 수 있다. 명령어 텍스트 검사로는
원리적으로 전부 잡을 수 없다. 백스톱은 쓰기 자체를 막지는 못하지만, 쓴 직후에 잡아 테스트를
먼저 쓰게 만든다.

Claude Code는 `Write`/`Edit` 툴로 파일을 쓰므로 PreToolUse 가드만으로 충분해
`.claude/settings.json`에는 백스톱을 걸지 않았다.

훅을 고쳤으면 회귀 테스트를 돌려라:

```bash
bash scripts/hooks/test-tdd-guard.sh
bash scripts/hooks/test-tdd-backstop.sh
```

### codex 훅 신뢰

codex는 처음 보는 훅을 실행하기 전에 사용자 검토를 요구한다. 대화형 세션에서는 한 번 신뢰해 주면
되고, `scripts/execute.py`는 비대화형이라 `--dangerously-bypass-hook-trust`를 붙여 실행한다.

### 리뷰 자동화 — 세 층

| 층 | 언제 | 무엇을 보나 | LLM |
|---|---|---|---|
| `scripts/githooks/pre-commit` | 커밋마다 (~1초) | CRITICAL 규칙 중 텍스트로 확정되는 6종 | ✗ |
| `.github/workflows/review-code.yml` | PR 열림·푸시 | `/review-code` 전체 (에이전트 7개) | ✓ |
| `/review-code` 수동 | 페이즈 끝, 올리기 전 | 위와 같은 것 | ✓ |

**LLM 리뷰를 커밋 훅에 넣지 마라.** 리뷰의 단위는 `merge-base(main)..HEAD` 브랜치 전체이고
에이전트 7개에 수 분이 걸린다. 커밋은 하루에 수십 번 일어난다. 단위도 비용도 맞지 않는다.

pre-commit이 보는 것은 **스테이지된 추가 줄**뿐이고, 주석 줄과 테스트·문서·`scripts/`는
검사하지 않는다. 이유: 이미 리포에 있던 코드나 규칙을 적어 둔 주석으로 남의 커밋을 막으면,
훅은 그날로 `--no-verify`로 우회되고 그 순간 잡던 것도 같이 못 잡게 된다.

git 훅은 `.git/hooks`에 있어 커밋되지 않는다. 클론한 뒤 한 번 설치해야 한다:

```bash
git config core.hooksPath scripts/githooks
```

`scripts/hooks/`(에이전트 훅)와 `scripts/githooks/`(git 훅)는 다른 것이다. 섞지 마라.

### 자동 승인·머지 게이트

리뷰가 끝나면 `review-code.yml`의 `gate` 잡이 **심각도만 보고** 승인·머지를 정한다.
판정과 집계는 `/review-code` 워크플로우가 이미 코드로 계산한 값이고, 게이트는 그 숫자를 읽어
행동만 고른다 — 여기에 LLM은 없다.

| 남은 지적 | 행동 |
|---|---|
| 없음 · ⚪ nit만 | 승인 + **머지**(merge commit, 브랜치는 남긴다) |
| 🟡 minor가 하나라도 (critical·major는 0) | **승인만.** 머지는 사람이 한다 |
| 🔴 critical · 🟠 major 하나라도 | **승인도 머지도 하지 않는다** |
| 판정이 `Incomplete` (차원 미실행) | 아무것도 하지 않는다 — '모르겠다'는 '깨끗하다'가 아니다 |

틀리는 쪽은 항상 '아무것도 안 함'이다. 판정을 모르겠으면 머지하지 않는다.

**게이트를 리뷰 잡과 분리한 이유.** 리뷰 에이전트는 신뢰할 수 없는 입력(남의 diff·주석)을
읽는다. 같은 잡에 `contents: write`를 주면 PR에 심긴 지시문 하나로 머지·푸시 권한이 샌다.
`gate`는 LLM을 전혀 띄우지 않으므로, 쓰기 권한을 여기에 몰아 두면 에이전트와 토큰이 영영
만나지 않는다. **리뷰 잡에 쓰기 권한을 주는 식으로 두 잡을 합치지 마라.**

**판정 전달은 마커로 한다.** `.claude/workflows/review-code.js`가 요약 본문 끝에
`<!-- finsight-review {"decision":…,"counts":…,"stats":…} -->`를 찍고, `scripts/merge_gate.py`가
그것만 읽는다. 한국어 본문을 파싱하지 않으므로 요약 문구를 고쳐도 게이트는 그대로 돈다.
대신 **마커 형식을 고치면 양쪽을 함께 고쳐라** — 정규식이 두 곳(JS 테스트와 `MARKER_RE`)에 있다.

마커를 못 읽으면 게이트는 **exit 3으로 죽는다.** 리뷰는 올라왔는데 판정을 못 읽는 것은
파이프라인이 깨진 것이고, 조용히 넘기면 그때부터 게이트가 없는 것과 같다.

**마커가 둘 이상이어도 exit 3이다** — 한 본문 안에서든, 이번 실행의 리뷰·코멘트 전체에서든.
리뷰 잡의 에이전트는 PR 쓰기 토큰을 쥐고 신뢰할 수 없는 diff를 읽으므로, 위조 마커를 요약에
옮겨 적거나 코멘트로 하나 더 달 수 있다. 어느 쪽이 진짜인지 고르지 않는다. 같은 이유로 마커를
찍는 쪽(`review-code.js`·`pr_review_payload.py`)은 LLM이 쓴 문자열의 `<!--`를 `&lt;!--`로 바꾼다.

**자동 머지를 막는 탈출구는 draft PR이다.** draft는 리뷰 잡의 `if`에서 걸러지므로 게이트도
돌지 않는다. 라벨 같은 별도 장치를 만들지 마라.

**게이트 잡은 `main`을 체크아웃한다.** 리뷰 잡이 `.claude/`를 main 것으로 되돌리므로 마커를
**찍는 쪽**은 CI에서 언제나 main 것이 돈다. 읽는 쪽(`scripts/merge_gate.py`)만 PR head로 두면
마커 형식을 바꾸는 PR에서 새 파서가 옛 마커를 읽는 **버전 엇갈림**이 생긴다. 계약의 양쪽을
같은 ref에 묶어 둔 것이다. 대가는 **게이트를 고치는 PR이 자기 게이트를 검증하지 못한다**는 것 —
머지된 뒤부터 적용된다. 그 PR에서 게이트 잡이 빨간불인 것은 정상이다.

### CI에 이미 물려 있는 것

고치기 전에 이유를 읽어라. 셋 다 **실패해도 빨간불이 안 뜨는** 종류의 함정이다.

- Stop 훅 커맨드 앞에 `[ -n "$GITHUB_ACTIONS" ] && exit 0;` 가드가 붙어 있다
  (`.claude/settings.json`·`.codex/hooks.json` 양쪽). CI에서 훅이 `lint && build && test`를 돌면,
  실패를 본 에이전트가 **읽기 전용이어야 할 리뷰 잡에서 PR 브랜치를 고치기 시작한다.**
  `--settings`로는 못 끈다 — 병합만 되고 덮어쓰기가 안 된다(실측). 그래서 훅 안에서 가드한다.
- `fetch-depth: 0`. 얕은 클론이면 `git merge-base main HEAD`가 실패해 팩이 비고,
  `/review-code`는 "리뷰할 변경이 없다"며 **정상 종료**한다. 리뷰 0건에 초록불이 붙는다.
- `ref: head.ref` (커밋 SHA 아님). SHA로 체크아웃하면 detached HEAD가 되어 `gh pr view`가
  PR을 못 찾고, 리뷰가 PR이 아니라 워크플로우 로그로만 간다.
- 리뷰는 `claude-code-action`이 아니라 **`claude -p`로 직접** 돌린다. 액션은 SDK의 첫 `result`
  메시지에서 루프를 끊어, 에이전트가 리뷰 워크플로우를 백그라운드로 넘기고 턴을 끝내면 세션이
  그 자리에서 정리된다(PR #11·#12가 4턴·수 초 만에 success, 리뷰 0건). `claude -p`는 백그라운드
  작업이 끝날 때까지 기다린다. `owasp-scan.yml`도 같은 방식이다. 액션으로 되돌리지 마라.
- **바로 앞 스텝이 `.claude/`·`.mcp.json`·`CLAUDE.md` 등을 main 것으로 되돌린다**(PR head는
  신뢰하지 않는다). `claude -p`는 작업 디렉터리의 `settings.json` 훅·env·`.mcp.json`을 권한 확인보다
  먼저 실행하므로, 이 스텝 없이 돌리면 PR에 훅 하나를 심는 것으로 GH_TOKEN을 쥔 잡에서 임의 코드가
  돈다. 액션을 쓸 때는 액션이 해 주던 일이다(경로 목록도 액션의 `SENSITIVE_PATHS` 그대로).
  이 스텝은 fetch하지 않는다 — `--depth`로 다시 받으면 위의 얕은 클론 함정에 그대로 빠진다.
  즉 PR에서 고친 커맨드·에이전트·훅 설정은 **머지된 뒤부터** CI에 적용된다.
  워크플로우 파일(`.github/workflows/`)만 PR head 것이 쓰인다. 그래서 정말 중요한 지시는
  워크플로우의 `PROMPT`에도 한 번 더 적어 둔다.
- GitHub 토큰은 `GH_TOKEN`(`secrets.GITHUB_TOKEN`) 하나다. 워크플로우의 `permissions` 그대로
  `contents:read`·`pull-requests:write`이고, 액션처럼 OIDC로 Claude GitHub App 토큰(`contents:write`)을
  받는 경로가 없다. 그래서 `id-token: write`도 두지 않는다.
- 워크플로우를 띄우자마자 "백그라운드로 시작했습니다"로 턴을 끝내면 **리뷰 0건에 초록불**이
  붙는다. 실제로 CI 첫 성공 실행이 그랬다(잡 success, PR 리뷰·코멘트 0건). 두 겹으로 막는다 —
  커맨드 2단계의 "완료 알림 전에 턴을 끝내지 마라"와, 잡 마지막의 `리뷰가 PR에 실제로
  올라왔는지 확인` 스텝(이번 실행이 올린 것만 시각 기준으로 센다). 지시는 어길 수 있지만
  검증 스텝은 못 어긴다.

판정이 Blocked여도 잡은 통과한다. 머지 여부는 사람이 정한다. 잡이 빨간불인 것은
리뷰가 **돌지 못했다**는 뜻이므로 재실행하라.

- 리포 설정 **"Allow GitHub Actions to create and approve pull requests"가 켜져 있어야 한다**
  (`gh api repos/{owner}/{repo}/actions/permissions/workflow` → `can_approve_pull_request_reviews`).
  꺼져 있으면 `gate` 잡의 승인이 422로 거절된다. 리포 밖에 있는 설정이라 코드를 아무리 읽어도
  안 보이고, 리포를 새로 만들면 꺼진 채로 시작한다.

필요한 리포 시크릿은 `CLAUDE_CODE_OAUTH_TOKEN` 하나다 (`claude setup-token`으로 발급).
fork PR에는 GitHub이 시크릿을 주지 않으므로 잡이 아예 뜨지 않게 걸러 둔다.

## 명령어

```bash
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run test     # 테스트 (vitest run)
bash scripts/preview-shot.sh [경로]   # 빌드 후 headless Chrome 스크린샷. PNG 경로를 출력한다

# 하네스 스크립트 자체의 테스트 (pytest는 uv로 임시 설치해 돌린다)
uv run --with pytest python -m pytest scripts/ -q
bash scripts/hooks/test-tdd-guard.sh
bash scripts/hooks/test-tdd-backstop.sh
bash scripts/githooks/test-pre-commit.sh   # git pre-commit 훅
node scripts/test-review-workflow.mjs   # /review-code 워크플로우 후처리
```
