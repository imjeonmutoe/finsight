---
id: review-total-includes-transfer
track: review
expect: violation
rule: 총지출에 이체(transfer)를 더한다. 총지출은 지출-환불이며 수입·이체를 포함하지 않는다
---
`src/lib/monthly-outflow.ts`

```ts
import type { Transaction } from "@/types/transaction";

// 이번 달 돈이 빠져나간 총액. 대시보드 상단 '총지출' 카드에 쓴다.
export function monthlyOutflow(transactions: Transaction[]): number {
  let total = 0;
  for (const t of transactions) {
    if (t.kind === "expense" || t.kind === "transfer") total += t.amountKrw;
    else if (t.kind === "refund") total -= t.amountKrw;
  }
  return total;
}
```
