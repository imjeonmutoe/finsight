---
name: finsight-design
description: FinSight의 화면을 만들거나 고칠 때 쓴다. 랜딩·로그인·결제·대시보드(개요/거래/추이/구독·이상거래/업로드)의 확정된 레이아웃과 컴포넌트 구성을 담은 실행 가능한 프로토타입과, 그것을 이 리포의 Tailwind v4 토큰·한국어 규칙으로 옮기는 대응표를 제공한다. UI 컴포넌트·페이지·스타일 작업 전에 읽는다.
---

# FinSight 디자인 레퍼런스

`prototype/`은 Claude Design에서 만든 **동작하는 FinSight 프로토타입**이다. 앱 전체 화면이 들어 있고, 이 리포가 만들 UI의 **레이아웃·구성·문구 기준**이다.

```
open .claude/skills/finsight-design/prototype/index.html
```

라우트: 랜딩 → 가입 → 대시보드 5탭(개요 · 거래 · 기간별 추이 · 구독·이상거래 · 업로드) → 결제.
상단 우측 `Free`/`Pro` 토글로 플랜 게이팅을, `다크`/`라이트`로 테마를 바로 확인할 수 있다.

## 이 스킬에서 무엇을 가져오고 무엇을 버리는가

**가져온다 — 프로토타입이 정답인 것**

- 화면 인벤토리와 라우팅 구조
- 각 화면의 레이아웃(그리드, 카드 배치, 섹션 순서)
- 컴포넌트 구성: KPI 카드 3개, 카테고리 막대 목록, AI 요약 + 근거 거래 버튼, 거래 테이블, 세그먼티드 필터, 업로드 3단계, 잠금(Locked) 카드
- 한국어 문구 전문 — 라벨·설명·에러·빈 상태. 그대로 쓴다
- 간격 리듬(카드 사이 24px, 섹션 96px, 컨테이너 1200px)

**버린다 — 참고하지 않는 것**

- `prototype/_ds_bundle.js`의 브랜드 성격. 이 번들은 **다른 제품(암호화폐 거래소 마케팅 사이트)**의 디자인 시스템에서 왔다. 이름만 finsight이고 우리 앱과 무관하다.
  - 프로토타입이 실제로 쓰는 것만 참고: `Button` `BadgePill` `TextInput` `HeroBand` `ProductUiCard` `FeatureCard` `PricingTier` `CtaBand` `SiteFooter`
  - **`AssetRow` `PriceCell` `AssetIcon` `SearchInput` `TopNav`은 쓰지 않는다.** 거래소 전용이거나 프로토타입에서 미사용
- 원본 디자인 시스템의 영문 브랜드 지침(`readme.md`)은 의도적으로 가져오지 않았다. 영어 마케팅 카피 규칙이라 `CLAUDE.md`·`docs/UI_GUIDE.md`와 충돌한다

## 색 토큰 대응표

프로토타입은 CSS 변수를 쓰고, 이 리포는 Tailwind v4 `@theme`을 쓴다. **값은 `docs/UI_GUIDE.md`의 것을 쓰고, 프로토타입은 "그 자리에 어떤 역할의 색이 오는지"만 알려준다.**

| 프로토타입 변수 | 리포 토큰 (`docs/UI_GUIDE.md`) | 클래스 |
|---|---|---|
| `--color-canvas` | `--color-bg` | `bg-bg` |
| `--color-surface-soft` | `--color-surface` | `bg-surface` |
| `--color-surface-strong` | `--color-surface-2` | `bg-surface-2` |
| `--color-hairline` / `--color-hairline-soft` | `--color-border-default` | `border-border-default` |
| `--color-ink` | `--color-text` | `text-text` |
| `--color-body` / `--color-body-strong` | `--color-text-body` | `text-text-body` |
| `--color-muted` | `--color-muted` | `text-muted` |
| `--color-muted-soft` | `--color-disabled` | `text-disabled` |
| `--color-primary` | `--color-accent` | `text-accent` |
| `--color-semantic-down` (빨강) | **`--color-up`** | `text-up` |
| `--color-semantic-up` (초록) | **`--color-down`** | `text-down` |

