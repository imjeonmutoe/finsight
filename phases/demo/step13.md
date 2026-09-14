# Step 13: demo-dataset

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — `## 데이터 모델 → 불변 규칙`(총지출 계산식, 금액 절댓값, `kind`), `## 아키텍처 경계`(집계 분담)
- `/docs/ADR.md` — ADR-001(집계는 코드), ADR-011(분류 3단 순서), ADR-013(`kind` 결정론적 도출)
- `/docs/PRD.md` — `## 프로젝트 성격`(평가용 샘플 CSV를 제공한다)

이전 step에서 만들어진 아래 코드를 **꼼꼼히 읽고 시그니처를 확인한 뒤** 작업하라. 이 step은 새 로직을 만드는 게 아니라 **이미 있는 함수들을 이어 붙이는 것**이다:

- `src/lib/encoding.ts` — `detectEncoding(buf)`, `decodeCsv(buf, encoding?)`
- `src/lib/csv.ts` — `parseCsvRows(text)`, `detectHeaderRow(rows)`, `parseAmount(raw)`, `parseDate(raw)`, `buildTransactions(rows, mapping, context)`
- `src/lib/merchant.ts` — `normalizeMerchant(raw)`
- `src/lib/merchant-rules.ts` — `classifyByRule(merchantNorm): Category | null` (내장 가맹점 사전)
- `src/lib/analytics.ts` — `detectSubscriptions(transactions)`, `detectOutliers(transactions, medians)`
- `src/lib/dedupe.ts` — `computeFileHash`, `computeDedupeHash`, `computeCandidateHash`
- `src/types/transaction.ts` — `ParsedTransaction`, `Transaction`, `TransactionKind`, `CategorySource`
- `src/types/analytics.ts` — `MonthlySummary`, `Subscription`, `Outlier`
- `src/types/upload.ts` — `ColumnMapping`, `ImportContext`
- `src/types/category.ts` — `CATEGORIES`(12개), `Category`

## 왜 이 step이 존재하는가

Supabase·Anthropic 키가 아직 없다. 키 없이도 **제품이 실제로 무엇을 하는지** 보여줄 화면이 필요하다.

핵심 제약: **화면의 모든 숫자는 제품 코드가 계산한 것이어야 한다.** 하드코딩한 합계나 지어낸 구독 목록을 넣지 마라. 그러면 데모가 제품에 대해 거짓말을 하게 되고, 나중에 실제 경로로 갈아끼울 때 숫자가 달라진다.

## 작업

### 1. `src/lib/demo/sample-csv.ts` — 샘플 명세서

```ts
export const SAMPLE_CSV: string           // 국내 카드 명세서 형태의 CSV 전문
export const SAMPLE_MAPPING: ColumnMapping
export const SAMPLE_CONTEXT: ImportContext
```

`SAMPLE_CSV`가 만족해야 할 조건:

- **4개월치, 150~250행.** 3개월 미만이면 안 된다 — `detectSubscriptions`가 "3회 이상 + 연속 간격 26~35일"을 요구하므로 구독이 하나도 안 잡히고, 데모의 핵심 기능이 빈 화면이 된다
- 상단 요약행 2~3줄을 넣는다(`skipRows`로 건너뛴다). 국내 카드사 CSV의 실제 모양이다
- 컬럼: 승인일자 · 가맹점명 · 승인금액 · 원화환산금액 · 할부개월 · 승인번호 · 이용구분 정도. **계좌번호·카드번호 컬럼을 넣지 마라** — `buildTransactions`가 그런 헤더를 발견하면 예외를 던진다
- 반드시 포함할 것:
  - **구독 3~4건** — 넷플릭스·유튜브프리미엄·멜론 등을 매월 같은 날짜 근처(간격 26~35일)에 동일 금액으로. **그중 하나는 마지막 달에 10% 넘게 인상**해 `amountIncreased: true`가 실제로 잡히게 한다
  - **이상치 1~2건** — 같은 카테고리 중앙값의 3배를 넘고 30,000원 이상인 거래
  - **환불 1~2건** — 음수 금액. `kind='refund'`로 도출되어 총지출에서 차감된다
  - **해외결제 1건** — 원화환산 컬럼에 값이 있고 승인금액이 외화인 행
  - **할부 1건**
  - **내장 사전이 못 잡는 가맹점 3~5개** — 미분류로 남아 화면에 "미분류"로 표시된다. ③ LLM 분류는 키가 필요해 데모에 없다. **이걸 억지로 채우지 마라. 미분류가 보이는 것이 정직한 상태다**
