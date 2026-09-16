import "server-only";

import { z } from "zod";
import type { MonthlySummary } from "@/types/analytics";
import { CATEGORIES } from "@/types/category";
import type { Category } from "@/types/category";
import type { Transaction } from "@/types/transaction";

// 인증 단계에서 생성한 사용자 세션 클라이언트를 주입합니다. SDK 생성이나 service role 사용은 없습니다.
type QueryResult = { data: unknown; error: unknown };
type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<QueryResult>;
};
interface TransactionFilter {
  eq(column: string, value: string): TransactionFilter;
  in(column: string, values: string[]): TransactionFilter;
  order(column: string, options: { ascending: boolean }): TransactionFilter;
  range(from: number, to: number): PromiseLike<QueryResult>;
}
/**
 * `select`의 반환을 unknown으로 받는 이유: Supabase 쿼리 빌더의 제네릭이 깊어, 우리 필터
 * 타입과 직접 맞추면 실제 클라이언트를 넘길 때 타입 인스턴스화 깊이 제한(TS2589)에 걸린다.
 * 좁히기는 transactionFilter() 한 곳에서만 한다.
 */
type TransactionClient = {
  from(table: "transactions"): { select(columns: string): unknown };
};
/**
 * 대시보드처럼 집계 RPC와 거래 조회를 함께 쓰는 호출자용. 두 타입의 교차(&)로 쓰면
 * Supabase 클라이언트를 넘길 때 타입 인스턴스화 깊이 제한(TS2589)에 걸린다.
 */
export type QueriesClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<QueryResult>;
  from(table: "transactions"): { select(columns: string): unknown };
};

const integer = z.union([z.number(), z.string().regex(/^-?\d+$/)]).transform(Number).pipe(z.number().int());
const nonnegativeInteger = integer.refine((value) => value >= 0);
const category = z.enum(CATEGORIES);
const summariesSchema = z.array(z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  totalKrw: integer,
  byCategory: z.array(z.object({ category: category.nullable(), amountKrw: integer, count: nonnegativeInteger })),
}));
const mediansSchema = z.array(z.object({ category, medianKrw: nonnegativeInteger }));
const transactionsSchema = z.array(z.object({
  id: z.string(), user_id: z.string(), source_id: z.string(), upload_id: z.string(),
  occurred_on: z.iso.date(), accounting_month: z.iso.date().regex(/-01$/),
  merchant_raw: z.string(), merchant_norm: z.string(), amount_krw: nonnegativeInteger,
  kind: z.enum(["expense", "income", "refund", "transfer"]), category: category.nullable(),
  category_source: z.enum(["ai", "rule", "user"]).nullable(),
  source_transaction_key: z.string().nullable(), data_row_index: nonnegativeInteger,
  dedupe_hash: z.string(), candidate_hash: z.string(),
}));

async function readQuery<T>(query: PromiseLike<QueryResult>, schema: z.ZodType<T>): Promise<T> {
  let result: QueryResult;
  try {
    result = await query;
  } catch {
    throw new Error("거래 정보를 불러오지 못했습니다. 다시 시도해 주세요.");
  }
  if (result.error) throw new Error("거래 정보를 불러오지 못했습니다. 다시 시도해 주세요.");
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) throw new Error("조회 결과를 확인할 수 없습니다. 다시 시도해 주세요.");
  return parsed.data;
}

function monthIndex(month: string): number {
  if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("조회할 월을 확인해 주세요.");
  }
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
}

