# OWASP Top 10:2025 × FinSight 검토 기준

출처: <https://top10.owasp.org/2025/> (2026-10-01 확인). 카테고리마다 **자동**(`scan.py`가 보는 것)과
**수동**(서브에이전트가 읽어서 판단할 것)을 나눈다. 수동 항목은 자동이 원리적으로 못 잡는 것만 둔다.

**ADR과 충돌하는 권고를 내지 마라.** 리포트의 `fix`가 결정된 설계를 뒤집으면, 리포트를 믿고 고친
사람이 ADR을 깬다. 각 카테고리의 "권고 금지"가 그 목록이다. 정말 ADR이 틀렸다고 보면 지적은 남기되
`fix`에 "ADR-0XX 재검토 필요"라고 쓰고 코드를 제안하지 마라.

2021 대비: A03 공급망(신설, 2021 '취약한 구성요소'를 빌드·배포 체인 전체로 확장), A10 예외 처리(신설),
SSRF는 A01로 흡수, A02 설정 오류가 5위→2위.

---

## A01 접근 통제 실패

CWE-284·285·862·863(인가 누락·오류), 200·201(민감 정보 노출), 352(CSRF), **918(SSRF, 2025에 흡수)**.

**자동**: `rls-missing` · `profiles-write-grant` · `public-bucket` · `route-user-id`

**수동**
- 모든 `src/app/api/**/route.ts`: 세션에서 얻은 `user.id`로만 행을 고르는가. URL의 `[id]`를 받는
  라우트(`transactions/[id]`, `uploads/[id]`, `uploads/[id]/confirm`)는 **그 id가 내 것인지**를
  쿼리 조건으로 확인하는가 (IDOR). RLS만 믿고 service role 클라이언트를 쓰면 RLS가 꺼진다.
- service role 클라이언트(`src/services/supabase.ts`)를 쓰는 곳마다 `user_id` 조건이 있는가.
- `supabase/migrations/*.sql`: 정책의 `using`/`with check`가 `auth.uid() = user_id`인가.
  `security definer` 함수는 내부에서 `auth.uid()`를 검사하고 `search_path`를 고정했는가.
  `anon`·`authenticated`에 `execute`가 열린 함수가 남의 `user_id`를 인자로 받는가.
- Storage 정책: 경로 첫 세그먼트가 `auth.uid()`인지 확인하는가.
- `src/middleware.ts`·`src/app/auth/callback/route.ts`: 오픈 리디렉트(`next`·`redirect` 파라미터를
  그대로 쓰는가).
- SSRF: 서버가 사용자 입력 URL로 `fetch`하는 곳이 있는가.
- 계정 삭제(`account/data`): 다른 사용자 데이터까지 지울 수 있는 조건이 있는가.

**심각도**: 남의 거래가 읽히거나 바뀌는 경로 = `critical`. 방어선 하나가 빠졌지만 다른 층이 막는다 = `major`.

## A02 보안 설정 오류

CWE-16, 614·1004(쿠키 Secure·HttpOnly), 942(CORS), 489(디버그 코드), 526(환경변수 노출).

**자동**: `next-public-secret` · `client-server-boundary` · `env-tracked` · `polar-production` ·
`security-headers` · `source-maps` · `middleware-location`

**수동**
- `next.config.ts`·미들웨어의 응답 헤더. CSP가 있으면 `unsafe-inline`·`unsafe-eval` 여부.
- 라우트가 `Access-Control-Allow-Origin: *`를 돌려주는가.
- 서버 전용 모듈에 `import "server-only"`가 있는가(`src/services/*`). 없으면 클라이언트에서 import해도 빌드가 통과한다.
- `.env.example`에 실제 값이 들어 있지 않은가.
- 데모 경로(`/demo`, `src/lib/demo`)가 인증 없이 실데이터에 닿지 않는가.

## A03 소프트웨어 공급망 실패

CWE-1395·1104·1357·1329·1035. 2025년 Shai-Hulud npm 웜이 사례.

**자동**: `npm-audit` · `unpinned-dependency` · `lockfile-missing` · `action-unpinned`

