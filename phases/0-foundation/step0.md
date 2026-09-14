# Step 0: project-setup

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — 디렉토리 구조, 패턴
- `/docs/UI_GUIDE.md` — `## 색상` 섹션의 `@theme` 토큰 정의 (여기 있는 CSS를 그대로 쓴다)
- `/docs/ADR.md` — ADR-007 (Tailwind v4 결정)
- `/CLAUDE.md` — 명령어, CRITICAL 규칙

- `/docs/ADR.md` — **ADR-010 (툴체인 버전 고정)**
- 저장소 루트의 `package.json`, `tsconfig.json`, `vitest.config.mts`, `eslint.config.mjs` — **이미 존재한다. 먼저 읽어라**

## 작업

**⚠️ 스캐폴드의 일부가 이미 완료돼 있다.** 아래 `### 0.`을 먼저 읽고 중복 작업하지 마라.

### 0. 이미 완료된 것 — 건드리지 마라

다음은 이미 만들어져 있고 `npm run lint && npm run build && npm run test`가 exit 0으로 통과하는 상태다:

| 파일 | 내용 |
|---|---|
| `package.json` | 의존성 전체가 **정확한 버전으로 고정**돼 있다 (ADR-010). scripts 4종(`dev`/`build`/`lint`/`test`) 존재 |
| `tsconfig.json` | strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`, `@/*` → `./src/*` |
| `next.config.ts` · `postcss.config.mjs` | Next 16 기본, `@tailwindcss/postcss` |
| `eslint.config.mjs` | `eslint-config-next/core-web-vitals` 플랫 컨피그 |
| `vitest.config.mts` | `include: src/**/*.{test,spec}.{ts,tsx}`, `@` alias. **확장자가 `.mts`인 이유는 ESM/CJS 경고를 없애기 위한 것이므로 `.ts`로 바꾸지 마라** |
| `.env.example` | 키 목록 (아래 5번에서 보강만 한다) |
| `src/app/{layout.tsx,page.tsx,globals.css}` | **색 토큰·한글 base 스타일·서체(Pretendard + JetBrains Mono)가 이미 들어 있다.** 아래 2·6번은 빠진 것만 보탠다 — 이미 있는 것을 걷어내지 마라 |
| `.gitignore` | `.env` 포함 |
| `src/{lib,services,types,components}/` | 빈 디렉토리 |

**설치된 버전 (ADR-010에 따라 고정 — 절대 올리지 마라):** Next 16.3.4 · React 19.2.8 · TypeScript 5.9.3 · Tailwind 4.3.3 · Vitest 4.1.11 · ESLint 9.39.5 · zod 4.5.4 · `@types/node` 20.19.43.

`npm install`로 임의 패키지를 최신 버전으로 추가하지 마라. 특히 **ESLint를 10으로 올리면 `eslint-config-next@16`의 번들 플러그인 peer가 깨져 lint가 못 돌고, Vitest를 5로 올리면 Node 20에서 실행 자체가 안 된다.** 새 패키지는 `--save-exact`로 추가한다.

### 1. ~~Next.js 스캐폴딩~~ — 완료됨

위 0번 참조. `tailwind.config.js`는 없고 앞으로도 만들지 않는다 — 테마는 CSS의 `@theme`로 정의한다.

### 2. `src/app/globals.css`의 `@theme` 토큰 + 한글 base 스타일

`/docs/UI_GUIDE.md`의 `## 색상 → 토큰 정의` 코드 블록을 **그대로** 옮긴다. `@theme` 블록의 라이트 값·다크 값 전부, 그리고 `--font-sans`·`--font-mono` 폰트 스택까지 포함한다.

**이미 들어 있다면 그대로 둔다.** 현재 `globals.css`에는 색 토큰·애니메이션 토큰(`--animate-fade-in`·`--animate-slide-up`)·한글 base 스타일과 함께 웹폰트 스택이 들어 있다 — `--font-sans`의 `"Pretendard Variable"`과 `--font-mono`의 `var(--font-jetbrains, ...)`다. **이 둘을 시스템 폰트로 되돌리지 마라.** 이유: 시스템 폰트만 두면 macOS(Apple SD Gothic Neo)와 Windows(맑은 고딕)의 자소 비례가 달라 같은 화면이 OS마다 다르게 보이고, `--font-jetbrains`를 지우면 금액의 `tabular-nums` 자리 맞춤이 깨진다.

