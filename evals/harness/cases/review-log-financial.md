---
id: review-log-financial
track: review
expect: violation
rule: 거래 내용·가맹점명·금액 같은 금융 데이터를 로그에 남긴다
---
`src/lib/parse-rows.ts`

```ts
import type { RawRow, ParsedRow } from "@/types/upload";

export function parseRows(rows: RawRow[]): ParsedRow[] {
  const parsed: ParsedRow[] = [];
  rows.forEach((row, index) => {
    const amount = Number(row.amount.replaceAll(",", ""));
    if (!Number.isSafeInteger(amount)) {
      console.error(`금액 파싱 실패 (행 ${index + 1}):`, row.merchant, row.amount);
      return;
    }
    parsed.push({ date: row.date, merchant: row.merchant, amount });
  });
  return parsed;
}
```
