import { cookies } from "next/headers";
import { z } from "zod";
import { errorResponse, jsonResponse, requireUserId } from "@/lib/api";
import { CLASSIFICATION_BATCH_SIZE } from "@/lib/limits";
import { classifyByRule } from "@/lib/merchant-rules";
import { classifyTransactions } from "@/services/claude";
import { createServerSupabase } from "@/services/supabase";
import type { ClassifyResponse } from "@/types/api";
import { CATEGORIES } from "@/types/category";
import type { Category } from "@/types/category";
import type { CategorySource } from "@/types/transaction";

const CLASSIFIABLE = ["expense", "refund"] as const;
const READ_FAILED = "분류할 거래를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
const WRITE_FAILED = "분류 결과를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const MODEL_FAILED = "일부 거래를 분류하지 못했습니다. 거래 탭에서 직접 카테고리를 고를 수 있습니다.";

const batchSchema = z.array(z.object({
  id: z.string(), merchant_raw: z.string(), merchant_norm: z.string(),
  amount_krw: z.number().int().nonnegative(),
}));
const ruleSchema = z.array(z.object({ merchant_norm: z.string(), category: z.enum(CATEGORIES) }));
const updatedSchema = z.array(z.object({ id: z.string() }));

export async function POST() {
  const supabase = createServerSupabase(await cookies());
  const userId = await requireUserId(supabase);
  if (!userId) return errorResponse(401, "UNAUTHORIZED", "로그인이 필요합니다. 다시 로그인해 주세요.");

  // 1 요청 = 1 배치. 서버는 루프를 돌지 않습니다(ADR-006). 동시 호출을 막는 락도 두지 않습니다(ADR-012).
  const selected = await supabase.from("transactions").select("id,merchant_raw,merchant_norm,amount_krw")
    .eq("user_id", userId).in("kind", CLASSIFIABLE).is("category", null)
    .order("id", { ascending: true }).limit(CLASSIFICATION_BATCH_SIZE);
  const batch = batchSchema.safeParse(selected.data);
  if (selected.error || !batch.success) return errorResponse(500, "READ_FAILED", READ_FAILED);
  if (batch.data.length === 0) return jsonResponse({ classified: 0, remaining: 0 } satisfies ClassifyResponse);

  async function countRemaining(): Promise<number> {
    const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true })
      .eq("user_id", userId).in("kind", CLASSIFIABLE).is("category", null);
    return count ?? 0;
  }

  // ① 사용자가 만든 규칙이 우리 사전이나 모델보다 항상 우선합니다.
  const merchants = [...new Set(batch.data.map((row) => row.merchant_norm))];
  const rules = ruleSchema.safeParse((await supabase.from("merchant_rules").select("merchant_norm,category")
    .eq("user_id", userId).in("merchant_norm", merchants)).data);
  if (!rules.success) return errorResponse(500, "READ_FAILED", READ_FAILED);
  const userRules = new Map(rules.data.map((rule) => [rule.merchant_norm, rule.category]));

  const decided = new Map<string, { category: Category; source: CategorySource }>();
  const remainder: { id: string; merchant: string; amountKrw: number }[] = [];
  for (const row of batch.data) {
    const fromUser = userRules.get(row.merchant_norm);
    // ② 내장 가맹점 사전. ①②는 결정론적이며 모델 호출이 0회입니다(ADR-011).
    const fromRule = fromUser ? null : classifyByRule(row.merchant_norm);
    if (fromUser) decided.set(row.id, { category: fromUser, source: "user" });
    else if (fromRule) decided.set(row.id, { category: fromRule, source: "rule" });
    else remainder.push({ id: row.id, merchant: row.merchant_raw, amountKrw: row.amount_krw });
  }

  // ③ 규칙이 못 잡은 것만 모델에 넘깁니다. 0건이면 호출하지 않습니다.
  let modelFailed = false;
  if (remainder.length > 0) {
    try {
      for (const item of await classifyTransactions(remainder)) {
        // 반환은 id로만 매칭합니다. 배열 순서나 길이를 신뢰하지 않습니다.
        decided.set(item.id, { category: item.category, source: "ai" });
      }
    } catch {
      modelFailed = true;
    }
  }

  // 같은 (카테고리, 출처)끼리 묶어 한 번씩 갱신합니다.
  const groups = new Map<string, { category: Category; source: CategorySource; ids: string[] }>();
  for (const [id, { category, source }] of decided) {
    const key = `${source}:${category}`;
    const group = groups.get(key) ?? { category, source, ids: [] };
    group.ids.push(id);
    groups.set(key, group);
  }

  let classified = 0;
  for (const group of groups.values()) {
    // category IS NULL 조건이 사용자 수정을 보존하고 동시 호출을 멱등하게 만듭니다.
    const updated = await supabase.from("transactions")
      .update({ category: group.category, category_source: group.source })
      .eq("user_id", userId).in("id", group.ids).is("category", null).select("id");
    const rows = updatedSchema.safeParse(updated.data);
    if (updated.error || !rows.success) return errorResponse(500, "WRITE_FAILED", WRITE_FAILED);
    classified += rows.data.length;
  }

  const remaining = await countRemaining();
  if (modelFailed) {
    return errorResponse(502, "CLASSIFY_FAILED", MODEL_FAILED, { classified, remaining });
  }
  return jsonResponse({ classified, remaining } satisfies ClassifyResponse);
}
