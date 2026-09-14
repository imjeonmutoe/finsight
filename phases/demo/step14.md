# Step 14: demo-page

## 읽어야 할 파일

먼저 아래를 읽고 설계 의도를 파악하라:

- **`.claude/skills/finsight-design/SKILL.md`** — 확정된 화면 레이아웃·컴포넌트 구성·한국어 문구의 기준이다. `prototype/`에 동작하는 프로토타입이 있다. **색 토큰 대응표의 마지막 두 줄(`semantic-up`/`semantic-down`이 이 리포와 반대)을 반드시 확인하라** — 이름만 보고 옮기면 증감 색이 뒤집힌다
- `/docs/UI_GUIDE.md` — 색 토큰, 한국어 타이포그래피, 안티패턴 목록. **이 문서가 프로토타입을 이긴다**
- `/docs/ARCHITECTURE.md` — `## 화면 인벤토리`(S4~S6 대시보드의 목표), `## 보안`
- `/CLAUDE.md` — UI 관련 CRITICAL 규칙(한국어 문구, `dangerouslySetInnerHTML` 금지, 육안 검증)

이전 step 산출물:

- `src/lib/demo/dataset.ts` — `buildDemoDataset(): DemoDataset`. **필드 구성을 먼저 읽어라**
- `src/types/analytics.ts` — `MonthlySummary`, `Subscription`, `Outlier`
- `src/types/transaction.ts` — `Transaction`
- `src/app/globals.css` — `@theme` 색·서체 토큰. **여기 없는 색을 쓰지 마라**
- `src/app/layout.tsx` — 테마 초기화 스크립트가 이미 `data-theme`을 세운다

## 작업

담당 화면: `/demo` — 키 없이 도는 샘플 대시보드 한 페이지.

### 1. 컴포넌트 4종 (`src/components/`)

**step 8의 실제 대시보드가 그대로 재사용한다.** 데모 전용으로 만들지 말고 범용 props로 설계하라.

```ts
// KpiCard.tsx        — 큰 숫자 하나 + 라벨 + 선택적 증감
{ label: string; amountKrw: number; deltaPercent?: number; hint?: string }

// CategoryBars.tsx   — 카테고리별 지출 막대 목록 (CSS 막대. 차트 라이브러리 금지)
{ items: MonthlySummary['byCategory']; totalKrw: number }

// TransactionTable.tsx
{ transactions: Transaction[] }

// DetectionList.tsx  — 구독 누수 · 이상거래 목록
{ subscriptions: Subscription[]; outliers: Outlier[] }
```

지켜야 할 것:

- **금액은 `₩1,234,567` 형태**이고 `font-mono`와 `tabular-nums`를 건다. 자릿수가 다른 금액이 세로로 정렬돼야 한다
- **증감 색:** 지출이 **늘면 `text-up`(빨강)**, 줄면 `text-down`(초록). 프로토타입은 거래소 관습이라 반대다
- `category: null`은 **"미분류"**로 표시한다. 빈칸으로 두지 마라 — 규칙 사전이 못 잡은 거래가 있다는 사실 자체가 정보다
- 색은 `docs/UI_GUIDE.md`의 토큰 클래스(`bg-surface`, `text-muted`, `border-border-default`)로만 쓴다. **hex 하드코딩 금지**
- 문구는 전부 한국어. 영문 병기 금지. 버튼은 동사형(`자세히 보기`), 상태 메시지는 평서형

### 2. `/demo` 페이지 (`src/app/demo/page.tsx`)

Server Component다. `buildDemoDataset()`을 호출해 위 컴포넌트에 넘긴다. `'use client'`를 붙이지 마라 — 인터랙션이 없다.

구성 순서:

1. **상단 배너** — "샘플 데이터입니다. 실제 카드 명세서가 아닙니다." 페이지에 인라인으로 둔다(컴포넌트로 빼지 마라)
2. **KPI 3개** — 이번 달 총지출 / 전월 대비 증감 / 구독 월 합계
3. **AI 월간 요약 자리** — **빈 상태로 둔다.** "AI 요약은 `ANTHROPIC_API_KEY`를 등록하면 생성됩니다." 정도의 안내 한 줄. **문장을 지어내 채우지 마라** — 제품의 핵심 주장을 거짓으로 보여주는 것이고, 나중에 실제 인사이트로 갈아끼울 때 품질 차이가 드러난다
4. **카테고리별 지출** — `CategoryBars`
5. **구독 누수 · 이상거래** — `DetectionList`
6. **거래 내역** — `TransactionTable` (최근 달 기준)

