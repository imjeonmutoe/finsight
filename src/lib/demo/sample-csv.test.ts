// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildTransactions, detectHeaderRow, parseAmount, parseCsvRows } from "../csv";
import { computeFileHash } from "../dedupe";
import { decodeCsv, detectEncoding } from "../encoding";
import { classifyByRule } from "../merchant-rules";
import { SAMPLE_CONTEXT, SAMPLE_CSV, SAMPLE_MAPPING } from "./sample-csv";

function parseSample() {
  const bytes = new TextEncoder().encode(SAMPLE_CSV);
  const rows = parseCsvRows(decodeCsv(bytes, detectEncoding(bytes)));
  return { rows, transactions: buildTransactions(rows, SAMPLE_MAPPING, SAMPLE_CONTEXT) };
}

describe("평가용 카드 명세서", () => {
  it("요약 2~3행 뒤의 고정 매핑으로 4개월치 150~250건을 모두 읽습니다", () => {
    const { rows, transactions } = parseSample();
    expect(SAMPLE_MAPPING.skipRows).toBeGreaterThanOrEqual(2);
    expect(SAMPLE_MAPPING.skipRows).toBeLessThanOrEqual(3);
    expect(detectHeaderRow(rows)).toBe(SAMPLE_MAPPING.skipRows);
    expect(transactions.length).toBeGreaterThanOrEqual(150);
    expect(transactions.length).toBeLessThanOrEqual(250);
    expect(transactions).toHaveLength(rows.length - SAMPLE_MAPPING.skipRows - 1);
    expect([...new Set(transactions.map((item) => item.accountingMonth))].sort())
      .toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(rows[SAMPLE_MAPPING.skipRows]).toEqual([
      "승인일자", "가맹점명", "승인금액", "원화환산금액", "할부개월", "승인번호", "이용구분", "청구월",
    ]);
    expect(SAMPLE_CONTEXT.sourceKind).toBe("card");
    expect(SAMPLE_CONTEXT.fileHash).toBe(computeFileHash(new TextEncoder().encode(SAMPLE_CSV)));
  });

  it("음수 승인금액 1~2건을 절댓값 환불로 읽습니다", () => {
    const { rows, transactions } = parseSample();
    const refunds = transactions.filter((item) => item.kind === "refund");
    expect(refunds.length).toBeGreaterThanOrEqual(1);
    expect(refunds.length).toBeLessThanOrEqual(2);
    for (const refund of refunds) {
      const raw = rows[SAMPLE_MAPPING.skipRows + 1 + refund.dataRowIndex]?.[SAMPLE_MAPPING.amount ?? -1];
      const signedAmount = parseAmount(raw ?? "");
      expect(signedAmount).toBeLessThan(0);
      expect(refund.amountKrw).toBe(-signedAmount);
    }
  });

  it("해외결제는 원화환산 금액을 우선하고 국내결제는 승인금액으로 대체합니다", () => {
    const { rows, transactions } = parseSample();
    const dataRows = rows.slice(SAMPLE_MAPPING.skipRows + 1);
    const foreignRows = dataRows.filter((row) => row[SAMPLE_MAPPING.krwEquivalent ?? -1]?.trim());
    expect(foreignRows).toHaveLength(1);
    for (const transaction of transactions) {
      const row = dataRows[transaction.dataRowIndex];
      const converted = row?.[SAMPLE_MAPPING.krwEquivalent ?? -1]?.trim();
      const raw = converted || row?.[SAMPLE_MAPPING.amount ?? -1] || "";
      expect(transaction.amountKrw).toBe(Math.abs(parseAmount(raw)));
      if (converted) {
        expect(row?.[SAMPLE_MAPPING.amount ?? -1]).toContain("USD");
      }
    }
  });

  it("할부 청구 회차분을 승인일과 다른 청구월에 그대로 보존합니다", () => {
    const { rows, transactions } = parseSample();
    const installments = rows.slice(SAMPLE_MAPPING.skipRows + 1)
      .map((row, index) => ({ row, transaction: transactions[index] }))
      .filter(({ row }) => Number(row[4]) > 1);
    expect(installments).toHaveLength(1);
    for (const { row, transaction } of installments) {
      expect(transaction?.accountingMonth).not.toBe(transaction?.occurredOn.slice(0, 7));
      expect(transaction?.accountingMonth).toBe(row[SAMPLE_MAPPING.billingMonth ?? -1]);
      expect(transaction?.amountKrw).toBe(parseAmount(row[SAMPLE_MAPPING.amount ?? -1] ?? ""));
      expect(transaction?.kind).toBe("expense");
    }
  });

  it("접미가 붙은 가맹점은 사전으로 분류하고 미등록 가맹점 3~5개는 남깁니다", () => {
    const { transactions } = parseSample();
    const unknown = new Set(transactions.filter((item) => classifyByRule(item.merchantNorm) === null)
      .map((item) => item.merchantNorm));
    expect(unknown.size).toBeGreaterThanOrEqual(3);
    expect(unknown.size).toBeLessThanOrEqual(5);
    const branch = transactions.find((item) => item.merchantRaw === "스타벅스강남2호점");
    expect(branch).toBeDefined();
    expect(classifyByRule(branch?.merchantNorm ?? "")).toBe("카페/간식");
  });
});
