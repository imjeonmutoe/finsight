# UI 디자인 가이드

## 디자인 원칙
1. **도구처럼 보여야 한다.** 마케팅 페이지가 아니라 매일 쓰는 대시보드. 랜딩과 대시보드가 같은 톤·같은 컴포넌트를 쓴다.
2. **숫자가 주인공이다.** 장식이 숫자보다 시선을 먼저 끌면 실패다. 금액은 tabular-nums로 자리를 맞춘다.
3. **라이트/다크 양쪽 다 1급 시민이다.** 한쪽만 다듬고 다른 쪽을 방치하지 않는다. 모든 색은 아래 토큰으로만 쓴다.
4. **한국어가 기본이다.** 모든 UI 문구·에러 메시지·빈 상태 문구를 한국어로 쓴다. 영문 그대로 두거나 영문을 병기하지 않는다. 타이포그래피도 라틴 기준이 아닌 한글 기준으로 맞춘다 — 아래 `## 한국어 타이포그래피`가 그 규칙이다.

## AI 슬롭 안티패턴 — 하지 마라
| 금지 사항 | 이유 |
|-----------|------|
| backdrop-filter: blur() | glass morphism은 AI 템플릿의 가장 흔한 징후 |
| gradient-text (배경 그라데이션 텍스트) | AI가 만든 SaaS 랜딩의 1번 특징 |
| "Powered by AI" 배지 | 기능이 아니라 장식. 사용자에게 가치 없음 |
| box-shadow 글로우 애니메이션 | 네온 글로우 = AI 슬롭 |
| 보라/인디고 브랜드 색상 | "AI = 보라색" 클리셰 |
| 모든 카드에 동일한 rounded-2xl | 균일한 둥근 모서리는 템플릿 느낌 |
| 배경 gradient orb (blur-3xl 원형) | 모든 AI 랜딩 페이지에 있는 장식 |

## 색상

Tailwind v4의 `@theme`로 정의한다. **v3의 `bg-[--surface]` 문법을 쓰지 마라 — v4에서는 에러 없이 조용히 무시된다.**
`--color-*`로 선언하면 Tailwind가 유틸리티를 자동 생성하므로 `bg-surface`, `text-muted`처럼 평범하게 쓴다.
**컴포넌트에 hex를 하드코딩하지 마라. 반드시 아래 토큰명을 거쳐라.**

### 토큰 정의 (`src/app/globals.css`)

```css
@import "tailwindcss";

@theme {
  /* 한글 우선 시스템 폰트. 웹폰트를 받지 않는다 — FOUT과 번들 무게를 만들지 않기 위해서다.
     macOS는 Apple SD Gothic Neo, Windows는 맑은 고딕이 잡힌다. */
  --font-sans: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
               "Malgun Gothic", "맑은 고딕", "Segoe UI", system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

  --color-bg: #ffffff;
  --color-surface: #f7f7f5;
  --color-surface-2: #efefec;
  --color-border-default: #e3e3df;
  --color-text: #1a1a19;
  --color-text-body: #3d3d3a;
  --color-muted: #6b6b66;
  --color-disabled: #9c9c96;
  --color-up: #b3261e;
  --color-down: #2f6b46;
  --color-neutral-line: #8a8a84;
  --color-accent: #2563a8;
}

[data-theme="dark"] {
  --color-bg: #0f0f0e;
  --color-surface: #191918;
  --color-surface-2: #222220;
  --color-border-default: #2c2c29;
  --color-text: #f5f5f3;
  --color-text-body: #d4d4d0;
  --color-muted: #8a8a84;
  --color-disabled: #5c5c58;
  --color-up: #f2837b;
  --color-down: #6fbd8e;
  --color-neutral-line: #6e6e69;
  --color-accent: #7fb0e0;
}
```

v4는 테마 값을 실제 CSS 변수로 내보내고 유틸리티가 `var(--color-*)`를 참조한다. `[data-theme="dark"]`에서 같은 변수를 덮어쓰면 그대로 캐스케이드된다.
**`dark:` variant를 쓸 필요가 없다** — 클래스는 한 벌만 쓰고 변수만 갈아끼운다.

### 용도

