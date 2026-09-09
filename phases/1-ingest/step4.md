# Step 4: csv-parser

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — `## 데이터 모델 → 불변 규칙` **전체**. 특히 중복 판정 해시, `merchant_norm` 생성, 청구 기준 파싱
- `/docs/ADR.md` — ADR-003(LLM 매핑)
- 이전 step 산출물: `src/types/transaction.ts`(`ParsedTransaction`), `src/types/upload.ts`(`ColumnMapping`)

> **이 step은 새 phase의 첫 step이다.** `execute.py`는 **같은 phase 안의** 완료된 step summary만 다음 프롬프트에 전달한다. 앞선 phase의 산출물 요약은 오지 않으므로, 위에 나열한 파일을 **실제로 열어 읽고** 시그니처를 확인한 뒤 작업하라. 기억이나 추측으로 import 하지 마라.

## 작업

I/O가 전혀 없는 순수 함수 5개 모듈. DB도 fetch도 Storage도 건드리지 않는다. 입력은 bytes/문자열/배열, 출력은 값.

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
buildTransactions(rows: string[][], mapping: ColumnMapping, context: ImportContext): ParsedTransaction[]
```

`buildTransactions`가 이 모듈의 중심이다. 아래를 전부 처리한다:

- **금액·유형**: `parseAmount`는 부호를 읽되 저장 금액은 절댓값으로 만든다. 지출·수입·환불·이체는 거래구분 컬럼의 승인된 `kindValues` 또는 사용자 명시 승인으로 정한다. 은행 입금/출금이나 카테고리만으로 유형을 확정하지 않는다. 불확실하면 `kind=null`로 반환해 승인 화면에서 해소한다
- **해외결제**: 원화환산 값이 있는 행은 그 값만 사용한다. 국내 행에서 환산 값이 비면 원화 amount를 사용한다. 둘을 더하지 않는다
- **할부**: 회차 청구액을 청구월 `accountingMonth`에 기록한다. 카드 청구월은 명세서 컬럼 또는 사용자 확인값을 사용하고, 은행은 거래월이다. 원래 승인일은 `occurredOn`에 유지한다
- **출처·행 위치**: `sourceId`·`fileHash`는 서버에서 검증한 context에서 받는다. `dataRowIndex`는 헤더·요약행 제외 0-based 데이터 행 위치다
- **계좌번호·카드번호 컬럼은 결과에 담지 않는다.** 거래 참조번호는 계좌/카드번호와 구분하고 동일 출처·유형·청구월에서 유일함을 확인한 경우에만 해시로 보존한다

### `src/lib/merchant.ts`

```ts
normalizeMerchant(raw: string): string
```

NFKC 정규화 → 소문자화 → 법인격 표기(`(주)`, `㈜`, `주식회사`) 제거 → 공백·특수문자 제거.

**지점명·지역명은 제거하지 않는다.** 잘못된 병합은 되돌릴 수 없다(스타벅스 ≠ 스타벅스리저브). 분리된 채로 두면 사용자가 규칙으로 합칠 수 있지만, 합쳐진 걸 나누는 방법은 없다.

### `src/lib/merchant-rules.ts`

```ts
classifyByRule(merchantNorm: string): Category | null
```

내장 가맹점 규칙 사전이다. ADR-011의 3단 분류 중 **②단계**를 담당한다(①은 DB의 `merchant_rules`, ③은 Claude).

- 사전은 `{ pattern: string; category: Category }` 배열이고 **부분 문자열 포함 매칭**이다. 실제 명세서의 가맹점명은 `스타벅스강남2호점`처럼 접미가 붙어 완전 일치로는 잡히지 않는다
- **더 구체적인 패턴이 먼저 오도록 정렬하고 첫 매칭에서 멈춘다.** `쿠팡이츠`(배달)가 `쿠팡`(쇼핑)보다 먼저 검사돼야 한다. **이 우선순위를 테스트로 고정하라** — 순서가 뒤집히면 조용히 틀린 카테고리가 나온다
- 입력은 `normalizeMerchant`를 통과한 값이다. 사전의 `pattern`도 같은 정규화를 적용한 형태로 적는다(소문자·공백제거). 두 쪽 정규화가 다르면 아무것도 매칭되지 않는다
- 국내 실제 가맹점을 최소 60개 넣고 12개 카테고리 각각에 최소 3개씩 배치한다. `구독/멤버십`에는 넷플릭스·유튜브프리미엄·쿠팡플레이·왓챠·티빙·멜론·지니뮤직·스포티파이·애플·구글을 넣는다 — 이게 step 6의 구독 누수 탐지가 쓸 기반이다
- **정규표현식을 쓰지 마라.** 가맹점명에 `(`·`)`·`*`·`+`가 실제로 들어있어 이스케이프 사고가 난다. `String.prototype.includes`로 충분하다

### `src/lib/dedupe.ts`

```ts
computeFileHash(bytes: Uint8Array): string
computeDedupeHash(t: ParsedTransaction, fileHash: string): string
computeCandidateHash(t: ParsedTransaction): string
```

ARCHITECTURE의 버전 태그가 있는 JSON 배열 해시식을 그대로 구현한다. 거래 고유번호가 있으면 출처·유형·청구월과 조합하고, 없으면 출처·파일 해시·데이터 행 위치를 사용한다. 유형 미확정이면 최종 해시는 아직 만들지 않는다. 서로 다른 파일의 `candidateHash` 일치는 확인 후보일 뿐이며 자동 중복 판정에 쓰지 않는다. DB 후보 조회와 사용자 결정 적용은 step 7의 역할이다.

### `src/lib/sanitize.ts`

```ts
buildSanitizedMappingInput(headers: string[], sampleRows: string[][], headerRowIndex: number): SanitizedMappingInput
sanitizeMerchantForLlm(raw: string): string
```

첫 함수는 전체 파싱 **전** 호출된다. 헤더를 공통 의미의 허용 label로 변환하고 모르는 헤더는 `unknown`으로 만든다. 최대 20행에서 값 형식 enum만 추출한다. 원본 헤더·셀·상단 요약문을 반환하지 않는다. 헤더 사전은 은행별 파서가 아닌 일반 컬럼 의미 사전이며 판단 불가는 수동 매핑으로 돌린다. 두 번째 함수는 분류·인사이트용 가맹점명의 계좌/카드번호·전화번호·이메일 패턴을 마스킹하고 200자로 제한한다.

## 테스트에 반드시 포함할 엣지 케이스

TDD이므로 아래를 **테스트로 먼저 작성**하고 통과시킨다.

**인코딩·구조**
- E1 CSV가 아닌 내용 → 명확한 에러
- E2 빈 파일 / 헤더만 존재 → 빈 배열, 예외 없음
- E3 EUC-KR 한글 가맹점명이 깨지지 않고 디코딩되는가
- 상단에 "조회기간: ..." 같은 요약행이 2~3줄 있는 파일에서 헤더를 올바로 찾는가

**금액**
- E4 `"1,234"` · `"₩1,234"` · `"1,234원"` · `"(1,234)"` · `"-1,234"` · `"1234.00"` 전부 정수로
- E5 입금/출금 분리 컬럼 → 금액 절댓값, 불명확한 유형은 null
- E6 명시된 환불/취소 거래 → `kind='refund'`, 금액은 0 이상
- E8 해외결제: 외화 컬럼과 원화환산 컬럼이 둘 다 있을 때 **원화환산만** 쓰는가 (이중 집계 방지)
- E7 할부: 동일 승인일·동일 회차 금액이라도 청구월이 다르면 별개 거래인가
- 카드대금 납부·본인 계좌 이체·급여는 승인한 유형대로 분리되는가

**중복 — 가장 중요**
- 같은 파일의 식별자 없는 동일 날짜·가맹점·금액 2행 → 행 위치로 둘 다 보존
- 같은 출처·같은 파일 재파싱 → 같은 해시 집합
- 다른 카드 출처에서 날짜·가맹점·금액이 같은 거래 → 다른 해시
- 같은 출처의 겹치는 기간을 다른 파일로 받음 → 고유번호는 확정 중복, 번호 없는 유사 거래는 후보만 반환
- 번호 없는 거래를 부분 파일로 받음 → 파일 내 순번으로 기존 거래를 자동 제거하지 않음

**LLM 입력 정제**
- 헤더·요약문·셀에 합성 계좌번호·카드번호·이메일·이름을 넣어도 매핑 입력에는 인덱스·허용 label·형식 enum만 남는가
- 모르는 컬럼명은 원문 대신 unknown인가
- 분류용 가맹점명에 섞인 합성 식별자와 200자 초과 문자열을 처리하는가

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

**TDD 가드: `src/lib/*.ts`는 전부 테스트 파일이 먼저 있어야 작성할 수 있다.** 다섯 모듈 각각의 테스트를 먼저 만들어라.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 다섯 모듈 전부 I/O가 없는가? (import에 supabase·fetch·fs가 없어야 한다)
   - 출처별 확정 중복과 확인 후보를 구분하는가?
   - 매핑 입력에 원본 값이 없고 거래 유형은 카테고리와 독립적인가?
   - `normalizeMerchant`가 지점명을 남기는가?
   - 반환 타입이 `src/types`의 `ParsedTransaction`인가? (새 타입을 만들지 않았는가)
3. `phases/1-ingest/index.json`의 step 4를 업데이트한다.

## 금지사항

- 이 모듈들에서 DB·fetch·Storage를 건드리지 마라. 이유: 순수 함수라야 엣지 케이스를 테스트로 다 덮을 수 있다. I/O는 step 7의 라우트 핸들러가 담당한다.
- 날짜·금액·가맹점·파일 내 순번만으로 파일 간 중복을 확정하지 마라. 출처와 안정적인 거래 식별 근거가 필요하다.
- `normalizeMerchant`에서 지점명·지역명을 제거하지 마라. 이유: 서로 다른 가맹점이 병합되면 되돌릴 수 없다.
- 해외결제에서 외화 금액과 원화환산 금액을 둘 다 더하지 마라. 이유: 이중 집계된다.
- 은행/카드사별 전용 파서를 만들지 마라. 이유: ADR-003에서 LLM 매핑을 택했다. 매핑은 step 5가 추론하고 이 모듈은 매핑을 받아 쓰기만 한다.
- 계좌번호·카드번호 컬럼을 결과에 담지 마라. 이유: LLM 전송과 DB 저장으로 전파된다.
- 새 타입을 정의하지 마라. 이유: step 1이 확정한 `ParsedTransaction`을 쓴다.
