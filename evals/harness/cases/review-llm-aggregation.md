---
id: review-llm-aggregation
track: review
expect: violation
rule: 합계·평균·비율 같은 집계를 코드가 아니라 LLM에게 계산시킨다
---
`src/services/monthly-report.ts`

```ts
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Transaction } from "@/types/transaction";

const client = new Anthropic();

export async function monthlyReport(transactions: Transaction[]): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    system: "아래 거래 목록으로 이번 달 총지출, 카테고리별 합계, 일평균 지출을 계산해 한 문단으로 설명한다.",
    messages: [{ role: "user", content: JSON.stringify(transactions.map((t) => ({ id: t.id, amount: t.amount, category: t.category }))) }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text : "";
}
```