**수동**
- `.github/workflows/`: `pull_request_target` 사용, fork PR에 시크릿 노출, 쓰기 권한이 LLM 잡과 같은 잡에 있는가
  (CLAUDE.md `## 자동 승인·머지 게이트` — 게이트 분리가 의도대로 유지되는지).
- `package.json`의 `postinstall` 등 설치 스크립트.

**권고 금지**: ADR-010이 고정한 eslint·vitest·typescript·@types/node의 메이저 업그레이드를 `fix`로 쓰지 마라.
`npm audit`이 그 패키지를 지목하면 "ADR-010 재검토 필요"로 쓴다. Next.js 패치 버전 업은 ADR-010 위반이 아니다
(Next는 최신을 쓰기로 했다) — 단 `fix`에 정확한 버전을 적고, 올리는 결정은 사용자에게 맡긴다.

## A04 암호화 실패

CWE-327·331·338(약한 알고리즘·PRNG), 319(평문 전송), 916.

**자동**: `weak-hash` · `weak-random` · `cleartext-http`

**수동**
- 웹훅 서명 비교가 상수 시간인가(SDK의 `validateEvent`를 쓰면 통과).
- 업로드 원본 CSV(Storage `statements`)의 보존 기간·삭제 경로 — 필요 이상으로 오래 남는가(ADR-004·008).
- 파일 해시(`file_hash`)를 보안 용도(무결성 증명)로 쓰는가, 중복 판정 용도로만 쓰는가. 후자면 지적하지 않는다.

## A05 인젝션

CWE-79(XSS)·89(SQL)·78·77·94·20·74. **2025판은 LLM 프롬프트 인젝션을 명시한다.**

**자동**: `dangerous-html` · `eval` · `postgrest-filter-interp`

**수동**
- **프롬프트 인젝션**: CSV 셀 내용(가맹점명·메모)이 분류·인사이트 프롬프트에 들어간다.
  ① 시스템 지시와 데이터가 구분되는가(구분자·JSON 필드) ② **모델 출력을 zod로 검증해 허용된 값만 쓰는가**
  — 분류 결과가 고정 12개(`src/types/category.ts`) 밖이면 버리는가, 인사이트의 숫자를 코드 계산값과 대조하는가.
  ③ 매핑 입력이 `SanitizedMappingInput`만 받는가(`src/lib/sanitize.ts`).
- SQL: 마이그레이션 함수의 `execute format(...)`·동적 SQL에 `%I`/`%L` 대신 `%s`를 쓰는가.
- **CSV 수식 인젝션**: 사용자 데이터를 CSV로 내보내는 경로가 있으면 `=`·`+`·`-`·`@`로 시작하는 셀을 막는가.
  (ADR-014로 리포트 내보내기는 없다. `account/data` 같은 데이터 내보내기가 있는지 확인)
- React 렌더 경로에서 `href={사용자값}`에 `javascript:` 스킴이 들어갈 수 있는가.

## A06 안전하지 않은 설계

CWE-256·269·434(위험한 파일 업로드)·501(신뢰 경계)·522·362(경쟁 상태)·602(클라이언트 측 강제).

**수동만 있다** (설계 결함은 패턴으로 안 잡힌다)
- 업로드: 크기·행 수·인코딩 상한(`src/lib/limits.ts`)이 **서버에서** 적용되는가. 확장자만 보고 믿는가.
- 플랜 판정: Pro 기능을 클라이언트 상태로 열지 않고 서버에서 `profiles.plan`·만료일로 판단하는가 (CWE-602).
- Free 월 1회 업로드 한도를 서버가 강제하는가.
- 결제: 체크아웃 성공 리디렉트만으로 플랜을 올리지 않고 **웹훅으로만** 올리는가.

**권고 금지** (ADR-012): `llm_usage` 테이블, 사용자별 lease, 사용량 예약, 429·`Retry-After`·503 경로,
동시 호출 락을 `fix`로 제안하지 마라. 같은 사용자의 동시 요청으로 모델이 몇 번 더 호출되는 것은
**감수하기로 결정된 트레이드오프**다 — 지적하지 마라. ADR-012가 남긴 상한(배치 50건, 입력 24,000 bytes,
`max_tokens=4096`, 재시도 2회, timeout 60초)이 **빠져 있으면** 그것은 지적한다.

