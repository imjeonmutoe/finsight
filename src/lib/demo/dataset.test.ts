// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { CATEGORIES } from "@/types/category";
import { computeCandidateHash, computeDedupeHash, computeFileHash } from "../dedupe";
import { classifyByRule } from "../merchant-rules";
import { buildDemoDataset } from "./dataset";
import { SAMPLE_CONTEXT, SAMPLE_CSV, SAMPLE_MAPPING } from "./sample-csv";

afterEach(() => {
  vi.doUnmock("./sample-csv");
  vi.resetModules();
});

// 입력 CSV만 교체합니다. 인코딩·파싱·분류·탐지는 실제 제품 함수를 사용합니다.
async function buildFromRows(rows: string[]) {
  vi.resetModules();
  vi.doMock("./sample-csv", () => ({
    SAMPLE_CSV: ["승인일자,가맹점명,승인금액,원화환산금액,할부개월,승인번호,이용구분,청구월", ...rows].join("\n"),
    SAMPLE_MAPPING: { ...SAMPLE_MAPPING, skipRows: 0, transactionKind: 6 },
    SAMPLE_CONTEXT,
  }));
  const { buildDemoDataset: buildFromFixture } = await import("./dataset");
  return buildFromFixture();
}

describe("데모 데이터셋", () => {
  it("서로 다른 4개월을 오래된 순서로 반환하고 마지막 달을 현재 월로 사용합니다", () => {
    const dataset = buildDemoDataset();
    expect(dataset.months.map((month) => month.month)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(dataset.currentMonth).toEqual(dataset.months.at(-1));
  });

  it("실제 탐지 조건을 만족하는 구독 3~4건과 마지막 달 인상을 찾습니다", () => {
    const { subscriptions } = buildDemoDataset();
    expect(subscriptions.length).toBeGreaterThanOrEqual(3);
    expect(subscriptions.length).toBeLessThanOrEqual(4);
    expect(subscriptions.some((item) => item.amountIncreased)).toBe(true);
    for (const subscription of subscriptions) {
      expect(subscription.occurrences).toBe(4);
      expect(subscription.lastChargedOn).toMatch(/^2026-04-/);
    }
  });

  it("실제 이상치 1~2건을 찾고 해당 거래의 결정론적 ID로 되짚을 수 있습니다", () => {
    const { outliers, transactions } = buildDemoDataset();
    expect(outliers.length).toBeGreaterThanOrEqual(1);
    expect(outliers.length).toBeLessThanOrEqual(2);
    for (const outlier of outliers) {
      expect(transactions.find((item) => item.id === outlier.transactionId)).toMatchObject({
        amountKrw: outlier.amountKrw, category: outlier.category, merchantRaw: outlier.merchantRaw, kind: "expense",
      });
      expect(outlier.amountKrw).toBeGreaterThan(outlier.medianKrw * 3);
      expect(outlier.amountKrw).toBeGreaterThanOrEqual(30_000);
    }
  });

  it("모든 저장 금액은 0 이상 원 단위 정수이고 해시는 실제 거래와 파일에 대응합니다", () => {
    const { transactions } = buildDemoDataset();
    const fileHash = computeFileHash(new TextEncoder().encode(SAMPLE_CSV));
    expect(transactions.length).toBeGreaterThan(0);
    expect(new Set(transactions.map((item) => item.id)).size).toBe(transactions.length);
    expect(new Set(transactions.map((item) => item.dedupeHash)).size).toBe(transactions.length);
    for (const transaction of transactions) {
      expect(Number.isSafeInteger(transaction.amountKrw)).toBe(true);
      expect(transaction.amountKrw).toBeGreaterThanOrEqual(0);
      expect(transaction.userId).not.toBe("");
      expect(transaction.uploadId).not.toBe("");
      expect(transaction.sourceId).toBe(SAMPLE_CONTEXT.sourceId);
      expect(transaction.dedupeHash).toBe(computeDedupeHash(transaction, fileHash));
      expect(transaction.candidateHash).toBe(computeCandidateHash(transaction));
    }
  });

  it("내장 사전의 분류만 사용하며 미분류 개수와 카테고리 집계를 보존합니다", () => {
    const { transactions, unclassifiedCount, months } = buildDemoDataset();
    const unclassified = transactions.filter((item) => item.category === null);
    expect(unclassified.length).toBeGreaterThan(0);
    expect(unclassifiedCount).toBe(unclassified.length);
    for (const transaction of transactions) {
      expect(transaction.category).toBe(classifyByRule(transaction.merchantNorm));
      expect(transaction.categorySource).toBe(transaction.category === null ? null : "rule");
      if (transaction.category !== null) expect(CATEGORIES).toContain(transaction.category);
    }
    expect(months.flatMap((month) => month.byCategory).filter((item) => item.category === null)
      .reduce((count, item) => count + item.count, 0)).toBe(unclassifiedCount);
  });

  it("샘플의 월별 순지출과 카테고리 합계는 지출에서 환불을 차감한 금액입니다", () => {
    const { transactions, months } = buildDemoDataset();
    expect(transactions.some((item) => item.kind === "refund")).toBe(true);
    for (const month of months) {
      const rows = transactions.filter((item) => item.accountingMonth === month.month);
      const expenses = rows.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amountKrw, 0);
      const refunds = rows.filter((item) => item.kind === "refund").reduce((sum, item) => sum + item.amountKrw, 0);
      expect(month.totalKrw).toBe(expenses - refunds);
      expect(month.byCategory.reduce((sum, item) => sum + item.amountKrw, 0)).toBe(month.totalKrw);
    }
  });

  it("두 번 호출해도 거래 ID와 집계·탐지 결과가 같습니다", () => {
    const first = buildDemoDataset();
    const second = buildDemoDataset();
    expect(second.transactions.map((item) => item.id)).toEqual(first.transactions.map((item) => item.id));
    expect(second).toEqual(first);
  });

  it("급여·이체를 합계와 건수에서 제외하고 미분류 환불 및 음수 순지출을 보존합니다", async () => {
    const dataset = await buildFromRows([
      "2026.01.01,쿠팡,10000,,0,1,승인,2026-01",
      "2026.01.02,쿠팡,-30000,,0,2,취소,2026-01",
      "2026.01.03,동네가게,7000,,0,3,승인,2026-01",
      "2026.01.04,동네가게,-2000,,0,4,취소,2026-01",
      "2026.01.05,쿠팡급여,3000000,,0,5,급여,2026-01",
      "2026.01.06,쿠팡정산,2000000,,0,6,본인계좌이체,2026-01",
      "2026.02.05,데모회사,3000000,,0,7,급여,2026-02",
    ]);
    expect(dataset.transactions.map((item) => item.kind))
      .toEqual(["expense", "refund", "expense", "refund", "income", "transfer", "income"]);
    expect(dataset.months).toEqual([{
      month: "2026-01", totalKrw: -15_000,
      byCategory: [
        { category: "쇼핑", amountKrw: -20_000, count: 2 },
        { category: null, amountKrw: 5_000, count: 2 },
      ],
    }]);
    expect(dataset.unclassifiedCount).toBe(2);
    expect(dataset.subscriptions).toEqual([]);
    expect(dataset.outliers).toEqual([]);
  });

  it.each([
    { amounts: [1_000, 10_000, 40_000], median: 10_000 },
    { amounts: [1_000, 10_000, 10_001, 40_000], median: 10_001 },
  ])("지출만으로 중앙값 $median 원을 계산하고 짝수 표본은 SQL처럼 반올림합니다", async ({ amounts, median }) => {
    const dataset = await buildFromRows([
      ...amounts.map((amount, index) => `2026.01.0${index + 1},쿠팡,${amount},,0,${index + 1},승인,2026-01`),
      "2026.01.10,쿠팡,-90000,,0,10,취소,2026-01",
      "2026.01.11,쿠팡급여,3000000,,0,11,급여,2026-01",
      "2026.01.12,쿠팡정산,2000000,,0,12,이체,2026-01",
    ]);
    expect(dataset.outliers).toHaveLength(1);
    expect(dataset.outliers[0]).toMatchObject({ amountKrw: 40_000, category: "쇼핑", medianKrw: median });
  });
});