이걸 여기서 심어야 이후 step의 컴포넌트가 색과 폰트를 하드코딩하지 않는다.

추가로 base 레이어에 아래를 넣는다 — `/docs/UI_GUIDE.md`의 `## 한국어 타이포그래피 → 줄바꿈` 참조:

```css
body {
  word-break: keep-all;
  overflow-wrap: break-word;
}
```

**둘을 쌍으로 넣어야 한다.** `keep-all`만 두면 긴 가맹점명이 컨테이너를 넘쳐 레이아웃이 깨지고, `keep-all`이 없으면 한글이 어절 중간에서 잘린다.

### 3. 테스트 환경 보강 — jsdom + @testing-library ← **이 step의 실질적 핵심 작업**

`vitest` 4.1.11은 이미 설치돼 있고 Node 환경으로 동작한다. **컴포넌트 테스트 환경이 빠져 있으니 여기서 추가한다.**

**이 항목을 빠뜨리면 step 7·8·9·10이 TDD 가드에 전부 막혀 진행이 불가능하다.**

- 추가할 패키지 (`--save-exact`로 설치하고, 각각 Node 20 호환 버전을 `npm view <pkg> engines`로 확인한 뒤 고른다): `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@vitejs/plugin-react`
- `vitest.config.mts`를 수정한다(새 파일을 만들지 마라): React 플러그인 추가, `environment: 'jsdom'`, setup 파일 등록. `@` alias와 `include` 패턴은 이미 맞으니 유지한다
- setup 파일에서 `@testing-library/jest-dom` 매처를 등록한다
- `package.json`의 `test` 스크립트에서 **`--passWithNoTests`를 제거한다.** 이 step에서 실제 테스트가 들어오므로 더는 필요 없고, 남겨두면 테스트가 통째로 사라져도 Stop 훅이 초록불을 띄운다
- **동작하는 샘플 테스트 2개**를 작성한다: 순수 함수용(`environment: 'node'`) 1개와 간단한 컴포넌트 렌더용(jsdom) 1개. 두 종류가 한 설정에서 다 도는지 실제로 확인해야 step 4~10이 막히지 않는다

### 4. `package.json` 스크립트 — 이미 존재, `--passWithNoTests`만 제거

`Stop` 훅이 매 세션 종료 시 `lint && build && test`를 순서대로 실행한다. 세 스크립트는 이미 있고 통과한다. 최종 형태는 이렇게 되어야 한다:

```json
"dev": "next dev",
"build": "next build",
"lint": "eslint .",
"test": "vitest run"
```

현재 `test`에 `--passWithNoTests`가 붙어 있으니 **제거한다**(위 3번). `vitest run`을 유지하고 watch 모드로 바꾸지 마라 — 훅이 영원히 멈춘다.

### 5. `.env.example` 보강

파일은 이미 있지만 키 목록이 다르다. **아래 목록으로 맞춘다**(값 없이 키 이름만):
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

기존 파일에 있는 `SUCCESS_URL`은 **제거한다** — `NEXT_PUBLIC_SITE_URL`이 그 역할을 대신한다. Polar 토큰은 **샌드박스**(`sandbox.polar.sh`)에서 발급한 것을 쓴다는 주석을 남긴다. 실제 값이 든 `.env`는 사용자가 직접 관리하며 이미 `.gitignore`에 있다.

### 6. 최소 `src/app/layout.tsx` + `src/app/page.tsx`

빌드가 통과할 최소한만. 랜딩 실제 내용은 step 10에서 만든다.

