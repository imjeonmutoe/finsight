// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MonthlySummary, Outlier, Subscription } from "@/types/analytics";
import type { Transaction } from "@/types/transaction";

vi.mock("server-only", () => ({}));
vi.mock("@/services/claude", () => ({ generateInsights: vi.fn() }));
vi.mock("./event-log", () => ({ logEvent: vi.fn() }));

const { generateInsights } = await import("@/services/claude");
const { logEvent } = await import("./event-log");
const { buildInsightInput, insightFingerprint, loadInsight } = await import("./insights");

const summary: MonthlySummary = {
  month: "2026-04", totalKrw: 415_900,
  byCategory: [
    { category: "구독/멤버십", amountKrw: 15_900, count: 1 },
    { category: "쇼핑", amountKrw: 400_000, count: 2 },
  ],
};
const payload = { headline: "4월 지출을 정리했습니다.", items: [
  { text: "구독/멤버십에 ₩15,900을 썼습니다.", transactionIds: ["00000000-0000-4000-8000-000000000001"] },
] };

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "00000000-0000-4000-8000-000000000001", userId: "사용자", sourceId: "카드", uploadId: "업로드",
    occurredOn: "2026-04-15", accountingMonth: "2026-04", merchantRaw: "정기 서비스",
    merchantNorm: "정기서비스", amountKrw: 15_900, kind: "expense", category: "구독/멤버십",
    categorySource: "rule", sourceTransactionKey: null, dataRowIndex: 0,
    dedupeHash: "해시", candidateHash: "후보", ...overrides,
  };
}

function reader(row: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const filter = { eq: vi.fn().mockReturnThis(), maybeSingle };
  const select = vi.fn().mockReturnValue(filter);
  return { from: vi.fn().mockReturnValue({ select }), select, filter };
}

function writer() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  return { from: vi.fn().mockReturnValue({ upsert }), upsert };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(generateInsights).mockResolvedValue(payload);
});

describe("거래 지문", () => {
  it("같은 월 집계는 같은 지문을 냅니다", () => {
    expect(insightFingerprint(summary)).toBe(insightFingerprint({ ...summary, byCategory: [...summary.byCategory] }));
  });

  it.each([
    ["총지출", { ...summary, totalKrw: 415_800 }],
    ["카테고리 합계", { ...summary, byCategory: [{ category: "구독/멤버십" as const, amountKrw: 15_800, count: 1 },
      { category: "쇼핑" as const, amountKrw: 400_000, count: 2 }] }],
    ["거래 건수", { ...summary, byCategory: [{ category: "구독/멤버십" as const, amountKrw: 15_900, count: 2 },
      { category: "쇼핑" as const, amountKrw: 400_000, count: 2 }] }],
  ])("%s가 달라지면 지문도 달라집니다", (_label, changed) => {
    expect(insightFingerprint(changed)).not.toBe(insightFingerprint(summary));
  });

  it("카테고리 순서가 뒤바뀌어도 같은 지문을 냅니다", () => {
    expect(insightFingerprint({ ...summary, byCategory: [...summary.byCategory].reverse() }))
      .toBe(insightFingerprint(summary));
  });
});

describe("인사이트 입력", () => {
  const trends: MonthlySummary[] = [summary];
  const subscriptions: Subscription[] = [{
    merchantNorm: "정기서비스", displayName: "정기 서비스", monthlyKrw: 15_900,
    occurrences: 3, lastChargedOn: "2026-04-15", amountIncreased: false,
  }];
  const outliers: Outlier[] = [{
    transactionId: "00000000-0000-4000-8000-000000000002", merchantRaw: "동네 상점",
    amountKrw: 400_000, category: "쇼핑", medianKrw: 30_000,
  }];

  it("Free 입력에는 Pro 전용 상세를 넣지 않습니다", () => {
    const input = buildInsightInput({
      summary, transactions: [transaction()], trends: null, subscriptions: null, outliers: null,
    });

    expect(input.trends).toBeUndefined();
    expect(input.subscriptions).toBeUndefined();
    expect(input.outliers).toBeUndefined();
    expect(input.summary).toEqual(summary);
  });

  it("Pro 입력에는 추이·구독·이상거래를 함께 넣습니다", () => {
    const input = buildInsightInput({
      summary, transactions: [transaction()], trends, subscriptions, outliers,
    });

    expect(input.trends).toEqual(trends);
    expect(input.subscriptions).toEqual(subscriptions);
    expect(input.outliers).toEqual(outliers);
  });

  it("근거는 카테고리별 거래 UUID만 담고 가맹점명·금액은 담지 않습니다", () => {
    const input = buildInsightInput({
      summary,
      transactions: [
        transaction(),
        transaction({ id: "00000000-0000-4000-8000-000000000003", category: "쇼핑", amountKrw: 400_000 }),
        transaction({ id: "00000000-0000-4000-8000-000000000004", kind: "income", category: null }),
      ],
      trends: null, subscriptions: null, outliers: null,
    });

    expect(input.evidence).toEqual([
      { category: "구독/멤버십", transactionIds: ["00000000-0000-4000-8000-000000000001"] },
      { category: "쇼핑", transactionIds: ["00000000-0000-4000-8000-000000000003"] },
    ]);
    expect(JSON.stringify(input.evidence)).not.toContain("정기 서비스");
    expect(JSON.stringify(input.evidence)).not.toContain("15900");
  });
});

