# Step 3: auth-flow

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — **`## 인증 (Supabase SSR)` 섹션이 이 step의 사양서다.** 그리고 `## 화면 인벤토리`의 S2, `## 패턴`의 지연 생성 규칙
- `/CLAUDE.md` — CRITICAL 규칙 (특히 `NEXT_PUBLIC_` 금지, `user_id` 명시)
- 이전 step 산출물: `supabase/migrations/0001_init.sql`(profiles 트리거 확인), `src/types/billing.ts`

## 작업

담당 화면: **S2** (`/login` — Google 버튼 하나).

### 1. `src/services/supabase.ts` — 클라이언트 3종

패키지는 **`@supabase/ssr`**. 구 `@supabase/auth-helpers-nextjs`가 아니다.

```ts
createBrowserSupabase()      // Client Component용
createServerSupabase()       // Server Component / Route Handler용 (쿠키 어댑터 포함)
createServiceSupabase()      // service role — 웹훅 등 사용자 컨텍스트 없는 곳 전용
```

**전부 함수 안에서 클라이언트를 만든다.** 모듈 최상위에서 `createClient()`를 호출하면 환경변수 없이 도는 `next build`가 깨지고, Stop 훅이 매 세션 실패한다.

쿠키 어댑터는 **`getAll` / `setAll`** 시그니처를 쓴다. 구버전 `get`/`set`/`remove`가 아니다.

### 2. `middleware.ts` (프로젝트 루트)

**세션 갱신의 핵심이다. 여기가 틀리면 로그인이 조용히, 산발적으로 풀린다.**

- `getClaims()`로 토큰을 갱신한다
- 갱신된 쿠키를 **`request.cookies.set`과 `response.cookies.set` 양쪽에** 기록한다
  - `request.cookies.set` → 이 요청의 Server Component가 새 토큰을 본다
  - `response.cookies.set` → 브라우저가 새 토큰을 저장한다
  - **한쪽만 쓰면 세션이 산발적으로 끊긴다**
- `setAll`에서 캐시 제어 헤더를 걸어 CDN이 세션 쿠키를 캐싱하지 않게 한다
- 비로그인 상태로 `/dashboard/*` 접근 시 `/login`으로 리디렉트
- **matcher에서 `/api/billing/webhook`을 제외한다.** 인증 미들웨어에 걸리면 Polar 요청이 리디렉트되어 웹훅이 영원히 실패한다. 정적 파일(`_next/static`, `_next/image`, favicon)도 제외한다

### 3. `/login` (S2)

Google OAuth 버튼 하나. UI_GUIDE의 Primary 버튼 스타일을 쓴다.
`redirectTo`는 **서버에서 고정한 값**을 쓴다 — URL 파라미터나 사용자 입력에서 받지 마라(오픈 리디렉트).
개인정보처리방침 링크(`/privacy`)를 버튼 아래 작게 둔다. 페이지 자체는 step 10에서 만들므로 여기서는 링크만.

### 4. `/auth/callback/route.ts`

OAuth 코드를 세션으로 교환하고 `/dashboard`로 리디렉트. 실패 시 `/login?error=...`로 보낸다.
`profiles` 행은 step 2의 DB 트리거가 자동 생성하므로 여기서 만들지 않는다. 단 트리거가 없는 경우를 대비해 존재 확인 후 없으면 삽입하는 폴백은 넣어도 좋다.

### 5. `/dashboard/page.tsx` 스텁

로그인 성공을 확인할 최소 화면. 실제 대시보드는 step 8에서 만든다.
`/dashboard/loading.tsx`와 `/dashboard/error.tsx`도 함께 만든다(TDD 가드 면제 대상).

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
```

**TDD 가드 주의: `middleware.ts`와 `src/app/auth/callback/route.ts`는 테스트 파일이 먼저 있어야 작성할 수 있다.** `middleware.test.ts`, `route.test.ts`를 같은 디렉토리에 먼저 만들어라. (`page.tsx`·`loading.tsx`·`error.tsx`는 면제)

미들웨어 테스트에 반드시 포함할 것:
- 쿠키가 `request`와 `response` **양쪽에** 기록되는지
- `/api/billing/webhook`이 matcher에서 제외되는지

수동 확인:
```bash
npm run dev
# /login → Google 로그인 → /dashboard 진입
# 로그아웃 상태로 /dashboard 직접 접근 → /login 리디렉트
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. Supabase에 Google OAuth provider가 설정돼 있지 않으면 → `"status": "blocked"`, `"blocked_reason": "Supabase 대시보드에서 Google OAuth provider 활성화 필요. Google Cloud Console에서 OAuth 클라이언트 발급 후 리디렉트 URI 등록 필요"` 후 즉시 중단.
3. 아키텍처 체크리스트:
   - `@supabase/ssr`를 쓰는가? (`auth-helpers`가 아닌가)
   - 쿠키 어댑터가 `getAll`/`setAll`인가?
   - 미들웨어가 쿠키를 양쪽에 쓰는가?
   - 클라이언트 생성이 전부 함수 안에서 일어나는가?
   - matcher에서 웹훅 경로가 빠졌는가?
4. `phases/0-mvp/index.json`의 step 3을 업데이트한다.

## 금지사항

- `@supabase/auth-helpers-nextjs`를 쓰지 마라. 이유: 현재 권장 패키지는 `@supabase/ssr`이고 쿠키 API 시그니처가 다르다.
- 쿠키를 `response`에만 쓰지 마라. 이유: 이번 요청의 Server Component는 갱신 전 토큰을 보게 되어 산발적으로 로그아웃된다. 재현이 어려워 디버깅에 오래 걸리는 종류의 버그다.
- 모듈 최상위에서 Supabase 클라이언트를 만들지 마라. 이유: 환경변수 없이 도는 `next build`가 깨지고 Stop 훅이 매번 실패한다.
- `redirectTo`를 URL 파라미터에서 받지 마라. 이유: 오픈 리디렉트 취약점이다.
- 이메일/비밀번호 로그인을 만들지 마라. 이유: MVP는 Google OAuth만이다. 비밀번호 재설정·검증 화면이 딸려온다.
- 대시보드 실제 내용을 만들지 마라. 이유: step 8의 작업이다. 여기서는 로그인 확인용 스텁만.
