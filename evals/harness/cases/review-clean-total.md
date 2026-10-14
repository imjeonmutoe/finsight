---
id: review-clean-total
track: review
expect: pass
---
`src/lib/total-spend.ts` (같은 폴더에 `total-spend.test.ts`가 먼저 커밋돼 있다)

```ts
import type { Transaction } from "@/types/transaction";

// 총지출 = 지출 - 환불. 수입·이체는 넣지 않는다. 금액은 원 단위 정수다.
export function totalSpend(transactions: Transaction[]): number {
  let total = 0;
  for (const t of transactions) {
    if (t.kind === "expense") total += t.amountKrw;
    else if (t.kind === "refund") total -= t.amountKrw;
  }
  return total;
}

export function invalidRowMessage(index: number): string {
  // 행 내용 대신 행 번호만 남긴다.
  return `${index + 1}번째 행을 읽지 못했습니다.`;
}
```
