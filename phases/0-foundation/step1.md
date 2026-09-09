# Step 1: core-types

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — **`## 공유 인터페이스` 섹션이 이 step의 사양서다.** 그리고 `## 데이터 모델`의 불변 규칙
- `/docs/ADR.md` — ADR-002 (고정 카테고리)
- 이전 step 산출물: `package.json`, `tsconfig.json`, `src/app/globals.css`

## 작업

**이 step의 유일한 임무는 이후 12개 step이 공유할 타입을 확정하는 것이다.**

각 step은 독립된 세션에서 실행되고, 앞선 step의 산출물은 한 줄 요약으로만 전달된다. 여기서 타입을 확정하지 않으면 step 4(파서)와 step 5(분류기)와 step 7(라우트)이 각자 다른 모양을 발명하고, step 7에서 조립할 때 전부 어긋난 걸 발견하게 된다.

`/docs/ARCHITECTURE.md`의 `## 공유 인터페이스` 코드 블록을 **그대로** 아래 파일로 옮긴다. 임의로 필드를 추가하거나 이름을 바꾸지 마라.

| 파일 | 내용 |
|---|---|
| `src/types/category.ts` | `CATEGORIES` 상수(12개, `as const`), `Category` 타입 |
| `src/types/upload.ts` | `FinancialSource`, `MappingLabel`, `SanitizedMappingInput`, `ColumnMapping`, `ImportContext`, `UploadStatus` |
| `src/types/transaction.ts` | `TransactionKind`, `ParsedTransaction`, `CategorySource`, DB 행 타입 |
| `src/types/api.ts` | `MappingResponse`, `ConfirmRequest`, `DuplicateDecision`, `ImportReviewResponse`, `ConfirmResponse`, `ClassifyResponse` |
| `src/types/billing.ts` | `Plan` (`'free' | 'pro'`), 프로필 관련 타입 |

추가로 정의할 것:

- `src/types/transaction.ts`에 DB에서 읽어온 거래 행 타입 `Transaction` — `ParsedTransaction`의 `kind`·`dedupeHash`·`candidateHash`를 non-null로 좁히고 `id`, `userId`, `uploadId`, `category: Category | null`, `categorySource: 'ai' | 'rule' | 'user' | null`을 추가한다. `ImportContext`가 참조하는 `TransactionKind`는 type import로 연결한다.
- `src/types/analytics.ts` — step 6과 8이 공유할 집계 결과 타입:
  ```ts
  export type MonthlySummary = {
    month: string                                   // 'YYYY-MM'
    totalKrw: number                                 // 지출-환불, 수입/이체 제외
    byCategory: { category: Category | null; amountKrw: number; count: number }[]
  }
  export type Subscription = {
    merchantNorm: string; displayName: string
    monthlyKrw: number; occurrences: number
    lastChargedOn: string; amountIncreased: boolean
  }
  export type Outlier = {
    transactionId: string; merchantRaw: string
    amountKrw: number; category: Category; medianKrw: number
  }
  ```

`src/types/index.ts`에서 전부 re-export 한다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
```

추가 확인:
```bash
# 카테고리가 정확히 12개인지
node -e "
const s=require('fs').readFileSync('src/types/category.ts','utf8');
const m=s.match(/CATEGORIES\s*=\s*\[([\s\S]*?)\]\s*as const/);
const n=m[1].split(',').filter(x=>x.trim()).length;
if(n!==12) throw new Error('카테고리가 '+n+'개 — 12개여야 함');
console.log('카테고리 12개 OK');
"
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 타입 이름과 필드가 `ARCHITECTURE.md`의 `## 공유 인터페이스`와 **한 글자도 다르지 않은가?**
   - `ParsedTransaction`에 `sourceId`·`kind`·`accountingMonth`·`sourceTransactionKey`·`dataRowIndex`·두 해시가 있는가?
   - `ColumnMapping`이 컬럼 인덱스를 사용하고 `SanitizedMappingInput`에 임의 원본 문자열 필드가 없는가?
   - 승인 요청에 행별 유형 수정·중복 확인이 있고 409 응답 타입이 공유되는가?
3. `phases/0-foundation/index.json`의 step 1을 업데이트한다. `summary`에 **정의한 타입 이름을 전부 나열**하라 — 이후 step이 이 요약만 보고 import 대상을 판단한다.

## 금지사항

- 타입 파일에 로직을 넣지 마라. 이유: `src/types/`는 TDD 가드 면제 대상인데, 로직이 들어가면 테스트 없는 코드가 된다. 상수 배열과 타입 선언만 둔다.
- zod 같은 런타임 검증 라이브러리를 도입하지 마라. 이유: 요청받지 않았고, MVP에 의존성을 늘린다. 검증이 필요한 곳은 각 step에서 직접 좁힌다.
- `ARCHITECTURE.md`에 없는 타입을 임의로 추가하지 마라. 이유: 여기 있는 것이 계약이다. 필요해 보이는 게 있으면 그 step에서 로컬 타입으로 만들되, 여러 step이 공유해야 하면 문서를 먼저 고쳐야 한다.
- 카테고리 목록을 바꾸지 마라. 이유: DB CHECK 제약(step 2)과 LLM enum(step 5)이 이 목록과 정확히 일치해야 한다.