describe("인사이트 캐시", () => {
  const input = buildInsightInput({ summary, transactions: [transaction()], trends: null, subscriptions: null, outliers: null });

  function cachedRow(overrides: Record<string, unknown> = {}) {
    return { payload, txn_fingerprint: insightFingerprint(summary), plan: "free", ...overrides };
  }

  it("지문과 플랜이 모두 맞으면 모델을 호출하지 않습니다", async () => {
    const supabase = reader(cachedRow());

    expect(await loadInsight({ supabase, service: writer(), userId: "사용자", plan: "free", input })).toEqual(payload);
    expect(generateInsights).not.toHaveBeenCalled();
    expect(supabase.filter.eq).toHaveBeenCalledWith("user_id", "사용자");
    expect(supabase.filter.eq).toHaveBeenCalledWith("accounting_month", "2026-04-01");
  });

  it.each([
    ["거래가 바뀌면", cachedRow({ txn_fingerprint: "다른지문" })],
    ["플랜이 바뀌면", cachedRow({ plan: "pro" })],
    ["캐시가 없으면", null],
  ])("%s 다시 생성합니다", async (_label, row) => {
    const service = writer();

    expect(await loadInsight({ supabase: reader(row), service, userId: "사용자", plan: "free", input })).toEqual(payload);
    expect(generateInsights).toHaveBeenCalledExactlyOnceWith(input, "free");
    expect(service.upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "사용자", accounting_month: "2026-04-01", payload,
      txn_fingerprint: insightFingerprint(summary), plan: "free", model: "claude-sonnet-5",
    }), { onConflict: "user_id,accounting_month" });
  });

  it("Pro 캐시는 Opus 모델 이름과 함께 기록합니다", async () => {
    const service = writer();
    await loadInsight({ supabase: reader(null), service, userId: "사용자", plan: "pro", input });

    expect(service.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "pro", model: "claude-opus-5" }), { onConflict: "user_id,accounting_month" });
  });

  it("모델 호출이 실패하면 실패를 캐싱하지 않고 그대로 알립니다", async () => {
    vi.mocked(generateInsights).mockRejectedValue(new Error("분석 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    const service = writer();

    await expect(loadInsight({ supabase: reader(null), service, userId: "사용자", plan: "free", input }))
      .rejects.toThrow("분석 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    expect(service.upsert).not.toHaveBeenCalled();
  });

  it("캐시를 기록할 수 없어도 요약은 보여 주되 흔적을 남깁니다", async () => {
    // service role 키가 없는 환경(로컬·프리뷰)에서도 대시보드가 막히지 않아야 합니다.
    // 다만 프로덕션에서 키가 빠지면 페이지를 열 때마다 모델이 돌므로 로그로 드러나야 합니다.
    expect(await loadInsight({ supabase: reader(null), service: null, userId: "사용자", plan: "free", input }))
      .toEqual(payload);
    expect(logEvent).toHaveBeenCalledExactlyOnceWith("insight_cache_unavailable");
  });

  it("캐시 기록이 오류를 돌려주면 요약은 보여 주되 흔적을 남깁니다", async () => {
    // supabase-js는 오류를 throw하지 않고 { error }로 돌려줍니다. catch만으로는 못 잡습니다.
    const service = writer();
    service.upsert.mockResolvedValue({ error: { message: "permission denied" } });

    expect(await loadInsight({ supabase: reader(null), service, userId: "사용자", plan: "free", input })).toEqual(payload);
    expect(logEvent).toHaveBeenCalledExactlyOnceWith("insight_cache_write_failed");
  });

  it("캐시 기록이 성공하면 아무것도 남기지 않습니다", async () => {
    await loadInsight({ supabase: reader(null), service: writer(), userId: "사용자", plan: "free", input });
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("캐시 조회가 실패해도 생성으로 이어갑니다", async () => {
    const supabase = reader(null);
    supabase.filter.maybeSingle.mockRejectedValue(new Error("DB 내부 오류"));

    expect(await loadInsight({ supabase, service: null, userId: "사용자", plan: "free", input })).toEqual(payload);
  });
});