**⚠️ 마지막 두 줄은 이름이 반대다.** 프로토타입의 `semantic-up`은 초록(거래소의 시세 상승)이고, 이 리포의 `up`은 빨강(지출 증가)이다. 프로토타입 코드에서 `var(--color-semantic-down)`을 보면 그것이 **지출 증가·인상**을 뜻하며 `text-up`으로 옮긴다. 이름만 보고 옮기면 증감 색이 뒤집힌다.

## 프로토타입을 그대로 따르지 않는 4가지

아래는 프로토타입이 라틴 타이포 기준으로 만들어져 한글에서 깨지는 지점이다. **`docs/UI_GUIDE.md`가 이긴다.**

| 프로토타입 | 이 리포에서는 |
|---|---|
| `.lbl`, `table.tx th`에 `text-transform:uppercase` + `letter-spacing:.04em` | 둘 다 뺀다. `text-xs font-medium text-muted` (한글에 대문자가 없고, 양수 자간은 낱글자로 흩어져 보인다) |
| `.h-sec`, `.figure`의 음수 자간(`-0.5px` ~ `-2px`) | 자간 조정 없음. 위계는 크기·굵기로 만든다 |
| Inter + JetBrains Mono (Google Fonts) | 웹폰트를 받지 않는다. `globals.css`의 한글 시스템 폰트 스택을 쓴다. **Inter엔 한글 글리프가 없어 어차피 폴백된다** |
| 숫자에 `toLocaleString('en-US')` | `Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' })`. 추이 차트의 `만`·`천` 축약도 쓰지 않는다 — `docs/UI_GUIDE.md`의 축약 금지 규칙 |

## 아직 정하지 않은 것

프로토타입과 `docs/UI_GUIDE.md`가 다르고 **어느 쪽도 아직 확정되지 않은** 항목이다. 해당 화면을 만들 때 결정하고, 정해지면 `docs/UI_GUIDE.md`를 고친 뒤 이 절에서 지운다.

- **카드 반경**: 프로토타입 24px(`--radius-xl`) 고정 vs. UI_GUIDE `rounded-md`. UI_GUIDE는 "모든 카드에 동일한 큰 반경"을 AI 슬롭 안티패턴으로 분류한다
- **버튼 모양**: 프로토타입 100px pill + 브랜드 블루 vs. UI_GUIDE 무채색 `rounded-md`
- **토스트**: 프로토타입에 있음(`.toast`, 3.2초 자동 해제). UI_GUIDE에 정의 없음
- **상단 내비 고정**: 프로토타입 `position:sticky`. UI_GUIDE에 규정 없음

## 작업 순서

1. 만들 화면을 `prototype/index.html`에서 **먼저 눈으로 본다**
2. 해당 화면의 JSX를 읽는다 — 대시보드는 `finsight-app.jsx`, 랜딩·가입·결제는 `finsight-flow.jsx`
3. 문구는 프로토타입에서 그대로 가져온다. 새로 짓지 않는다
4. 색·타이포는 위 대응표로 옮긴다. **컴포넌트에 hex를 하드코딩하지 않는다**
5. 데이터 모양은 `finsight-data.js`가 아니라 `src/types/`를 따른다. 프로토타입 데이터는 데모용이다

## 파일

| 경로 | 내용 |
|---|---|
| `prototype/index.html` | 셸 + 앱 전용 CSS 250줄. **레이아웃 규칙의 실질적 사양서** |
| `prototype/finsight-app.jsx` | 대시보드 5탭 |
| `prototype/finsight-flow.jsx` | 랜딩 · 가입 · 결제 |
| `prototype/finsight-data.js` | 데모 데이터 (카테고리 12개·kind 4종·분류 경로 3단이 리포와 일치) |
| `prototype/tokens/*.css` | 원본 토큰 값 |
| `prototype/_ds_bundle.js` | 컴파일된 컴포넌트 번들. 프로토타입 실행에만 필요 |
