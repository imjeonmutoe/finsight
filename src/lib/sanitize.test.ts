// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildSanitizedMappingInput, sanitizeMerchantForLlm } from "./sanitize";

describe("매핑 입력 정제", () => {
  it("원본 헤더·셀·합성 개인정보 대신 인덱스·허용 의미·형식만 반환합니다", () => {
    const headers = ["거래일자", "가맹점명", "이용금액", "계좌번호", "카드번호", "홍길동 test@example.com 123-456-789012"];
    const result = buildSanitizedMappingInput(headers, [["2026-01-02", "홍길동", "1,234원", "123-456-789012", "4111-1111-1111-1111", "test@example.com"]], 3);
    expect(result).toEqual({
      headerRowIndex: 3,
      columns: [
        { index: 0, label: "date", valueTypes: ["date"] },
        { index: 1, label: "merchant", valueTypes: ["text"] },
        { index: 2, label: "amount", valueTypes: ["number"] },
        { index: 3, label: "unknown", valueTypes: ["text"] },
        { index: 4, label: "unknown", valueTypes: ["text"] },
        { index: 5, label: "unknown", valueTypes: ["text"] },
      ],
    });
    const serialized = JSON.stringify(result);
    for (const value of [...headers, "홍길동", "1,234원", "123-456-789012", "4111-1111-1111-1111", "test@example.com"]) {
      expect(serialized).not.toContain(value);
    }
  });

  it("은행별 파서 없이 공통 의미만 정확히 인식합니다", () => {
    const result = buildSanitizedMappingInput(
      ["입금액", "출금액", "원화환산금액", "거래구분", "승인번호", "청구월", "계좌거래번호", "카드승인번호", "미지의금액컬럼", " AMOUNT "], [], 0,
    );
    expect(result.columns.map((column) => column.label)).toEqual([
      "deposit", "withdrawal", "krwEquivalent", "transactionKind", "transactionId", "billingMonth", "unknown", "unknown", "unknown", "amount",
    ]);
  });

  it("최대 20행만 살피고 누락 셀을 빈 값으로 처리하며 형식은 중복하지 않습니다", () => {
    const result = buildSanitizedMappingInput(["금액", "메모"], [...Array.from({ length: 20 }, () => ["123"]), ["비밀 이름", "원본"]], 0);
    expect(result.columns.map((column) => column.valueTypes)).toEqual([["number"], ["empty"]]);
    expect(buildSanitizedMappingInput([], [], 0)).toEqual({ columns: [], headerRowIndex: 0 });
    expect(buildSanitizedMappingInput(["금액"], [["123"], [""], ["메모"], ["123"]], 0).columns[0]?.valueTypes)
      .toEqual(["number", "empty", "text"]);
  });
});

describe("분류·인사이트용 가맹점 정제", () => {
  it.each([
    "카페 123-456-789012", "카페 4111 1111 1111 1111", "카페 4111111111111111",
    "카페 010-1234-5678", "카페 +82 (10) 1234-5678", "카페 02-123-4567",
    "카페 test.person+tag@example.com", "카페 ４１１１－１１１１－１１１１－１１１１",
    "카페 4111-****-****-1111",
  ])("합성 식별자를 마스킹합니다: %s", (raw) => {
    const result = sanitizeMerchantForLlm(raw);
    expect(result).toBe("카페 [가림]");
  });

  it("식별자를 마스킹한 다음 200자로 제한하고 일반 지점명은 보존합니다", () => {
    expect(sanitizeMerchantForLlm("가".repeat(190) + " test@example.com")).toBe("가".repeat(190) + " [가림]");
    expect(Array.from(sanitizeMerchantForLlm("가😀".repeat(150)))).toHaveLength(200);
    expect(sanitizeMerchantForLlm("스타벅스 강남2호점")).toBe("스타벅스 강남2호점");
    expect(sanitizeMerchantForLlm("")).toBe("");
  });
});
