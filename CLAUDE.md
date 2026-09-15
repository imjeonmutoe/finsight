# 프로젝트: FinSight

CSV로 받은 카드 명세서·은행 거래내역을 Claude API로 분석해 개인 지출을 보여주는 SaaS.

> 이 파일과 `AGENTS.md`는 같은 규칙을 담는다. Claude Code는 `CLAUDE.md`를, Codex는 `AGENTS.md`를
> 자동으로 읽는다. **규칙을 고치면 두 파일을 함께 고쳐라.** 한쪽만 고치면 에이전트마다 다른 규칙으로
> 움직인다.

## 기술 스택

버전은 ADR-010에 따라 의도적으로 고정돼 있다. **임의로 올리지 마라.**

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

## 명령어
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run test     # 테스트 (vitest run)
bash scripts/preview-shot.sh [경로]   # 빌드 후 headless Chrome 스크린샷. PNG 경로를 출력한다

# 하네스 스크립트 자체의 테스트 (pytest는 uv로 임시 설치해 돌린다)
uv run --with pytest python -m pytest scripts/test_execute.py -q
bash scripts/hooks/test-tdd-guard.sh
bash scripts/hooks/test-tdd-backstop.sh
