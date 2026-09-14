// @vitest-environment node

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ParsedTransaction } from "@/types/transaction";
import { computeCandidateHash, computeDedupeHash, computeFileHash } from "./dedupe";

const transaction: ParsedTransaction = {
  sourceId: "card-a", occurredOn: "2026-01-02", accountingMonth: "2026-01",
  merchantRaw: "스타벅스 강남점", merchantNorm: "스타벅스강남점", amountKrw: 5000,
  kind: "expense", sourceTransactionKey: null, dataRowIndex: 0,
  dedupeHash: null, candidateHash: null,
};
const hash = (value: unknown[]) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("출처별 거래 해시", () => {
  it("원본 bytes를 SHA-256으로 해시합니다", () => {
    expect(computeFileHash(new TextEncoder().encode("abc")))
      .toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(computeFileHash(new Uint8Array()))
      .toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(computeFileHash(new Uint8Array([0xff]))).not.toBe(computeFileHash(new Uint8Array([0xfe])));
  });

  it("아키텍처의 버전 태그와 JSON 필드 순서를 그대로 사용합니다", () => {
    expect(computeDedupeHash(transaction, "file-a")).toBe(hash(["row-v1", "card-a", "file-a", 0]));
    expect(computeDedupeHash({ ...transaction, sourceTransactionKey: "key" }, "file-a"))
      .toBe(hash(["id-v1", "card-a", "key", "expense", "2026-01"]));
    expect(computeCandidateHash(transaction))
      .toBe(hash(["card-a", "2026-01-02", 5000, "스타벅스 강남점", "expense", "2026-01"]));
  });

  it("같은 파일의 동일 거래 두 행을 보존하고 재파싱은 안정적입니다", () => {
    const rows = [transaction, { ...transaction, dataRowIndex: 1 }];
    const hashes = rows.map((row) => computeDedupeHash(row, "file-a"));
    expect(new Set(hashes).size).toBe(2);
    expect(rows.map((row) => computeDedupeHash(row, "file-a"))).toEqual(hashes);
    expect(computeCandidateHash(rows[1] ?? transaction)).toBe(computeCandidateHash(transaction));
  });

  it("다른 출처의 동일 거래는 확정 해시와 후보 해시가 모두 다릅니다", () => {
    const other = { ...transaction, sourceId: "card-b" };
    expect(computeDedupeHash(other, "file-a")).not.toBe(computeDedupeHash(transaction, "file-a"));
    expect(computeCandidateHash(other)).not.toBe(computeCandidateHash(transaction));
  });

  it("번호 없는 겹치는 파일·부분 파일은 후보만 같고 자동 병합되지 않습니다", () => {
    const other = { ...transaction, dataRowIndex: 0 };
    expect(computeDedupeHash(other, "partial-file")).not.toBe(computeDedupeHash(transaction, "file-a"));
    expect(computeCandidateHash(other)).toBe(computeCandidateHash(transaction));
  });

  it("거래번호가 있으면 파일과 행 위치가 달라도 같고 유형·청구월이 다르면 다릅니다", () => {
    const identified = { ...transaction, sourceTransactionKey: "key" };
    const expected = computeDedupeHash(identified, "file-a");
    expect(computeDedupeHash({ ...identified, dataRowIndex: 7 }, "file-b")).toBe(expected);
    expect(computeDedupeHash({ ...identified, kind: "refund" }, "file-a")).not.toBe(expected);
    expect(computeDedupeHash({ ...identified, accountingMonth: "2026-02" }, "file-a")).not.toBe(expected);
    expect(computeDedupeHash({ ...identified, sourceId: "card-b" }, "file-a")).not.toBe(expected);
  });

  it("후보는 정규화 가맹점 대신 원래 가맹점명을 사용합니다", () => {
    expect(computeCandidateHash({ ...transaction, merchantRaw: "스타벅스강남점" }))
      .not.toBe(computeCandidateHash(transaction));
  });
});
