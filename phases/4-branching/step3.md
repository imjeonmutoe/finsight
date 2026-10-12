# Step 3: preview-login

## 배경

이 phase는 Supabase Branching을 도입해 PR마다 Vercel 프리뷰 앱과 프리뷰 DB를 한 쌍으로 만든다. 그런데 앱의 로그인은
Google OAuth 하나뿐이다(`src/app/login/actions.ts`). 프리뷰 브랜치는 브랜치마다 Supabase 주소가 달라서 Google
Console에 콜백(`https://<브랜치ref>.supabase.co/auth/v1/callback`)을 등록할 수 없고, 프리뷰에서는 OAuth가 실패한다.

그래서 **Vercel 프리뷰 배포에서만** 시드 테스트 계정(step 2의 `PREVIEW_ACCOUNTS`)으로 비밀번호 로그인하는 버튼을
띄운다. 프로덕션과 로컬 개발에서는 버튼도 서버 액션도 동작하지 않아야 한다.

## 읽어야 할 파일

- `/CLAUDE.md` — CRITICAL 규칙(서버 경계, 한국어 UI, UI 육안 검증)
- `/docs/UX_GUIDE.md` — 로그인 화면(S2)의 단일 목표 원칙
- `/docs/UI_GUIDE.md` — 토큰, 버튼 스타일, `## 한국어 타이포그래피`
- `/docs/BROWSER_TESTS.md` — `/login` 시나리오
- `src/app/login/actions.ts`, `src/app/login/actions.test.ts`, `src/app/login/page.tsx`
- `src/lib/preview-accounts.ts` — 이전 step 산출물 (`PREVIEW_ACCOUNTS`, `PREVIEW_PASSWORD`)
- `supabase/config.toml` — 이전 step 산출물. 프리뷰에서 이메일·비밀번호 로그인이 켜져 있다
- `scripts/preview-shot.sh` — 환경변수가 빌드·실행에 전달되는지

## 작업

### 1. 환경 판정 — `src/lib/preview-accounts.ts`에 추가

```ts
export function isPreviewDeployment(env?: NodeJS.ProcessEnv): boolean;   // env.VERCEL_ENV === "preview"일 때만 true
```

`VERCEL_ENV`는 Vercel이 서버에 넣는 값이다(`production` / `preview` / `development`). `NODE_ENV`나 호스트 이름으로 판정하지 않는다.
`preview-accounts.test.ts`에 `production`·`development`·미설정·`preview` 네 경우를 먼저 추가한다.

### 2. 서버 액션 — `src/app/login/actions.ts`에 추가

```ts
export async function signInAsPreviewAccount(formData: FormData): Promise<void>;
```

- **맨 먼저** `isPreviewDeployment()`가 false면 아무것도 하지 않고 `/login?error=preview`로 보낸다. 서버 액션은 화면에 버튼이 없어도 직접 호출할 수 있으므로, 렌더링 조건만으로 막지 않는다
- `formData`의 계정 id가 `PREVIEW_ACCOUNTS`에 있을 때만 진행한다. 이메일·비밀번호를 폼에서 받지 않는다 — 비밀번호는 서버 상수에서만 읽는다
- `signInWithPassword` 성공 → `/dashboard`, 실패 → `/login?error=preview`
- 실패해도 이메일·비밀번호·에러 본문을 로그에 남기지 않는다

`actions.test.ts`에 먼저 쓴다: 프로덕션 환경에서 Supabase 클라이언트가 **호출되지 않는다**, 목록에 없는 id는 거부된다,
성공·실패 리디렉트 경로, 폼에 비밀번호 필드를 넣어도 무시된다.

### 3. 화면 — `src/app/login/page.tsx`

- 서버에서 `isPreviewDeployment()`가 true일 때만, Google 버튼 아래에 구분된 영역을 렌더한다
  - 제목: `프리뷰 전용`
  - 설명: `이 화면은 미리보기 배포에서만 보입니다. 테스트 데이터가 들어 있는 계정으로 로그인합니다.`
  - 버튼 2개: `Free 테스트 계정으로 로그인하기`, `Pro 테스트 계정으로 로그인하기` — Google 버튼보다 한 단계 약한 보조 버튼 스타일