| 토큰 | 클래스 예 | 용도 |
|------|-----------|------|
| `bg` | `bg-bg` | 페이지 배경 |
| `surface` | `bg-surface` | 카드 |
| `surface-2` | `bg-surface-2` | 테이블 헤더, 호버, placeholder 블록 |
| `border-default` | `border-border-default` | 모든 테두리 |
| `text` | `text-text` | 주 텍스트, 숫자 |
| `text-body` | `text-text-body` | 본문 |
| `muted` | `text-muted` | 보조, 라벨 |
| `disabled` | `text-disabled` | 비활성, placeholder |
| `up` | `text-up` | 지출 증가 / 경고 / 이상거래 |
| `down` | `text-down` | 지출 감소 / 절약 / 성공 |
| `neutral-line` | `stroke-neutral-line` | 차트 기준선 |
| `accent` | `text-accent` / `outline-accent` | 링크, 포커스 링 |

브랜드 포인트 색(`accent`)은 **링크와 포커스 링에만** 쓴다. Primary 버튼은 무채색이다 — 증감 색상(빨강/초록)과 경쟁하면 데이터를 못 읽는다.

**카테고리 12색 팔레트는 여기서 정하지 않는다.** 차트를 만드는 step에서 `dataviz` 스킬을 로드해 확정하고, 확정된 값을 `src/lib/palette.ts`에 두고 전 차트가 그 파일만 참조한다.

## 컴포넌트

### 카드
```
rounded-md border border-border-default bg-surface p-5
```
카드 반경은 `rounded-md` 고정. 강조는 반경이 아니라 `border` 색이나 좌측 2px 액센트 바로 한다.

### 버튼
```
Primary:     rounded-md bg-text text-bg px-4 py-2 text-sm font-medium hover:opacity-90
Secondary:   rounded-md border border-border-default text-text px-4 py-2 text-sm hover:bg-surface-2
Text:        text-sm text-muted hover:text-text underline-offset-4 hover:underline
Destructive: rounded-md border border-up text-up px-4 py-2 text-sm hover:bg-up/10
```
모든 인터랙티브 요소에 `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`.

### 입력 필드
```
rounded-md border border-border-default bg-bg px-3 py-2 text-sm text-text
placeholder:text-disabled focus:border-accent
```

### 금액 표기
```
font-mono tabular-nums
```
`₩1,234,567` 형식(`Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' })`). 지출 금액 자체는 `text-text`로 두고, **증감분에만** `text-up`/`text-down`을 쓴다. 예: `₩482,000` + `+12.4%`(up).

**만·억 단위로 축약하지 마라.** KPI에서도 `₩1,234,567`을 그대로 쓴다. 이유: `₩123만`처럼 축약하면 같은 숫자가 화면마다 다르게 보이고 반올림 때문에 명세서와 대조가 안 된다. 이 앱에서 숫자가 명세서와 어긋나 보이면 신뢰를 잃는다. `tabular-nums`로 자리가 맞으니 전액도 읽힌다.

**날짜**: 표·거래 목록은 `2026.01.15`(자리 고정, `tabular-nums`). 월 제목은 `2026년 1월`. `Jan 15, 2026` 같은 영문 표기를 쓰지 마라.

### 테이블 (거래 목록)
```
헤더: text-xs font-medium text-muted bg-surface-2 좌측 정렬 (금액 컬럼만 우측 정렬)
행:   border-b border-border-default text-sm hover:bg-surface-2
```

## 레이아웃
- 전체 너비: `max-w-6xl mx-auto px-6` (대시보드), `max-w-5xl` (랜딩)
- 정렬: 좌측 정렬 기본. 랜딩 히어로 한 곳만 예외적으로 중앙 정렬 허용.
- 간격: 컴포넌트 내부 `gap-3`, 카드 사이 `gap-4`, 섹션 사이 `space-y-10`

## 타이포그래피
| 용도 | 스타일 |
|------|--------|
| 랜딩 히어로 | `text-4xl sm:text-5xl font-semibold text-text` |
| 페이지 제목 | `text-2xl font-semibold text-text` |
| 섹션 제목 | `text-sm font-medium text-muted` |
| 카드 라벨 | `text-xs font-medium text-muted` |
| 큰 숫자(KPI) | `text-3xl font-semibold tabular-nums text-text` |
| 본문 | `text-sm text-text-body leading-relaxed` |

## 한국어 타이포그래피

라틴 기준으로 맞춘 타이포는 한글에서 깨진다. 아래는 눈으로 봐야 발견되는 종류의 문제라, 규칙으로 박아둔다.