Pro 게이팅을 적용하지 않는다. 데모는 샘플 데이터뿐이라 가릴 사용자 데이터가 없다. 대신 배너로 샘플임을 밝힌다.

## Acceptance Criteria

```bash
npm run lint    # 린트 통과
npm run build   # 컴파일 에러 없음
npm run test    # 테스트 통과
```

```bash
bash scripts/preview-shot.sh /demo 1440 2400   # PNG 경로를 출력한다
```

**TDD 가드: `src/components/*.tsx` 4개는 전부 테스트 파일이 먼저 있어야 작성할 수 있다.** (`page.tsx`는 면제)

테스트에 반드시 포함할 것:

- 금액이 `₩1,234,567` 형태로 렌더되는가
- `category: null`이 **"미분류"**로 렌더되는가
- 지출 증가에 `text-up`, 감소에 `text-down`이 붙는가 (반대로 붙으면 실패시킨다)
- 구독·이상거래가 0건일 때 빈 상태 문구가 한국어로 나오는가
- 컴포넌트 마크업에 하드코딩된 hex(`#`)가 없는가

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. **스크린샷을 실제로 열어본다.** `preview-shot.sh`가 출력한 PNG 경로를 Read로 열어 눈으로 확인한다. **찍기만 하고 넘어가지 마라 — 그러면 검증한 것이 아니다.** Tailwind v4는 잘못된 문법을 에러 없이 조용히 무시하므로 `npm run build` 통과가 화면이 맞다는 뜻이 아니다. 확인할 것:
   - 라이트·다크 양쪽에서 대비가 깨지지 않는가 (다크는 `--blink-settings=preferredColorScheme=2`, 라이트는 `=1`로 한 장씩 찍어 비교한다)
   - 한글이 어절 중간에서 줄바꿈되지 않는가
   - 금액이 `tabular-nums`로 자리가 맞는가
   - 숫자가 0이거나 목록이 비어 깨진 섹션이 없는가
   - 문구가 전부 한국어인가

   Chrome을 못 찾아 스크립트가 실패하면 **육안 검증을 건너뛰지 말고** `blocked`로 두고 사용자에게 확인을 요청한다.
3. 아키텍처 체크리스트:
   - UI_GUIDE 안티패턴을 하나도 쓰지 않았는가? (glass morphism, gradient text, 보라색, blur orb, 네온 글로우, 균일한 rounded-2xl)
   - 색을 토큰으로만 썼는가?
   - 집계를 페이지에서 다시 하지 않고 `DemoDataset`의 값을 그대로 쓰는가?
   - `dangerouslySetInnerHTML`을 쓰지 않았는가?
   - 컴포넌트가 데모 전용 타입이 아니라 `src/types/`의 범용 타입을 받는가?
4. `phases/demo/index.json`의 step 14를 업데이트한다.

## 금지사항

- **차트 라이브러리를 설치하지 마라.** 이유: 막대 목록은 CSS로 충분하고, 의존성은 요청되지 않았다. step 8에서 실제 차트가 필요해지면 그때 판단한다.
- **AI 요약 문장을 지어내 채우지 마라.** 이유: 키가 없어 생성할 수 없다. 가짜 문장은 제품의 핵심 주장에 대한 거짓이다.
- **Supabase·Claude·Polar를 import하지 마라.** 이유: 이 페이지의 전제가 "키 없이 돈다"이다.
- **`/demo`에서 인증·사용자 데이터에 접근하지 마라.** 이유: 데모 경로가 인증 우회로가 되면 안 된다. 이 페이지는 `buildDemoDataset()` 외의 데이터 소스를 갖지 않는다.
- **`dangerouslySetInnerHTML`을 쓰지 마라.** 이유: 가맹점명은 CSV에서 온 임의 문자열이다. React 기본 이스케이프가 유일한 방어선이다.
- 한글에 `uppercase`·`tracking-tight`·`tracking-wide`·`font-light`를 쓰지 마라. 이유: 라틴 타이포 관용구이며 한글에서는 효과가 없거나 깨져 보인다.
- 실제 대시보드(`/dashboard`)를 만들지 마라. 이유: step 8의 작업이다. 여기서는 `/demo` 한 페이지만 만든다.
- 기존 테스트를 깨뜨리지 마라.
