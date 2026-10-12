# Step 1: supabase-config

## 배경

이 phase는 Supabase Branching(GitHub 연동, PR마다 프리뷰 DB + Vercel 프리뷰 배포)을 도입한다. Branching은
리포의 `supabase/config.toml`로 프리뷰 브랜치의 Auth·시드 설정을 정한다. 지금 리포에는 이 파일이 없다.

Supabase 문서(GitHub integration)가 정한, **PR을 프로덕션에 머지할 때** `config.toml`의 동작:

- `config.toml`에 선언한 **Storage 버킷과 Edge Function은 프로덕션에 배포된다.**
- API·Auth 설정과 시드 파일은 프로덕션에서 기본적으로 무시된다.

이 프로젝트의 `statements` 버킷과 정책은 마이그레이션이 이미 만들었다. 그래서 `config.toml`에 버킷·함수를 적으면
프로덕션 설정을 덮어쓸 수 있다. 이 step은 **프리뷰 브랜치에만 영향을 주는 최소 구성**을 만든다.

프리뷰 로그인은 비밀번호 방식이다(Google OAuth는 브랜치마다 콜백 주소가 바뀌어 쓸 수 없다). 로그인 UI는 step 3이,
테스트 사용자는 step 2의 `seed.sql`이 만든다. 이 step은 프리뷰 브랜치에서 이메일·비밀번호 로그인이 켜져 있게만 한다.

## 읽어야 할 파일

- `/CLAUDE.md` — CRITICAL 규칙
- `/docs/ARCHITECTURE.md` — 디렉토리 구조
- `supabase/migrations/` — 이전 step에서 14자리 타임스탬프 이름으로 바뀌었다. 버킷이 마이그레이션에서 만들어진다는 것을 확인한다
- `src/lib/migration-files.test.ts` — 이전 step 산출물
- `.env.example` — 앱이 쓰는 Supabase 환경변수 이름
- `src/app/login/actions.ts` — OAuth 리다이렉트가 `origin`으로 만들어지는 방식

## 작업

### 1. 테스트 먼저 — `src/lib/supabase-config.test.ts`

TOML 파서를 의존성으로 추가하지 않는다(ADR-010: 버전 고정·의존성 최소). 텍스트로 확인한다:

- `[storage.buckets` 로 시작하는 섹션이 없다
- `[functions` 로 시작하는 섹션이 없다
- `[db.seed]` 섹션에 `enabled = true`, `sql_paths = ["./seed.sql"]`가 있다
- `[auth.external.google]` 섹션이 없다 (프리뷰에서 Google OAuth를 쓰지 않는다)
- `[auth.email]`에서 비밀번호 로그인이 켜져 있고, `enable_signup = false`다 (프리뷰에서 가입을 막는다)

실패 메시지는 한국어로, 각 규칙의 이유(특히 "버킷·함수는 머지하면 프로덕션에 배포된다")를 담는다.

### 2. `supabase/config.toml`

- `project_id = "finsight"`
- `[db] major_version` — Supabase MCP `execute_sql`(읽기 전용)로 `show server_version;`을 조회해 원격과 같은 major로 맞춘다
- `[db.seed] enabled = true`, `sql_paths = ["./seed.sql"]` — `seed.sql`은 step 2가 만든다
- `[auth] site_url` — 프로덕션 도메인
- `[auth] additional_redirect_urls` — 프로덕션 `/auth/callback`과 **Vercel 프리뷰 도메인 와일드카드**
  (`https://*-<팀슬러그>.vercel.app/**` 형태)
- `[auth.email] enable_signup = false`, 비밀번호 로그인 허용, 이메일 확인 끔(시드 사용자는 이미 확인된 상태로 만든다)

**Vercel 팀 슬러그와 프로덕션 도메인은 `vercel` CLI로 찾는다** — `.vercel/project.json`, `vercel whoami`,
`vercel teams ls`, `vercel project ls`, `vercel domains ls` 등. CLI가 없거나 로그인돼 있지 않거나 값을 확정할 수 없으면
추측하지 말고 `blocked`로 둔다. 찾은 값과 어떤 명령으로 찾았는지 `summary`에 적는다.

각 섹션 위에 왜 그 값인지 한 줄 주석을 단다. 특히 버킷·함수를 일부러 적지 않은 이유를 파일 맨 위 주석에 적는다.

### 3. Vercel 연동 환경변수 이름 확인 (보고만)

Supabase–Vercel 연동이 프리뷰 배포에 넣어 주는 변수 이름(`mcp__supabase__search_docs`로 확인)과 `.env.example`의
`NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY`가 같은지 비교해 `summary`에
적는다. 다르면 코드를 고치지 말고 차이만 적는다 — step 5의 문서가 사람이 할 설정으로 옮긴다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - CLAUDE.md CRITICAL 규칙(비밀키에 `NEXT_PUBLIC_` 금지, 에이전트는 프로덕션 DB에 쓰지 않는다)을 위반하지 않았는가?
   - `config.toml`에 비밀값(키·시크릿)을 평문으로 적지 않았는가?
3. 결과에 따라 `phases/4-branching/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 찾은 팀 슬러그·도메인과 환경변수 이름 비교 결과를 포함
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - Vercel CLI로 값을 못 찾음 → `"status": "blocked"`, `"blocked_reason": "어떤 값이 왜 없는지"` 후 즉시 중단

## 금지사항

- `[storage.buckets.*]`와 `[functions.*]`를 적지 마라. 이유: 머지하면 프로덕션에 배포되어, 마이그레이션이 만든 `statements` 버킷 설정을 덮어쓸 수 있다.
- `[auth.external.google]`을 켜지 마라. 이유: 브랜치마다 콜백 주소가 바뀌어 Google Console에 등록할 수 없다. 켜 두면 프리뷰에서 실패하는 로그인 버튼만 남는다.
- 비밀값을 `config.toml`에 평문으로 넣지 마라. 이유: 커밋된다. 필요하면 `env(...)` 참조를 쓴다.
- `supabase link`, `supabase config push`, `supabase db push`처럼 원격에 쓰는 명령을 실행하지 마라. 이유: 에이전트는 프로덕션에 쓰지 않는다.
- Vercel 프로젝트·도메인·환경변수 설정을 바꾸지 마라. 이유: 이 step은 읽기만 한다.
- 기존 테스트를 깨뜨리지 마라