function monthAt(index: number): string {
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String(index % 12 + 1).padStart(2, "0")}`;
}

function readSummaries(supabase: RpcClient, userId: string, start: number, end: number): Promise<MonthlySummary[]> {
  return readQuery(supabase.rpc("analytics_monthly_summaries", {
    p_user_id: userId, p_start_month: `${monthAt(start)}-01`, p_end_month: `${monthAt(end)}-01`,
  }), summariesSchema);
}

export async function getMonthlySummary(supabase: RpcClient, userId: string, month: string): Promise<MonthlySummary> {
  const start = monthIndex(month);
  const summaries = await readSummaries(supabase, userId, start, start + 1);
  return summaries.find((summary) => summary.month === month) ?? { month, totalKrw: 0, byCategory: [] };
}

// KST 현재 월을 포함한 최근 N개 캘린더 월. 빈 달은 0으로 채우며 합산은 SQL만 합니다.
export async function getMonthlyTrend(supabase: RpcClient, userId: string, months: number): Promise<MonthlySummary[]> {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const end = kst.getUTCFullYear() * 12 + kst.getUTCMonth() + 1;
  if (!Number.isSafeInteger(months) || months <= 0 || end - months < 12) {
    throw new Error("조회할 개월 수를 확인해 주세요.");
  }
  const summaries = await readSummaries(supabase, userId, end - months, end);
  const byMonth = new Map(summaries.map((summary) => [summary.month, summary]));
  return Array.from({ length: months }, (_, index) => {
    const month = monthAt(end - months + index);
    return byMonth.get(month) ?? { month, totalKrw: 0, byCategory: [] };
  });
}

export async function getCategoryMedians(supabase: RpcClient, userId: string): Promise<Record<Category, number>> {
  const rows = await readQuery(supabase.rpc("analytics_category_medians", { p_user_id: userId }), mediansSchema);
  const byCategory = new Map(rows.map((row) => [row.category, row.medianKrw]));
  // CATEGORIES 전체를 순회하므로 모든 키가 있습니다. 표본 3건 미만은 SQL 결과에서 빠집니다.
  return Object.fromEntries(CATEGORIES.map((category) => [category, byCategory.get(category) ?? 0])) as Record<Category, number>;
}

const TRANSACTION_COLUMNS = [
  "id", "user_id", "source_id", "upload_id", "occurred_on", "accounting_month",
  "merchant_raw", "merchant_norm", "amount_krw", "kind", "category", "category_source",
  "source_transaction_key", "data_row_index", "dedupe_hash", "candidate_hash",
].join(",");
const PAGE_SIZE = 1000;

/**
 * 서버 행 제한으로 결과가 조용히 잘리지 않도록 페이지마다 필터를 다시 건다. Supabase 필터는
 * 재사용할 수 없으므로 호출자가 페이지마다 질의를 새로 만든다.
 */
function transactionFilter(supabase: TransactionClient): TransactionFilter {
  return supabase.from("transactions").select(TRANSACTION_COLUMNS) as TransactionFilter;
}

async function collectTransactions(
  buildPage: (offset: number) => PromiseLike<QueryResult>,
): Promise<Transaction[]> {
  const transactions: Transaction[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const rows = await readQuery(buildPage(offset), transactionsSchema);
    for (const row of rows) {
      transactions.push({
        id: row.id, userId: row.user_id, sourceId: row.source_id, uploadId: row.upload_id,
        occurredOn: row.occurred_on, accountingMonth: row.accounting_month.slice(0, 7),
        merchantRaw: row.merchant_raw, merchantNorm: row.merchant_norm, amountKrw: row.amount_krw,
        kind: row.kind, category: row.category, categorySource: row.category_source,
        sourceTransactionKey: row.source_transaction_key, dataRowIndex: row.data_row_index,
        dedupeHash: row.dedupe_hash, candidateHash: row.candidate_hash,
      });
    }
    if (rows.length < PAGE_SIZE) return transactions;
  }
}

export async function getTransactionsForMerchants(
  supabase: TransactionClient, userId: string, merchantNorms: string[],
): Promise<Transaction[]> {
  if (merchantNorms.length === 0) return [];
  const merchants = [...new Set(merchantNorms)];
  return collectTransactions((offset) => transactionFilter(supabase)
    .eq("user_id", userId).eq("kind", "expense").in("merchant_norm", merchants)
    .order("occurred_on", { ascending: true }).order("id", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1));
}

/**
 * 화면에 표시할 청구월의 거래 전부. 유형으로 거르지 않는다 — 수입·이체도 목록에 보여야
 * 사용자가 유형을 고칠 수 있다. 총지출 집계는 여기가 아니라 SQL(getMonthlySummary)이 한다.
 */
export async function getTransactionsForMonth(
  supabase: TransactionClient, userId: string, month: string,
): Promise<Transaction[]> {
  monthIndex(month);
  return collectTransactions((offset) => transactionFilter(supabase)
    .eq("user_id", userId).eq("accounting_month", `${month}-01`)
    .order("occurred_on", { ascending: false }).order("id", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1));
}
