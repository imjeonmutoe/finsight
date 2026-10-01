import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { logEvent } from "./event-log";
import { modelForInsights } from "./limits";
import { generateInsights } from "@/services/claude";
import type { InsightInput, MonthlySummary, Outlier, Subscription } from "@/types/analytics";
import type { Plan } from "@/types/billing";
import type { Transaction } from "@/types/transaction";

/** 한 문장에 붙일 근거 거래 수. 서비스 계층도 3건으로 자른다. */
const EVIDENCE_PER_CATEGORY = 3;

export type Insight = { headline: string; items: { text: string; transactionIds: string[] }[] };

const insightSchema = z.object({
  headline: z.string().min(1),
  items: z.array(z.object({ text: z.string().min(1), transactionIds: z.array(z.string()) })),
});
const cacheRowSchema = z.object({
  payload: insightSchema, txn_fingerprint: z.string(), plan: z.enum(["free", "pro"]),
});

/**
 * queries.ts와 같은 이유로 `select`의 반환을 unknown으로 받는다 — Supabase 쿼리 빌더의
 * 제네릭과 직접 맞추면 실제 클라이언트를 넘길 때 TS2589가 난다. 좁히기는 아래 한 곳뿐이다.
 */
type CacheReadClient = {
  from(table: "insight_cache"): { select(columns: string): unknown };
};
interface CacheFilter {
  eq(column: string, value: string): CacheFilter;
  maybeSingle(): PromiseLike<{ data: unknown; error?: unknown }>;
}
// 캐시 기록은 service role만 한다(RLS). 키가 없는 환경에서는 null을 넘긴다.
type CacheWriteClient = {
  from(table: "insight_cache"): {
    upsert(values: Record<string, unknown>, options: { onConflict: string }): PromiseLike<{ error: unknown }>;
  };
};

/**
 * 해당 월 거래 상태를 한 문자열로 요약한다. 거래 추가·삭제·카테고리 수정·유형 수정이 전부
 * 이 값을 바꾸므로 캐시 무효화 판정에 쓴다. plan은 넣지 않는다 — 별도 컬럼으로 비교한다.
 */
export function insightFingerprint(summary: MonthlySummary): string {
  const byCategory = [...summary.byCategory]
    .sort((left, right) => (left.category ?? "￿").localeCompare(right.category ?? "￿"))
    .map((item) => [item.category, item.amountKrw, item.count]);
  const count = summary.byCategory.reduce((sum, item) => sum + item.count, 0);
  return createHash("sha256")
    .update(JSON.stringify(["fp-v1", count, summary.totalKrw, byCategory]))
    .digest("hex");
}

/**
 * 모델에 보낼 입력을 만든다. 숫자는 전부 이미 계산된 값이고, 근거는 거래 UUID만 담는다.
 * Pro 전용 상세는 호출자가 null을 넘기면 키 자체가 생기지 않는다 — Free 입력에 상세가
 * 섞이면 게이팅이 무의미해진다.
 */
export function buildInsightInput({ summary, transactions, trends, subscriptions, outliers }: {
  summary: MonthlySummary;
  transactions: Transaction[];
  trends: MonthlySummary[] | null;
  subscriptions: Subscription[] | null;
  outliers: Outlier[] | null;
}): InsightInput {
  const evidence = summary.byCategory.flatMap((item) => {
    const transactionIds = transactions
      .filter((transaction) => (transaction.kind === "expense" || transaction.kind === "refund")
        && transaction.category === item.category)
      .slice(0, EVIDENCE_PER_CATEGORY)
      .map((transaction) => transaction.id);
    return transactionIds.length > 0 ? [{ category: item.category, transactionIds }] : [];
  });

  return {
    summary, evidence,
    ...(trends ? { trends } : {}),
    ...(subscriptions ? { subscriptions } : {}),
    ...(outliers ? { outliers } : {}),
  };
}

/**
 * 캐시를 먼저 읽고 미스일 때만 모델을 호출한다. 캐시를 우회하는 경로를 만들지 마라 —
 * 대시보드가 Server Component라 페이지를 열 때마다 모델이 돈다(ADR-012).
 * 모델 호출이 실패하면 캐시에 쓰지 않고 오류를 그대로 올린다. 실패를 캐싱하면 그 달의
 * 요약을 영구히 못 본다.
 */
export async function loadInsight({ supabase, service, userId, plan, input }: {
  supabase: CacheReadClient;
  service: CacheWriteClient | null;
  userId: string;
  plan: Plan;
  input: InsightInput;
}): Promise<Insight> {
  const accountingMonth = `${input.summary.month}-01`;
  const fingerprint = insightFingerprint(input.summary);

  let cached: unknown;
  try {
    const filter = supabase.from("insight_cache").select("payload,txn_fingerprint,plan") as CacheFilter;
    cached = (await filter.eq("user_id", userId).eq("accounting_month", accountingMonth).maybeSingle()).data;
  } catch {
    // 캐시를 읽지 못한 것은 미스와 같다. 여기서 멈추면 요약을 아예 못 본다.
    cached = null;
  }
  const row = cacheRowSchema.safeParse(cached);
  if (row.success && row.data.txn_fingerprint === fingerprint && row.data.plan === plan) {
    return row.data.payload;
  }

  const insight = await generateInsights(input, plan);

  // 캐시 기록 실패는 화면을 막지 않는다. 다음 방문에 다시 시도한다. 대신 흔적을 남긴다 —
  // 기록이 계속 실패하면 페이지를 열 때마다 모델이 돌고, 그걸 청구서로 처음 알게 된다.
  if (!service) {
    logEvent("insight_cache_unavailable");
    return insight;
  }
  try {
    // supabase-js는 오류를 throw하지 않고 { error }로 돌려준다. catch만으로는 못 잡는다.
    const { error } = await service.from("insight_cache").upsert({
      user_id: userId, accounting_month: accountingMonth, payload: insight,
      txn_fingerprint: fingerprint, plan, model: modelForInsights(plan),
    }, { onConflict: "user_id,accounting_month" });
    if (error) logEvent("insight_cache_write_failed");
  } catch {
    logEvent("insight_cache_write_failed");
  }
  return insight;
}