- `error=preview`면 기존 오류 문구와 같은 자리에 `테스트 계정으로 로그인하지 못했습니다. 프리뷰 DB에 시드가 들어갔는지 확인해 주세요.`
- 비밀번호는 페이지에 렌더하지 않는다. 폼에는 계정 id만 hidden으로 담는다
- S2의 단일 목표(Google 버튼) 원칙에 대한 예외라는 것을 페이지 상단 주석에 한 줄 덧붙인다

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
bash scripts/preview-shot.sh /login                      # 프로덕션 조건: 프리뷰 영역이 없어야 한다
VERCEL_ENV=preview bash scripts/preview-shot.sh /login   # 프리뷰 조건: 프리뷰 영역이 보여야 한다
```

`preview-shot.sh`가 환경변수를 넘기지 않으면 스크립트를 고치지 말고, 같은 효과를 내는 방법(예: 빌드 전에 export)을 쓰고 그 방법을 `summary`에 적는다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. **스크린샷 두 장을 실제로 연다.** `scripts/preview-shot.sh`가 출력한 PNG 경로를 Read로 열어 눈으로 확인한다. 찍기만 하고 넘어가지 마라. 확인할 것:
   - 프로덕션 조건 스크린샷에 `프리뷰 전용` 영역이 **없다**
   - 프리뷰 조건 스크린샷에서 Google 버튼이 여전히 주 버튼이고, 테스트 계정 버튼이 보조로 보인다
   - 라이트·다크 양쪽에서 대비가 깨지지 않는가 (테마는 `docs/BROWSER_TESTS.md`의 `## 실행 방법`대로)
   - 한글이 어절 중간에서 줄바꿈되지 않는가 (`word-break: keep-all`)
   - 하드코딩된 hex 없이 `docs/UI_GUIDE.md`의 토큰만 쓰였는가
   - 문구가 전부 한국어이고(플랜 이름 Free·Pro는 기존 화면과 같은 표기), 버튼은 동사형인가

   Chrome을 못 찾아 스크립트가 실패하면 **육안 검증을 건너뛰지 말고** `blocked`로 두고 사용자에게 확인을 요청한다.
3. 아키텍처 체크리스트를 확인한다:
   - Supabase 호출이 서버 액션에서만 일어나는가?
   - `PREVIEW_PASSWORD`가 클라이언트 번들에 없는가? `npm run build` 후 `grep -r "<비밀번호 값>" .next/static`이 비어야 한다 (값을 출력하지 말고 결과 유무만 본다)
4. 결과에 따라 `phases/4-branching/index.json`의 step 3을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - Chrome을 못 찾음 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 렌더링 조건만으로 막지 마라. 서버 액션 안에서도 `isPreviewDeployment()`를 확인하라. 이유: 서버 액션은 버튼 없이도 POST로 직접 호출된다.
- 이메일·비밀번호를 폼 입력으로 받지 마라. 이유: 프리뷰에서도 임의 계정 로그인 창구를 만들지 않는다. 시드 계정 두 개만 허용한다.
- `NODE_ENV`·호스트 이름·`NEXT_PUBLIC_*` 값으로 프리뷰를 판정하지 마라. 이유: `NEXT_PUBLIC_*`는 클라이언트에 노출되고 빌드 시점에 고정된다. 호스트 판정은 커스텀 도메인에서 틀린다.
- `signUp`을 호출하지 마라. 이유: 계정은 시드만 만든다. 로그인 실패 시 가입으로 폴백하면 프로덕션 Auth에 테스트 계정이 생길 수 있다.
- Google 로그인 흐름(`signInWithGoogle`)을 바꾸지 마라. 이유: 이 step의 범위가 아니다.
- 기존 테스트를 깨뜨리지 마라
