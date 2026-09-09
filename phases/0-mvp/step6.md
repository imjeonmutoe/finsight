# Step 6: analytics

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — `## 아키텍처 경계`의 **집계 분담** 규칙, `## LLM 경계`
- `/docs/ADR.md` — ADR-001(집계는 코드)
- 이전 step 산출물: `src/types/analytics.ts`(`MonthlySummary`·`Subscription`·`Outlier`), `src/types/transaction.ts`, `supabase/migrations/0001_init.sql`(인덱스 확인)

## 작업

집계 분담을 정확히 지킨다. **이 경계를 어기면 step 8에서 같은 집계가 두 번 구현된다.**

| 무엇 | 어디서 | 왜 |
|---|---|---|
| 월별·카테고리별 합계 | **SQL `group by`** (`src/lib/queries.ts`) | 거래 수천 건을 서버 메모리로 끌어오지 않는다 |
| 구독 탐지 · 이상치 탐지 | **순수 함수** (`src/lib/analytics.ts`) | 로직이 복잡해 테스트로 덮어야 한다 |

### `src/lib/queries.ts` — 집계 쿼리

```ts
getMonthlySummary(supabase, userId, month: string): Promise<MonthlySummary>
getMonthlyTrend(supabase, userId, months: number): Promise<MonthlySummary[]>
getCategoryMedians(supabase, userId): Promise<Record<Category, number>>
getTransactionsForMerchants(supabase, userId, merchantNorms: string[]): Promise<Transaction[]>
```

전부 `group by`나 좁힌 `where`로 필요한 것만 가져온다. `select *`로 전체를 끌어와 JS에서 합산하지 마라.
**모든 쿼리에 `user_id` 조건을 명시한다.** RLS가 이미 막지만 정책을 나중에 잘못 고쳐도 한 겹이 남는다(CLAUDE.md CRITICAL).

월별 집계는 `accounting_month`로 묶는다. `totalKrw`와 카테고리 합계는 `expense`의 amount를 더하고 `refund`의 amount만 뺀다. `income`·`transfer`는 제외한다. 저장 amount는 절댓값이므로 `SUM(amount_krw)`만 사용하면 안 된다. 구독·이상치·중앙값은 `kind='expense'`만 대상으로 하며 거래 유형을 category 문자열로 추정하지 않는다.

### `src/lib/analytics.ts` — 탐지 (순수 함수, I/O 없음)

```ts
detectSubscriptions(transactions: Transaction[]): Subscription[]
detectOutliers(transactions: Transaction[], medians: Record<Category, number>): Outlier[]
```

**구독 판정 규칙 (전부 만족):**
- 동일 `merchant_norm`
- 3회 이상 결제
- 연속 결제 간격이 26~35일
- 금액 편차 ±10% 이내

`amountIncreased`는 최근 결제액이 직전 대비 10% 넘게 오른 경우 `true`. 이게 "구독 누수"의 핵심 신호다.

**이상치 판정 규칙 (둘 다 만족):**
- 같은 카테고리 중앙값의 3배 초과
- 금액 30,000원 이상 (중앙값이 작을 때 커피 한 잔이 이상치로 잡히는 걸 막는다)

## 테스트에 반드시 포함할 케이스

`analytics.ts`는 순수 함수이므로 전부 단위 테스트로 덮는다.

**구독 탐지**
- 매월 같은 날 같은 금액 3회 → 탐지
- 2회만 → 탐지 안 됨 (3회 미만)
- 간격이 45일 → 탐지 안 됨 (26~35일 벗어남)
- 금액 편차 30% → 탐지 안 됨
- 3회차에 금액이 15% 인상 → 탐지되고 `amountIncreased === true`
- 월말 결제(1/31, 2/28, 3/31)처럼 간격이 28~31일로 흔들리는 경우 → **탐지돼야 한다**

**이상치 탐지**
- 중앙값 5,000원 카테고리에 20,000원 → 3배 초과지만 30,000원 미만이므로 **탐지 안 됨**
- 중앙값 20,000원 카테고리에 100,000원 → 탐지
- 거래가 1~2건뿐인 카테고리 → 중앙값이 불안정하므로 탐지하지 않는다(예외 처리 확인)

**집계**
- 급여 income 3,000,000 + expense 1,000,000 → 총지출 1,000,000
- expense 100,000 + refund 20,000 → 같은 카테고리 순지출 80,000
- 카드 명세서 지출 100,000 + 은행의 카드대금 transfer 100,000 → 총지출 100,000
- 본인 계좌 이체 입출금은 지출·구독·이상치·중앙값에 포함되지 않는가
- 할부 원 승인일이 같아도 청구월별 회차 금액이 각 월에 잡히는가
- 환불만 있는 월은 음수 순지출을 허용하고, 급여는 순지출을 낮추지 않는가
- 미분류 지출/환불은 **총액에 포함하고 카테고리에는 null("미분류")로 별도 표기**한다. 미분류 수입/이체는 포함하지 않는다

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
```

**TDD 가드: `src/lib/analytics.ts`와 `src/lib/queries.ts` 둘 다 테스트 파일이 먼저 있어야 한다.**
`queries.ts`는 Supabase 클라이언트를 목킹해 테스트한다 — 생성되는 쿼리에 `user_id` 조건이 들어가는지 확인하는 테스트를 포함하라.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - `analytics.ts`에 I/O가 없는가? (supabase import가 없어야 한다)
   - 월별·카테고리별 합계를 SQL `group by`로 하는가? JS에서 `reduce`로 합산하고 있지 않은가?
   - 모든 쿼리에 `user_id` 조건이 있는가?
   - 반환 타입이 `src/types/analytics.ts`의 것인가?
3. `phases/0-mvp/index.json`의 step 6을 업데이트한다.

## 금지사항

- `analytics.ts`에서 DB를 조회하지 마라. 이유: 순수 함수라야 위 엣지 케이스를 전부 테스트로 덮을 수 있다. 데이터는 `queries.ts`가 가져와 인자로 넘긴다.
- 거래 전체를 가져와 JS에서 합산하지 마라. 이유: 수천 건이면 메모리와 전송량이 낭비다. 합계는 SQL이 한다.
- 쿼리에서 `user_id` 조건을 생략하지 마라. 이유: RLS 하나에만 의존하면 정책 실수 하나로 전면 유출이다.
- 구독·이상치 탐지를 LLM에 맡기지 마라. 이유: ADR-001. 규칙이 명확해 코드가 100% 정확하고, LLM은 놓치거나 지어낸다.
- 판정 임계값을 임의로 바꾸지 마라. 이유: 위 규칙(3회/26~35일/±10%, 3배/30,000원)은 확정된 사양이다. 조정이 필요하면 문서를 먼저 고쳐야 한다.
- 차트나 UI를 만들지 마라. 이유: step 8의 작업이다.
