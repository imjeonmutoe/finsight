# Step 4: csv-parser

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — `## 데이터 모델 → 불변 규칙` **전체**. 특히 중복 판정 해시, `merchant_norm` 생성, 청구 기준 파싱
- `/docs/ADR.md` — ADR-003(LLM 매핑)
- 이전 step 산출물: `src/types/transaction.ts`(`ParsedTransaction`), `src/types/upload.ts`(`ColumnMapping`)

## 작업

I/O가 전혀 없는 순수 함수 4개 모듈. DB도 fetch도 Storage도 건드리지 않는다. 입력은 문자열/배열, 출력은 값.

### `src/lib/encoding.ts`

```ts
detectEncoding(buf: Uint8Array): 'utf-8' | 'euc-kr'
decodeCsv(buf: Uint8Array, encoding?: 'utf-8' | 'euc-kr'): string
```

국내 카드사 CSV는 EUC-KR이 흔하다. BOM 확인 → UTF-8 디코딩 시도 → 치환 문자(U+FFFD) 비율이 높으면 EUC-KR로 판정. `encoding` 인자가 주어지면 감지를 건너뛴다(사용자가 매핑 화면에서 수동 전환하는 경로).

### `src/lib/csv.ts`

```ts
parseCsvRows(text: string): string[][]              // 따옴표·이스케이프·개행 처리
detectHeaderRow(rows: string[][]): number           // 상단 요약행을 건너뛴 헤더 위치
parseAmount(raw: string): number                    // 원 단위 정수
parseDate(raw: string): string                      // 'YYYY-MM-DD'
buildTransactions(rows: string[][], mapping: ColumnMapping): ParsedTransaction[]
```

`buildTransactions`가 이 모듈의 중심이다. 아래를 전부 처리한다:

- **부호 규약**: 지출 양수, 수입/환불 음수. `deposit`/`withdrawal` 분리 컬럼이면 병합해 이 규약으로 정규화
- **해외결제**: `krwEquivalent`가 매핑에 있으면 그 컬럼만 쓰고 `amount` 컬럼은 **버린다**. 둘 다 읽으면 이중 집계된다
- **할부**: 명세서 행을 그대로 기록한다. 그달 청구 회차분이 그달 지출이다. 원금을 최초 결제일에 몰지 않는다
- **`occurrence_index`**: 파일 내에서 같은 `(날짜, 금액, 가맹점원문)` 조합의 0-based 순번
- **계좌번호·카드번호로 보이는 컬럼은 결과에 담지 않는다.** 이 데이터는 LLM으로도 DB로도 가면 안 된다

### `src/lib/merchant.ts`

```ts
normalizeMerchant(raw: string): string
```

NFKC 정규화 → 소문자화 → 법인격 표기(`(주)`, `㈜`, `주식회사`) 제거 → 공백·특수문자 제거.

**지점명·지역명은 제거하지 않는다.** 잘못된 병합은 되돌릴 수 없다(스타벅스 ≠ 스타벅스리저브). 분리된 채로 두면 사용자가 규칙으로 합칠 수 있지만, 합쳐진 걸 나누는 방법은 없다.

### `src/lib/dedupe.ts`

```ts
computeOccurrenceIndex(rows: {occurredOn, amountKrw, merchantRaw}[]): number[]
computeDedupeHash(t: {occurredOn, amountKrw, merchantRaw, occurrenceIndex}): string
```

```
dedupe_hash = sha256("{occurredOn}|{amountKrw}|{merchantRaw}|{occurrenceIndex}")
```

**`occurrenceIndex`가 반드시 들어가야 한다.** 없으면 같은 날 같은 가맹점에서 같은 금액을 두 번 결제한 거래가 1건으로 합쳐지고 대시보드 총액이 명세서와 어긋난다. 커피·편의점·대중교통에서 일상적으로 일어나는 패턴이다.

## 테스트에 반드시 포함할 엣지 케이스

TDD이므로 아래를 **테스트로 먼저 작성**하고 통과시킨다.

**인코딩·구조**
- E1 CSV가 아닌 내용 → 명확한 에러
- E2 빈 파일 / 헤더만 존재 → 빈 배열, 예외 없음
- E3 EUC-KR 한글 가맹점명이 깨지지 않고 디코딩되는가
- 상단에 "조회기간: ..." 같은 요약행이 2~3줄 있는 파일에서 헤더를 올바로 찾는가

**금액**
- E4 `"1,234"` · `"₩1,234"` · `"1,234원"` · `"(1,234)"` · `"-1,234"` · `"1234.00"` 전부 정수로
- E5 입금/출금 분리 컬럼 → 부호 규약으로 병합
- E6 환불/취소 거래 → 음수
- E8 해외결제: 외화 컬럼과 원화환산 컬럼이 둘 다 있을 때 **원화환산만** 쓰는가 (이중 집계 방지)
- E7 할부: `"3/12"` 회차 표기가 있어도 그달 청구액을 그대로 기록하는가

**중복 — 가장 중요**
- 같은 날 같은 가맹점 같은 금액 2건 → `occurrenceIndex`가 0, 1로 부여되고 **해시가 서로 다른가**
- 같은 파일을 두 번 파싱 → 해시 집합이 **완전히 동일**한가
- 위 두 개가 이 step의 핵심 회귀 테스트다

**가맹점 정규화**
- `"(주)스타벅스코리아"` → 법인격 제거
- `"스타벅스 강남점"`과 `"스타벅스"` → **서로 다른 값**이어야 한다 (병합 금지)
- 전각/반각 혼용 → NFKC로 동일해지는가

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
```

**TDD 가드: `src/lib/*.ts`는 전부 테스트 파일이 먼저 있어야 작성할 수 있다.** `encoding.test.ts`, `csv.test.ts`, `merchant.test.ts`, `dedupe.test.ts`를 먼저 만들어라.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 네 모듈 전부 I/O가 없는가? (import에 supabase·fetch·fs가 없어야 한다)
   - `dedupeHash`에 `occurrenceIndex`가 들어가는가?
   - `normalizeMerchant`가 지점명을 남기는가?
   - 반환 타입이 `src/types`의 `ParsedTransaction`인가? (새 타입을 만들지 않았는가)
3. `phases/0-mvp/index.json`의 step 4를 업데이트한다.

## 금지사항

- 이 모듈들에서 DB·fetch·Storage를 건드리지 마라. 이유: 순수 함수라야 엣지 케이스를 테스트로 다 덮을 수 있다. I/O는 step 7의 라우트 핸들러가 담당한다.
- `dedupeHash`에서 `occurrenceIndex`를 빼지 마라. 이유: 하루 2건 결제가 1건으로 삼켜지고 총액이 명세서와 안 맞는다. 이 제품의 신뢰 기준선이 무너진다.
- `normalizeMerchant`에서 지점명·지역명을 제거하지 마라. 이유: 서로 다른 가맹점이 병합되면 되돌릴 수 없다.
- 해외결제에서 외화 금액과 원화환산 금액을 둘 다 더하지 마라. 이유: 이중 집계된다.
- 은행/카드사별 전용 파서를 만들지 마라. 이유: ADR-003에서 LLM 매핑을 택했다. 매핑은 step 5가 추론하고 이 모듈은 매핑을 받아 쓰기만 한다.
- 계좌번호·카드번호 컬럼을 결과에 담지 마라. 이유: LLM 전송과 DB 저장으로 전파된다.
- 새 타입을 정의하지 마라. 이유: step 1이 확정한 `ParsedTransaction`을 쓴다.