### 줄바꿈 — 가장 중요하다

`globals.css`의 base 레이어에 넣는다:

```css
body {
  word-break: keep-all;      /* 어절 중간에서 줄바꿈되는 것을 막는다 */
  overflow-wrap: break-word; /* 단, 끊을 곳 없는 긴 문자열은 강제로 끊는다 */
}
```

`keep-all`이 없으면 "정기결제 4건을 찾았습니다"가 `정기결제 4건을 찾았습`/`니다`처럼 잘린다. 문법적으로 틀린 위치에서 끊기므로 읽는 순간 걸린다.
`overflow-wrap`을 같이 주는 이유는 `keep-all`만 두면 긴 가맹점명이나 URL이 컨테이너를 넘쳐 레이아웃을 깨뜨리기 때문이다. 둘은 항상 쌍으로 쓴다.

### 라틴 관용구 금지

| 금지 | 이유 |
|---|---|
| `uppercase` | 한글에 대문자가 없다. 아무 효과가 없으면서 섹션 제목에 영문이 섞이면 그것만 커져 어긋난다 |
| `tracking-tight` (음수 자간) | 한글은 글자마다 폭이 꽉 차 있어 자간을 줄이면 붙어 보인다. 라틴 디스플레이 타입의 이점이 한글엔 없다 |
| `tracking-wide` (양수 자간) | 한글이 벌어져 낱글자로 흩어져 보인다. 강조가 아니라 오류처럼 읽힌다 |
| `font-light` / `100~300` 굵기 | 한글은 획이 많아 얇은 굵기에서 뭉개진다. 최소 `font-normal`(400) |
| 텍스트 세로 쓰기·회전 | 한글 조합형 글자가 뒤틀린다 |

자간이 필요하면 조정하지 말고 크기나 굵기로 위계를 만든다.

### 줄 간격

한글은 라틴보다 시각적 밀도가 높아 같은 `line-height`에서 더 답답하다.

- 본문: `leading-relaxed` (1.625). `leading-normal`을 쓰지 않는다
- 제목: `leading-snug` (1.375). 제목은 짧아서 넉넉할 필요가 없다
- 표 셀: 기본값 유지 — 행 높이를 `py`로 잡는다

### 문구 작성

- **평서형 종결로 통일한다.** "저장했습니다"(O) / "저장 완료"(X) / "저장됨"(X). 한 화면에 종결형이 섞이면 번역기 같아진다
- 에러는 원인과 다음 행동을 같이 준다. "업로드 실패"(X) → "이번 달 무료 업로드를 이미 사용했습니다. 다음 달 1일에 초기화됩니다."(O)
- 숫자와 단위를 붙여 쓴다: `4건`, `3개월`, `₩9,900`. 띄어쓰기하지 않는다
- 영문 고유명사는 그대로 둔다: `Polar`, `Supabase`, `Netflix`. 억지로 음차하지 않는다
- 기능 이름은 한국어로 정한다: `구독 누수`(O) / `Subscription Leak`(X)

### `lang` 속성

`<html lang="ko">`를 반드시 세운다. 스크린리더 발음과 브라우저 기본 줄바꿈 규칙이 이 값을 본다.

## 애니메이션
- 허용: `fade-in` (0.2s ease-out), 테마 전환 `background-color`/`color` 0.15s, hover 색상 전환 0.1s
- 그 외 모든 애니메이션 금지. 스크롤 리빌, 시차 효과, 숫자 카운트업, 로딩 스켈레톤 shimmer 전부 금지.
- 로딩 상태는 스켈레톤 대신 정적 placeholder 블록(`bg-surface-2`)을 쓴다.

## 아이콘
- SVG 인라인, `strokeWidth={1.5}`, `currentColor`
- 아이콘 컨테이너(둥근 배경 박스)로 감싸지 않는다
- 아이콘만으로 의미를 전달하지 않는다. 항상 텍스트 라벨을 동반한다.

## 다크모드 구현 규칙
- `:root`에 라이트 토큰을 정의하고, `[data-theme="dark"]`에서 같은 토큰을 재정의한다.
- `prefers-color-scheme`은 최초 방문 시 기본값 결정에만 쓰고, 사용자가 토글하면 `localStorage`가 우선한다.
- FOUC 방지: `layout.tsx`의 `<head>`에 인라인 스크립트로 `data-theme`을 hydration 전에 세팅한다.