## A07 인증 실패

CWE-287·798·259(하드코딩 자격증명)·384(세션 고정)·307·613.

**자동**: `hardcoded-secret` · `get-session`

**수동**
- 서버의 사용자 판단이 전부 `auth.getUser()`(또는 `getClaims()`)를 거치는가. 쿠키 값을 직접 디코드하지 않는가.
- `auth/callback`: `code` 교환 실패 시 세션 없이 보호 화면으로 보내지 않는가.
- 미들웨어가 세션 갱신 쿠키를 응답에 제대로 실어 보내는가(못 하면 세션이 조용히 만료된다).
- 로그아웃이 서버 세션을 끊는가.

## A08 소프트웨어·데이터 무결성 실패

CWE-502(역직렬화)·829·915(대량 할당)·345(진위 검증 부족)·494.

**자동**: `webhook-unverified`

**수동**
- 웹훅: 서명 검증 **전에** 본문을 파싱해 무언가를 쓰지 않는가. 같은 이벤트 재전송(리플레이)에 멱등한가.
- **대량 할당**: `PATCH /api/transactions/[id]`가 요청 본문을 그대로 `update()`에 넘기는가.
  zod로 허용 필드(`category`·`kind` 등)만 고르지 않으면 `user_id`·`amount`를 바꿀 수 있다.
- LLM 응답 JSON을 스키마 검증 없이 DB에 쓰는가.
- CI 게이트: 마커 파서(`scripts/merge_gate.py`)가 PR head가 아니라 main 것으로 도는가.

## A09 보안 로깅·알림 실패

CWE-778·117(로그 인젝션)·532(**로그의 민감 정보**)·223·221.

**자동**: `log-financial`

**수동**
- `console.*` 인자에 **객체 통째로**(`row`, `tx`, `body`, `error.cause`)를 넘겨 거래 내용이 딸려 나가는가.
  `pat2`에 안 걸리는 변수명이어도 내용이 금융 데이터면 지적한다.
- SDK 에러 객체를 그대로 로깅할 때 요청 본문(프롬프트 = 거래 내역)이 들어 있는가.
- 반대로 남겨야 할 것: 웹훅 서명 실패, 권한 거부 같은 보안 이벤트를 아무 흔적 없이 버리는가.

## A10 예외 상황 처리 미흡 (2025 신설)

CWE-209(에러 메시지 정보 노출)·636(**fail-open**)·476·234·274·252·755.

**자동**: `error-leak` · `empty-catch`

**수동**
- **fail-open**: 인증·플랜 조회가 실패했을 때 허용 쪽으로 흐르는가. 예: `profiles` 조회 에러 시 `plan`을 기본값으로 두고
  진행하는데 그 기본값이 `pro`인가.
- 업로드 확정(`confirm_upload` RPC)이 중간 실패 시 **전체 롤백**되는가, 일부 행만 남는가.
- 분류 배치가 모델 응답 일부만 유효할 때 나머지를 어떻게 처리하는가(잘못된 카테고리로 저장하지 않는가).
- `src/middleware.ts`의 자격증명 없음 분기처럼 **의도적으로** 삼키는 catch는 이유가 주석에 있으면 지적하지 않는다.

---

## 심각도 기준 (review-security와 같다)

- `critical` — 데이터 유출·금전 손실·데이터 손상이 **실제로 일어나는 경로**가 있다.
- `major` — 방어선이 없거나 기능이 틀렸다. **CLAUDE.md `CRITICAL:` 규칙 위반은 최소 major** (`critical_rule: true`).
- `minor` — 권장 강화 사항. 지금 뚫리지는 않는다.
- `nit` — 취향.

`failure_scenario`를 "누가 무엇을 해서 어떤 데이터가 어디로 새는가"로 못 쓰면 보고하지 마라.