- 가맹점명은 실제 국내 가맹점 형태(`스타벅스강남2호점`처럼 접미가 붙은 형태)를 섞는다. `classifyByRule`이 부분 문자열 매칭이므로 이 형태가 실제 커버리지를 보여준다

`SAMPLE_MAPPING`은 이 CSV에 맞는 **고정 매핑**이다. 컬럼 매핑 추론(`inferColumnMapping`)은 Claude 호출이라 키가 필요하므로 데모에서는 쓰지 않는다.

### 2. `src/lib/demo/dataset.ts` — 데모 데이터셋 조립

```ts
export type DemoDataset = {
  transactions: Transaction[]
  months: MonthlySummary[]        // 오래된 달 → 최신 달 순
  currentMonth: MonthlySummary    // months의 마지막
  subscriptions: Subscription[]
  outliers: Outlier[]
  unclassifiedCount: number
}

export function buildDemoDataset(): DemoDataset
```

파이프라인은 **전부 실제 함수를 태운다**:

1. `new TextEncoder().encode(SAMPLE_CSV)` → `detectEncoding` → `decodeCsv` (인코딩 경로도 진짜로 돈다)
2. `parseCsvRows` → `buildTransactions(rows, SAMPLE_MAPPING, SAMPLE_CONTEXT)` → `ParsedTransaction[]`
3. `computeFileHash`·`computeDedupeHash`·`computeCandidateHash`로 해시를 채운다
4. `ParsedTransaction` → `Transaction` 승격: `id`·`userId`·`uploadId`를 채운다. **`id`는 결정론적으로 만든다**(예: `demo-${dataRowIndex}`). `crypto.randomUUID()`를 쓰지 마라 — 호출마다 값이 바뀌면 테스트가 불안정해지고 `Outlier.transactionId`를 거래에 되짚을 수 없다
5. 분류: `classifyByRule(merchantNorm)`로 채우고 잡히면 `categorySource: 'rule'`, 못 잡으면 `category: null` + `categorySource: null`. **ADR-011의 ①(`merchant_rules`)은 DB가 없어 건너뛰고 ③(Claude)은 키가 없어 건너뛴다. 이 두 단계를 흉내 내지 마라**
6. 월별 집계 → `MonthlySummary[]`
7. `detectSubscriptions(transactions)` / `detectOutliers(transactions, medians)`

**집계 규칙 — 여기서 틀리면 데모가 제품에 대해 거짓말을 한다:**

- `totalKrw` = `expense`의 금액 합 − `refund`의 금액 합. **`income`·`transfer`는 제외한다.** 저장 금액은 절댓값이므로 단순 합산은 틀린다
- `byCategory`도 같은 식이며 환불은 해당 카테고리에서 차감한다. 미분류는 `category: null` 항목으로 남긴다
- `detectOutliers`에 넘기는 중앙값은 **`kind='expense'`만** 대상으로 카테고리별로 계산한다
- 금액은 전부 원 단위 정수다

### 3. 아키텍처 경계 — 반드시 지킨다

`ARCHITECTURE.md`의 `## 아키텍처 경계`는 **월별·카테고리별 합계를 SQL `group by`(`src/lib/queries.ts`)가 담당한다**고 정했다. 데모에는 DB가 없어 메모리에서 집계할 수밖에 없다. 그래서 이 예외를 `src/lib/demo/` 안에 가둔다:

