// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MonthlySummary } from "@/types/analytics";
import type { Transaction } from "@/types/transaction";

vi.mock("server-only", () => ({}));
vi.mock("./queries", () => ({
  getMonthlyTrend: vi.fn(),
  getTransactionsForMonth: vi.fn(),
  getTransactionsForMerchants: vi.fn(),
  getCategoryMedians: vi.fn(),
}));

const { getCategoryMedians, getMonthlyTrend, getTransactionsForMerchants, getTransactionsForMonth } =
  await import("./queries");
const { loadDashboard } = await import("./dashboard");

const supabase = {} as Parameters<typeof loadDashboard>[0];

function summary(month: string, totalKrw: number, byCategory: MonthlySummary["byCategory"] = []): MonthlySummary {
  return { month, totalKrw, byCategory };
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "00000000-0000-4000-8000-000000000001", userId: "사용자", sourceId: "카드", uploadId: "업로드",
    occurredOn: "2026-04-15", accountingMonth: "2026-04", merchantRaw: "정기 서비스",
    merchantNorm: "정기서비스", amountKrw: 15_900, kind: "expense", category: "구독/멤버십",
    categorySource: "rule", sourceTransactionKey: null, dataRowIndex: 0,
    dedupeHash: "해시", candidateHash: "후보", ...overrides,
  };
}

// 3개월 연속 같은 금액 → detectSubscriptions가 정기결제로 판정합니다.
const monthly = [0, 1, 2].map((index) => transaction({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`,
  occurredOn: `2026-0${index + 2}-15`, accountingMonth: `2026-0${index + 2}`,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMonthlyTrend).mockResolvedValue([
    summary("2026-03", 300_000, [{ category: "식비", amountKrw: 300_000, count: 3 }]),
    summary("2026-04", 415_900, [
      { category: "구독/멤버십", amountKrw: 15_900, count: 1 },
      { category: null, amountKrw: 400_000, count: 2 },
    ]),
    summary("2026-05", 0),
  ]);
  vi.mocked(getTransactionsForMonth).mockResolvedValue([transaction()]);
  vi.mocked(getTransactionsForMerchants).mockResolvedValue(monthly);
  vi.mocked(getCategoryMedians).mockResolvedValue({
    "식비": 0, "카페/간식": 0, "배달": 0, "교통": 0, "주거/통신": 0, "구독/멤버십": 5_000,
    "쇼핑": 30_000, "의료/건강": 0, "문화/여가": 0, "교육": 0, "금융/이체": 0, "기타": 0,
  });
});

describe("대시보드 데이터", () => {
  it("거래가 있는 가장 최근 달과 전월 총지출을 함께 돌려줍니다", async () => {
    const data = await loadDashboard(supabase, "사용자", "free");

    expect(data.month).toBe("2026-04");
    expect(data.summary.totalKrw).toBe(415_900);
    expect(data.previousTotalKrw).toBe(300_000);
    expect(data.monthsHeld).toBe(2);
    expect(getTransactionsForMonth).toHaveBeenCalledWith(supabase, "사용자", "2026-04");
  });

  it("총지출을 여기서 다시 더하지 않고 SQL 요약값을 그대로 씁니다", async () => {
    // 급여·이체가 섞인 목록이 와도 KPI는 SQL의 지출-환불 합계여야 합니다.
    vi.mocked(getTransactionsForMonth).mockResolvedValue([
      transaction(),
      transaction({ id: "00000000-0000-4000-8000-000000000009", kind: "income", amountKrw: 3_000_000, category: null }),
      transaction({ id: "00000000-0000-4000-8000-00000000000a", kind: "transfer", amountKrw: 1_800_000, category: null }),
    ]);

    const data = await loadDashboard(supabase, "사용자", "free");

    expect(data.summary.totalKrw).toBe(415_900);
    expect(data.transactions).toHaveLength(3);
  });

  it("미분류 건수는 SQL 요약의 미분류 묶음에서 읽습니다", async () => {
    expect((await loadDashboard(supabase, "사용자", "free")).unclassifiedCount).toBe(2);
  });

  it("거래가 하나도 없으면 빈 상태를 알리고 더 조회하지 않습니다", async () => {
    vi.mocked(getMonthlyTrend).mockResolvedValue([summary("2026-04", 0), summary("2026-05", 0)]);

    const data = await loadDashboard(supabase, "사용자", "pro");

    expect(data.month).toBeNull();
    expect(data.transactions).toEqual([]);
    expect(data.monthsHeld).toBe(0);
    expect(getTransactionsForMonth).not.toHaveBeenCalled();
    expect(getTransactionsForMerchants).not.toHaveBeenCalled();
    expect(getCategoryMedians).not.toHaveBeenCalled();
  });
});

describe("Pro 게이팅", () => {
  it("Free에게는 추이·구독·이상거래 상세 배열을 만들어 주지 않습니다", async () => {
    const data = await loadDashboard(supabase, "사용자", "free");

    expect(data.trends).toBeNull();
    expect(data.subscriptions).toBeNull();
    expect(data.outliers).toBeNull();
    // 이상치 판정에 필요한 중앙값도 조회하지 않습니다 — Free 화면에 쓸 곳이 없습니다.
    expect(getCategoryMedians).not.toHaveBeenCalled();
    // 탐지 결과에만 있는 필드가 응답 본문 어디에도 실리지 않아야 합니다.
    for (const field of ["lastChargedOn", "amountIncreased", "medianKrw", "occurrences"]) {
      expect(JSON.stringify(data)).not.toContain(field);
    }
  });

  it("Free에도 코드로 계산한 정기결제 요약 수치는 전달합니다", async () => {
    const data = await loadDashboard(supabase, "사용자", "free");

    expect(data.subscriptionCount).toBe(1);
    expect(data.subscriptionMonthlyKrw).toBe(15_900);
  });

  it("Pro에게만 상세 목록을 채웁니다", async () => {
    // 쇼핑 중앙값 30,000원의 3배를 넘는 거래 하나가 이상거래로 잡힙니다.
    vi.mocked(getTransactionsForMonth).mockResolvedValue([
      transaction(),
      transaction({
        id: "00000000-0000-4000-8000-00000000000d", merchantRaw: "동네 상점", merchantNorm: "동네상점",
        amountKrw: 200_000, category: "쇼핑",
      }),
    ]);

    const data = await loadDashboard(supabase, "사용자", "pro");

    expect(data.trends).toHaveLength(3);
    expect(data.subscriptions).toEqual([expect.objectContaining({ merchantNorm: "정기서비스", occurrences: 3 })]);
    expect(data.outliers).toEqual([expect.objectContaining({ merchantRaw: "동네 상점", medianKrw: 30_000 })]);
  });

  it("구독 후보는 이번 달 지출 가맹점으로만 좁혀 조회합니다", async () => {
    vi.mocked(getTransactionsForMonth).mockResolvedValue([
      transaction(),
      transaction({ id: "00000000-0000-4000-8000-00000000000b", kind: "income", merchantNorm: "급여" }),
      transaction({ id: "00000000-0000-4000-8000-00000000000c", merchantNorm: "정기서비스" }),
    ]);

    await loadDashboard(supabase, "사용자", "pro");

    expect(getTransactionsForMerchants).toHaveBeenCalledWith(supabase, "사용자", ["정기서비스"]);
  });
});
