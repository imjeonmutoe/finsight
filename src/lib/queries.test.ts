// @vitest-environment node

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CATEGORIES } from "@/types/category";
import { getCategoryMedians, getMonthlySummary, getMonthlyTrend, getTransactionsForMerchants } from "./queries";

vi.mock("server-only", () => ({}));
afterEach(() => vi.useRealTimers());

function client(data: unknown = [], error: unknown = null) {
  const result = { data, error };
  const filter = {
    eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue(result),
  };
  const select = vi.fn().mockReturnValue(filter);
  return { rpc: vi.fn().mockResolvedValue(result), from: vi.fn().mockReturnValue({ select }), select, filter };
}

const row = {
  id: "거래", user_id: "사용자", source_id: "카드", upload_id: "업로드",
  occurred_on: "2026-01-15", accounting_month: "2026-02-01",
  merchant_raw: "정기 서비스", merchant_norm: "정기서비스", amount_krw: "10000",
  kind: "expense", category: "구독/멤버십", category_source: "rule",
  source_transaction_key: null, data_row_index: 0, dedupe_hash: "해시", candidate_hash: "후보",
};

describe("월별 SQL 집계 조회", () => {
  it("RPC에 user_id와 청구월 범위를 명시하고 SQL 합계를 그대로 반환합니다", async () => {
    const supabase = client([{
      month: "2026-01", totalKrw: "80000",
      byCategory: [{ category: "쇼핑", amountKrw: "80000", count: "2" }],
    }]);
    expect(await getMonthlySummary(supabase, "사용자", "2026-01")).toEqual({
      month: "2026-01", totalKrw: 80_000,
      byCategory: [{ category: "쇼핑", amountKrw: 80_000, count: 2 }],
    });
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith("analytics_monthly_summaries", {
      p_user_id: "사용자", p_start_month: "2026-01-01", p_end_month: "2026-02-01",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("환불만 있는 음수 순지출과 미분류 null 묶음을 유지합니다", async () => {
    const summary = { month: "2026-01", totalKrw: -20_000, byCategory: [{ category: null, amountKrw: -20_000, count: 1 }] };
    expect(await getMonthlySummary(client([summary]), "사용자", "2026-01")).toEqual(summary);
  });

  it("거래가 없는 월은 0과 빈 카테고리를 반환합니다", async () => {
    expect(await getMonthlySummary(client(), "사용자", "2026-01"))
      .toEqual({ month: "2026-01", totalKrw: 0, byCategory: [] });
  });

  it("추이는 KST 현재 월을 포함하고 빈 달을 채워 과거부터 정렬합니다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-12-31T15:00:00Z"));
    const summary = { month: "2026-01", totalKrw: 100_000, byCategory: [] };
    const supabase = client([summary]);
    expect(await getMonthlyTrend(supabase, "사용자", 3)).toEqual([
      { month: "2025-11", totalKrw: 0, byCategory: [] },
      { month: "2025-12", totalKrw: 0, byCategory: [] }, summary,
    ]);
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith("analytics_monthly_summaries", {
      p_user_id: "사용자", p_start_month: "2025-11-01", p_end_month: "2026-02-01",
    });
  });

  it.each(["2026-00", "2026-13", "2026-1", "2026-01-01"])("잘못된 청구월 %s는 DB 호출 전에 거절합니다", async (month) => {
    const supabase = client();
    await expect(getMonthlySummary(supabase, "사용자", month)).rejects.toThrow("조회할 월을 확인해 주세요.");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, NaN, Infinity])("잘못된 개월 수 %s는 DB 호출 전에 거절합니다", async (months) => {
    const supabase = client();
    await expect(getMonthlyTrend(supabase, "사용자", months)).rejects.toThrow("조회할 개월 수를 확인해 주세요.");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("정수 정밀도가 손실될 SQL 합계는 조용히 반올림하지 않습니다", async () => {
    const supabase = client([{ month: "2026-01", totalKrw: "9007199254740993", byCategory: [] }]);
    await expect(getMonthlySummary(supabase, "사용자", "2026-01")).rejects.toThrow("조회 결과를 확인할 수 없습니다. 다시 시도해 주세요.");
  });
});

describe("중앙값과 가맹점별 지출 조회", () => {
  it("중앙값 RPC에도 user_id를 전달하고 누락 카테고리는 0으로 채웁니다", async () => {
    const supabase = client([{ category: "쇼핑", medianKrw: "20000" }]);
    const result = await getCategoryMedians(supabase, "사용자");
    expect(result).toEqual(Object.fromEntries(CATEGORIES.map((category) => [category, category === "쇼핑" ? 20_000 : 0])));
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith("analytics_category_medians", { p_user_id: "사용자" });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("명시한 가맹점과 user_id의 지출만 조회하고 공유 Transaction으로 변환합니다", async () => {
    const supabase = client([row]);
    expect(await getTransactionsForMerchants(supabase, "사용자", ["정기서비스"])).toEqual([{
      id: "거래", userId: "사용자", sourceId: "카드", uploadId: "업로드",
      occurredOn: "2026-01-15", accountingMonth: "2026-02",
      merchantRaw: "정기 서비스", merchantNorm: "정기서비스", amountKrw: 10_000,
      kind: "expense", category: "구독/멤버십", categorySource: "rule",
      sourceTransactionKey: null, dataRowIndex: 0, dedupeHash: "해시", candidateHash: "후보",
    }]);
    expect(supabase.from).toHaveBeenCalledWith("transactions");
    expect(supabase.filter.eq).toHaveBeenCalledWith("user_id", "사용자");
    expect(supabase.filter.eq).toHaveBeenCalledWith("kind", "expense");
    expect(supabase.filter.in).toHaveBeenCalledWith("merchant_norm", ["정기서비스"]);
    expect(supabase.select.mock.calls[0]?.[0]).not.toContain("*");
    expect(supabase.filter.order).toHaveBeenCalledWith("occurred_on", { ascending: true });
    expect(supabase.filter.order).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("빈 가맹점 목록으로 전체 거래를 읽지 않습니다", async () => {
    const supabase = client();
    expect(await getTransactionsForMerchants(supabase, "사용자", [])).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("서버 행 제한으로 잘리지 않도록 페이지마다 같은 사용자·가맹점 필터를 적용합니다", async () => {
    const supabase = client();
    supabase.filter.range.mockResolvedValueOnce({ data: Array(1000).fill(row), error: null })
      .mockResolvedValueOnce({ data: [{ ...row, id: "마지막거래" }], error: null });
    expect(await getTransactionsForMerchants(supabase, "사용자", ["정기서비스"])).toHaveLength(1001);
    expect(supabase.filter.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(supabase.filter.eq.mock.calls.filter(([key]) => key === "user_id"))
      .toEqual([["user_id", "사용자"], ["user_id", "사용자"]]);
    expect(supabase.filter.in).toHaveBeenCalledTimes(2);
  });
});

describe("조회 실패", () => {
  it.each([
    (supabase: ReturnType<typeof client>) => getMonthlySummary(supabase, "사용자", "2026-01"),
    (supabase: ReturnType<typeof client>) => getMonthlyTrend(supabase, "사용자", 3),
    (supabase: ReturnType<typeof client>) => getCategoryMedians(supabase, "사용자"),
    (supabase: ReturnType<typeof client>) => getTransactionsForMerchants(supabase, "사용자", ["정기서비스"]),
  ])("DB 오류를 빈 성공 결과로 숨기거나 원문으로 노출하지 않습니다", async (query) => {
    await expect(query(client(null, { message: "DB 내부 오류" }))).rejects.toThrow("거래 정보를 불러오지 못했습니다. 다시 시도해 주세요.");
    await expect(query(client(null))).rejects.toThrow("조회 결과를 확인할 수 없습니다. 다시 시도해 주세요.");
  });
});

describe("집계 SQL의 경계", () => {
  function sql() {
    return readFileSync(new URL("../../supabase/migrations/0002_analytics.sql", import.meta.url), "utf8")
      .replace(/--[^\n]*/g, "").replace(/\s+/g, " ").toLowerCase();
  }

  it("월별·카테고리별 지출-환불을 SQL GROUP BY로 합산합니다", () => {
    expect(sql()).toContain("group by t.accounting_month, t.category");
    expect(sql()).toContain("case t.kind when 'expense' then t.amount_krw when 'refund' then -t.amount_krw");
    expect(sql()).toContain("t.kind in ('expense', 'refund')");
    expect(sql()).toContain("t.accounting_month >= p_start_month");
    expect(sql()).toContain("t.accounting_month < p_end_month");
  });

  it("두 SQL 함수 모두 RLS를 따르고 별도 사용자 조건과 실행 권한을 둡니다", () => {
    expect(sql().match(/security invoker/g)).toHaveLength(2);
    expect(sql().match(/t.user_id = p_user_id/g)).toHaveLength(2);
    expect(sql().match(/p_user_id = \(select auth.uid\(\)\)/g)).toHaveLength(2);
    expect(sql().match(/set search_path = ''/g)).toHaveLength(2);
    expect(sql()).not.toContain("security definer");
    expect(sql().match(/from public, anon/g)).toHaveLength(2);
  });

  it("중앙값은 분류된 지출 3건 이상에서 SQL로 계산하고 원 단위로 반올림합니다", () => {
    expect(sql()).toContain("t.kind = 'expense'");
    expect(sql()).toContain("t.category is not null");
    expect(sql()).toContain("sample_count >= 3");
    expect(sql()).toContain("round(avg(amount_krw))");
    expect(sql()).not.toContain("double precision");
  });
});
