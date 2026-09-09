# Step 0: project-setup

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — 디렉토리 구조, 패턴
- `/docs/UI_GUIDE.md` — `## 색상` 섹션의 `@theme` 토큰 정의 (여기 있는 CSS를 그대로 쓴다)
- `/docs/ADR.md` — ADR-007 (Tailwind v4 결정)
- `/CLAUDE.md` — 명령어, CRITICAL 규칙

이 step은 프로젝트의 첫 코드다. 이전 step 산출물은 없다.

## 작업

Next.js 15 프로젝트를 스캐폴딩하고 테스트 환경까지 갖춘다.

### 1. Next.js 15 + TypeScript strict + Tailwind v4

App Router, `src/` 디렉토리, TypeScript strict mode. Tailwind는 **v4**를 쓴다:
- PostCSS 플러그인은 `@tailwindcss/postcss` (v3의 `tailwindcss` 플러그인이 아니다)
- `src/app/globals.css`에 `@import "tailwindcss";`
- `tailwind.config.js`를 만들지 않는다. 테마는 CSS의 `@theme`로 정의한다

### 2. `src/app/globals.css`의 `@theme` 토큰

`/docs/UI_GUIDE.md`의 `## 색상 → 토큰 정의` 코드 블록을 **그대로** 옮긴다. `@theme` 블록의 라이트 값과 `[data-theme="dark"]` 블록의 다크 값 전부.

이걸 여기서 심어야 이후 step의 컴포넌트가 색을 하드코딩하지 않는다.

### 3. 테스트 환경 — vitest + jsdom + @testing-library/react

**이 항목을 빠뜨리면 step 7·8·9·10이 TDD 가드에 전부 막혀 진행이 불가능하다.**

- `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@vitejs/plugin-react`
- `vitest.config.ts`: `environment: 'jsdom'`, React 플러그인, `@/` 경로 별칭을 `tsconfig.json`과 일치시킬 것
- setup 파일에서 `@testing-library/jest-dom` 매처 등록
- **동작하는 샘플 테스트 1개**를 작성해 `npm test`가 실제로 통과하는지 확인한다 (예: `src/lib/__tests__/smoke.test.ts`)

### 4. `package.json` 스크립트 3종

`Stop` 훅이 매 세션 종료 시 아래 세 개를 순서대로 실행한다. **셋 다 존재하고 통과해야 한다.**

```json
"dev": "next dev",
"build": "next build",
"lint": "eslint .",
"test": "vitest run"
```

`test`는 반드시 `vitest run` (watch 모드가 아니어야 한다 — 훅이 영원히 멈춘다).

### 5. `.env.example`

값 없이 키 이름만:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
POLAR_ACCESS_TOKEN=
POLAR_WEBHOOK_SECRET=
POLAR_PRO_PRODUCT_ID=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 6. 최소 `src/app/layout.tsx` + `src/app/page.tsx`

빌드가 통과할 최소한만. 랜딩 실제 내용은 step 10에서 만든다.
`layout.tsx`의 `<head>`에 FOUC 방지 인라인 스크립트를 넣는다 — `localStorage`의 테마 값(없으면 `prefers-color-scheme`)을 읽어 hydration 전에 `<html>`의 `data-theme`을 세팅.
`<body>`에 `bg-bg text-text`를 적용해 토큰이 실제로 동작하는지 확인한다.

## Acceptance Criteria

```bash
npm run lint    # 에러 없음
npm run build   # 컴파일 에러 없음
npm test        # 샘플 테스트 통과
```

추가 확인:
```bash
# Tailwind v4 확인 — v3 플러그인이 잡히면 안 된다
grep -q '@tailwindcss/postcss' postcss.config.mjs && echo "v4 OK"
# tailwind.config.js가 없어야 한다
test ! -f tailwind.config.js && test ! -f tailwind.config.ts && echo "config 없음 OK"
# jsdom 설치 확인
node -e "require.resolve('jsdom')" && echo "jsdom OK"
```

## 검증 절차

1. 위 AC 커맨드를 전부 실행한다.
2. 아키텍처 체크리스트:
   - `src/app`, `src/components`, `src/types`, `src/lib`, `src/services` 디렉토리가 ARCHITECTURE.md 구조와 일치하는가?
   - `globals.css`의 `@theme` 토큰이 UI_GUIDE.md와 값까지 동일한가?
   - `.env.local`을 만들지 않았는가? (`.env.example`만 만든다)
3. 결과에 따라 `phases/0-mvp/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 산출물 한 줄 요약
   - 3회 시도 후에도 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 즉시 중단

## 금지사항

- `tailwind.config.js`를 만들지 마라. 이유: ADR-007에서 `@theme` CSS 방식을 택했다. 설정 파일이 있으면 두 곳에서 테마를 정의하게 된다.
- Tailwind v3를 설치하지 마라. 이유: UI_GUIDE의 모든 클래스가 v4 `@theme` 유틸리티(`bg-surface`)를 전제한다. v3에서는 이 클래스들이 존재하지 않는다.
- `npm test`를 watch 모드로 두지 마라. 이유: Stop 훅이 이 명령을 실행하는데 watch면 영원히 끝나지 않는다.
- `.env.local`을 만들지 마라. 이유: 이 step에는 실제 키가 없고, 빈 파일이 있으면 이후 step이 설정 완료로 오인한다.
- 랜딩 페이지 UI를 만들지 마라. 이유: step 10의 작업이다. 여기서는 빌드가 통과할 최소 스텁만 만든다.
- Supabase·Anthropic·Polar 패키지를 설치하지 마라. 이유: 각 step에서 실제로 쓸 때 설치한다. 여기서 깔면 미사용 의존성이 된다.