**`layout.tsx`에 이미 있는 것을 지우지 마라.** Pretendard CSS import, `next/font`의 `JetBrains_Mono`(weight 500, `variable: "--font-jetbrains"`), `<html>`의 `jetBrainsMono.variable` 클래스, `metadata`의 제목·설명이 이미 들어 있다. 이 step에서 **보태는 것은 테마 초기화 스크립트뿐이다.**
`<html lang="ko">`를 세운다(스크린리더 발음과 브라우저 기본 줄바꿈 규칙이 이 값을 본다). `layout.tsx`의 `<head>`에 FOUC 방지 인라인 스크립트를 넣는다 — `localStorage`의 테마 값(없으면 `prefers-color-scheme`)을 읽어 hydration 전에 `<html>`의 `data-theme`을 세팅.
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
# 컴포넌트 테스트가 실제로 도는지 (jsdom 샘플 테스트 포함 전체 실행)
npm test 2>&1 | grep -qv "No test files found" && echo "테스트 파일 존재 OK"
# ADR-010 고정 버전이 유지됐는지 — 하나라도 다르면 실패다
node -e '
const d = require("./package.json");
const want = { next:"16.3.4", react:"19.2.8", typescript:"5.9.3", vitest:"4.1.11", eslint:"9.39.5", tailwindcss:"4.3.3" };
const all = { ...d.dependencies, ...d.devDependencies };
const bad = Object.entries(want).filter(([k,v]) => all[k] !== v);
if (bad.length) { console.error("버전 이탈:", bad); process.exit(1); }
console.log("고정 버전 OK");
'
```

## 검증 절차

1. 위 AC 커맨드를 전부 실행한다.
2. 아키텍처 체크리스트:
   - `src/app`, `src/components`, `src/types`, `src/lib`, `src/services` 디렉토리가 ARCHITECTURE.md 구조와 일치하는가?
   - `globals.css`의 `@theme` 토큰이 UI_GUIDE.md와 값까지 동일한가?
   - `.env.local`을 만들지 않았는가? (`.env.example`만 만든다)
3. 결과에 따라 `phases/0-foundation/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 산출물 한 줄 요약
   - 3회 시도 후에도 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 즉시 중단

## 금지사항

- `tailwind.config.js`를 만들지 마라. 이유: ADR-007에서 `@theme` CSS 방식을 택했다. 설정 파일이 있으면 두 곳에서 테마를 정의하게 된다.
- Tailwind v3를 설치하지 마라. 이유: UI_GUIDE의 모든 클래스가 v4 `@theme` 유틸리티(`bg-surface`)를 전제한다. v3에서는 이 클래스들이 존재하지 않는다.
- `npm test`를 watch 모드로 두지 마라. 이유: Stop 훅이 이 명령을 실행하는데 watch면 영원히 끝나지 않는다.
- `.env.local`을 만들지 마라. 이유: 이 step에는 실제 키가 없고, 빈 파일이 있으면 이후 step이 설정 완료로 오인한다.
- 랜딩 페이지 UI를 만들지 마라. 이유: step 10의 작업이다. 여기서는 빌드가 통과할 최소 스텁만 만든다.
- **`layout.tsx`의 서체 설정(Pretendard import, `JetBrains_Mono`)과 `globals.css`의 애니메이션 토큰을 제거하지 마라.** 이유: 이 step 파일보다 나중에 커밋된 결정이다(`d961704`). 이 문서에 안 적혀 있다는 이유로 지우면 OS별로 다른 한글 렌더링과 깨진 금액 정렬로 되돌아간다.
- Supabase·Anthropic·Polar 패키지를 설치하지 마라. 이유: 각 step에서 실제로 쓸 때 설치한다. 여기서 깔면 미사용 의존성이 된다.
- **ADR-010에 고정된 버전을 올리지 마라.** 이유: ESLint를 10으로 올리면 `eslint-config-next@16`이 번들한 플러그인 5개의 peer가 깨지고, Vitest를 5로 올리면 Node 20에서 실행 자체가 안 되며, `@types/node`를 26으로 올리면 Node 20에 없는 API가 타입 검사를 통과해 런타임에서만 터진다. 새 패키지는 `--save-exact`로 추가하고 `npm view <pkg> engines`로 Node 20 호환을 먼저 확인한다.
- `vitest.config.mts`를 `.ts`로 바꾸지 마라. 이유: `.mts`가 아니면 ESM 문법이 CJS로 로드돼 Vite 경고가 뜬다.
- 기존 설정 파일을 새로 만들지 마라. 이유: `tsconfig.json`·`eslint.config.mjs`·`vitest.config.mts`는 이미 존재한다. 필요한 부분만 수정한다.
