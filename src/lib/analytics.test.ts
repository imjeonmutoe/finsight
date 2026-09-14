// @vitest-environment node

import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@/types/category";
import type { Category } from "@/types/category";
import type { Transaction } from "@/types/transaction";
import { detectOutliers, detectSubscriptions } from "./analytics";

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "거래-1", userId: "사용자", sourceId: "카드", uploadId: "업로드",
    occurredOn: "2026-01-15", accountingMonth: "2026-01",
    merchantRaw: "정기 서비스", merchantNorm: "정기서비스", amountKrw: 10_000,
    kind: "expense", category: "구독/멤버십", categorySource: "rule",
    sourceTransactionKey: null, dataRowIndex: 0, dedupeHash: "해시", candidateHash: "후보",
    ...overrides,
  };
}

function payments(amounts = [10_000, 10_000, 10_000], dates = ["2026-01-15", "2026-02-15", "2026-03-15"]): Transaction[] {
  return amounts.map((amountKrw, index) => {
    const occurredOn = dates[index];
    if (!occurredOn) throw new Error("테스트 결제일이 필요합니다.");
    return transaction({ id: `거래-${index}`, amountKrw, occurredOn });
  });
}

function medians(amount: number): Record<Category, number> {
  return Object.fromEntries(CATEGORIES.map((category) => [category, amount])) as Record<Category, number>;
}

describe("구독 탐지", () => {
  it("매월 같은 날 같은 금액의 3회 결제를 탐지하고 최신 결제액을 반환합니다", () => {
    expect(detectSubscriptions(payments())).toEqual([{
      merchantNorm: "정기서비스", displayName: "정기 서비스", monthlyKrw: 10_000,
      occurrences: 3, lastChargedOn: "2026-03-15", amountIncreased: false,
    }]);
  });

  it("빈 입력과 2회 결제는 탐지하지 않습니다", () => {
    expect(detectSubscriptions([])).toEqual([]);
    expect(detectSubscriptions(payments().slice(0, 2))).toEqual([]);
  });

  it.each([25, 36, 45])("%i일 간격은 제외합니다", (days) => {
    const dates = [0, 1, 2].map((index) => new Date(Date.UTC(2026, 0, 1 + days * index)).toISOString().slice(0, 10));
    expect(detectSubscriptions(payments(undefined, dates))).toEqual([]);
  });

  it.each([26, 35])("경계인 %i일 간격은 포함합니다", (days) => {
    const dates = [0, 1, 2].map((index) => new Date(Date.UTC(2026, 0, 1 + days * index)).toISOString().slice(0, 10));
    expect(detectSubscriptions(payments(undefined, dates))).toHaveLength(1);
  });

  it("월말 결제의 28~31일 간격을 허용합니다", () => {
    expect(detectSubscriptions(payments(undefined, ["2026-01-31", "2026-02-28", "2026-03-31"]))).toHaveLength(1);
  });

  it("30% 금액 편차는 제외합니다", () => {
    expect(detectSubscriptions(payments([10_000, 10_000, 13_000]))).toEqual([]);
  });

  it("3회차 15% 인상은 평균 대비 ±10% 이내이므로 탐지하고 인상을 표시합니다", () => {
    expect(detectSubscriptions(payments([10_000, 10_000, 11_500]))).toMatchObject([
      { monthlyKrw: 11_500, amountIncreased: true },
    ]);
  });

  it("정확히 평균 대비 ±10%인 금액도 포함합니다", () => {
    expect(detectSubscriptions(payments([9_000, 10_000, 11_000]))).toMatchObject([{ amountIncreased: false }]);
    expect(detectSubscriptions(payments([8_999, 10_000, 11_001]))).toEqual([]);
  });

  it("순서와 가맹점이 섞여도 원본을 바꾸지 않고 가맹점별로 탐지합니다", () => {
    const input = [...payments(), ...payments().map((item) => ({ ...item, merchantNorm: "다른가맹점" }))].reverse();
    const before = structuredClone(input);
    expect(detectSubscriptions(input)).toHaveLength(2);
    expect(input).toEqual(before);
  });

  it("수입·이체·환불은 결제 횟수와 간격·금액 판정에서 제외합니다", () => {
    for (const kind of ["income", "transfer", "refund"] as const) {
      expect(detectSubscriptions(payments().map((item) => ({ ...item, kind })))).toEqual([]);
      expect(detectSubscriptions([...payments().slice(0, 2), transaction({ kind })])).toEqual([]);
      expect(detectSubscriptions([...payments(), transaction({ kind, amountKrw: 999_999 })])).toHaveLength(1);
    }
  });

  it("카테고리명이 금융/이체여도 실제 지출이면 탐지합니다", () => {
    expect(detectSubscriptions(payments().map((item) => ({ ...item, category: "금융/이체" }))))
      .toHaveLength(1);
  });

  it("평균 합계가 안전한 정수 범위를 넘어도 편차 판정은 정확합니다", () => {
    expect(detectSubscriptions(payments(Array(3).fill(Number.MAX_SAFE_INTEGER)))).toHaveLength(1);
  });
});

