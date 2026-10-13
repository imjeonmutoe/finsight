---
id: review-classification-order
track: review
expect: violation
rule: 카테고리 분류 3단 순서(merchant_rules → 내장 가맹점 규칙 사전 → Claude 배치)를 건너뛰고 전량 Claude로 분류한다
---
`src/app/api/upload/classify.ts`

```ts
import "server-only";
import { classifyTransactions } from "@/services/claude";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PendingTransaction } from "@/types/upload";

// 규칙 사전은 커버리지가 낮아서 정확도를 위해 전부 모델에 맡긴다.
export async function classifyUpload(
  supabase: SupabaseClient, userId: string, pending: PendingTransaction[],
) {
  const categories = await classifyTransactions(pending.map((t) => ({ id: t.id, merchant: t.merchant })));
  for (const { id, category } of categories) {
    await supabase.from("transactions").update({ category }).eq("id", id).eq("user_id", userId);
  }
}
```