- 메모리 집계 함수는 **`src/lib/demo/` 밖으로 내보내지 않는다**
- `src/lib/queries.ts`를 import하지 않는다 (Supabase 클라이언트가 필요하다)
- `src/lib/queries.ts`를 수정하지 않는다
- 파일 상단 주석에 "데모 전용 집계다. 대시보드(step 8)는 `queries.ts`를 쓴다"를 명시한다

## Acceptance Criteria

```bash
npm run lint    # 린트 통과
npm run build   # 컴파일 에러 없음
npm run test    # 테스트 통과
```

**TDD 가드: `src/lib/demo/dataset.ts`와 `src/lib/demo/sample-csv.ts`는 같은 디렉토리에 테스트 파일이 먼저 있어야 작성할 수 있다.**

테스트에 반드시 포함할 것:

- `buildDemoDataset()`이 **서로 다른 달 4개**를 반환하는가
- **구독이 1건 이상 잡히는가**, 그중 `amountIncreased: true`가 1건 이상인가 — 샘플 데이터가 탐지 조건을 실제로 만족하는지 고정한다. 이게 없으면 샘플을 조금 고쳤을 때 구독 섹션이 조용히 비어버린다
- **이상치가 1건 이상 잡히는가**
- `totalKrw`가 **지출 − 환불**이고 `income`·`transfer`가 포함되지 않는가 — 급여/이체 행을 섞은 입력으로 확인한다
- 미분류 거래가 1건 이상 있고 `unclassifiedCount`와 일치하는가
- 모든 `amountKrw`가 0 이상 정수인가
- 두 번 호출해도 `transactions[].id`가 동일한가(결정론)

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - `src/lib/demo/`가 `queries.ts`·`services/`를 import하지 않는가?
   - 집계·탐지를 **다시 구현하지 않고** `analytics.ts`의 함수를 쓰는가?
   - 카테고리가 `CATEGORIES` 12개를 벗어나지 않는가?
   - 하드코딩한 합계·구독 목록이 없는가? (전부 계산 결과여야 한다)
   - 금융 데이터를 `console.log`하지 않는가?
3. `phases/demo/index.json`의 step 13을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 산출물 한 줄 요약 (다음 step이 쓸 `DemoDataset` 필드 이름을 포함하라)
   - 3회 시도 후에도 실패 → `"status": "error"`, `"error_message"`

## 금지사항

- **집계·탐지 로직을 새로 구현하지 마라.** 이유: `analytics.ts`에 이미 있고 테스트로 덮여 있다. 두 벌이 되면 데모와 실제 대시보드의 숫자가 달라진다.
- **합계·구독·이상치를 하드코딩하지 마라.** 이유: 데모의 목적은 "이 코드가 실제로 이런 결과를 낸다"를 보여주는 것이다. 값을 적어넣으면 보여주는 것이 없다.
- **Supabase·Anthropic·Polar를 import하지 마라.** 이유: 이 step의 전제가 "키 없이 돈다"이다.
- **LLM 분류 결과를 흉내 내지 마라.** 이유: 규칙 사전이 못 잡은 것은 미분류로 남는 게 이 단계의 정직한 상태다. 채워 넣으면 규칙 사전의 실제 커버리지를 숨기게 된다.
- `crypto.randomUUID()`로 거래 id를 만들지 마라. 이유: 호출마다 바뀌면 테스트가 불안정하고 이상치의 `transactionId`로 거래를 되짚을 수 없다.
- UI·컴포넌트·페이지를 만들지 마라. 이유: step 14의 작업이다.
- 새 npm 패키지를 설치하지 마라. 이유: 이 step은 이미 있는 순수 함수 조합이라 의존성이 필요 없다.
- 기존 테스트를 깨뜨리지 마라.