describe("이상치 탐지", () => {
  it("중앙값의 3배를 넘더라도 30,000원 미만이면 제외합니다", () => {
    expect(detectOutliers(payments([5_000, 5_000, 20_000]), medians(5_000))).toEqual([]);
  });

  it("중앙값 20,000원에 100,000원인 거래와 근거 중앙값을 반환합니다", () => {
    expect(detectOutliers(payments([20_000, 20_000, 100_000]), medians(20_000))).toEqual([{
      transactionId: "거래-2", merchantRaw: "정기 서비스", amountKrw: 100_000,
      category: "구독/멤버십", medianKrw: 20_000,
    }]);
  });

  it("정확히 3배는 제외하고 정확히 30,000원은 포함합니다", () => {
    const input = payments([5_000, 5_000, 30_000]);
    expect(detectOutliers(input, medians(10_000))).toEqual([]);
    expect(detectOutliers(input, medians(5_000))).toHaveLength(1);
  });

  it.each([1, 2])("카테고리 지출이 %i건뿐이면 탐지하지 않습니다", (count) => {
    expect(detectOutliers(payments().slice(0, count).map((item) => ({ ...item, amountKrw: 100_000 })), medians(5_000)))
      .toEqual([]);
  });

  it("카테고리별로 지출 표본 수를 따로 세며 미분류와 다른 유형은 제외합니다", () => {
    const input = [
      transaction({ id: "작은지출", amountKrw: 5_000 }), transaction({ id: "큰지출", amountKrw: 100_000 }),
      transaction({ category: "쇼핑" }), transaction({ category: null }),
      ...(["income", "transfer", "refund"] as const).map((kind) => transaction({ kind, amountKrw: 100_000 })),
    ];
    expect(detectOutliers(input, medians(5_000))).toEqual([]);
    expect(detectOutliers([...input, transaction({ id: "세번째", amountKrw: 5_000 })], medians(5_000)))
      .toMatchObject([{ transactionId: "큰지출" }]);
  });

  it("금융/이체 카테고리의 지출은 분석하고 입력은 변경하지 않습니다", () => {
    const input = payments([20_000, 20_000, 100_000]).map((item) => ({ ...item, category: "금융/이체" as const }));
    const before = structuredClone(input);
    expect(detectOutliers(input, medians(20_000))).toHaveLength(1);
    expect(input).toEqual(before);
  });

  it("빈 목록과 중앙값이 0인 충분한 표본도 처리합니다", () => {
    expect(detectOutliers([], medians(0))).toEqual([]);
    expect(detectOutliers(payments([0, 0, 30_000]), medians(0))).toHaveLength(1);
  });
});
