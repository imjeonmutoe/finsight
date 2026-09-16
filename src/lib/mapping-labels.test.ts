import { describe, expect, it } from "vitest";
import type { MappingLabel } from "@/types/upload";
import { MAPPING_LABEL_TEXT, isSensitiveHeader } from "./mapping-labels";

describe("매핑 라벨 문구", () => {
  it("모든 라벨에 한국어 문구가 있고 영문을 병기하지 않습니다", () => {
    const labels: MappingLabel[] = ["date", "merchant", "amount", "deposit", "withdrawal",
      "krwEquivalent", "transactionKind", "transactionId", "billingMonth", "unknown"];

    expect(Object.keys(MAPPING_LABEL_TEXT).sort()).toEqual([...labels].sort());
    for (const label of labels) {
      expect(MAPPING_LABEL_TEXT[label]).not.toMatch(/[A-Za-z]/);
    }
    expect(MAPPING_LABEL_TEXT.unknown).toBe("(사용 안 함)");
  });
});

describe("민감 헤더 판정", () => {
  it.each([
    "카드번호", "계좌번호", "카드 번호", "결제카드번호", "card_number", "Card No", "accountNo", "IBAN",
  ])("%s는 매핑 대상에서 제외합니다", (header) => {
    expect(isSensitiveHeader(header)).toBe(true);
  });

  it.each(["거래일자", "가맹점명", "이용금액", "승인번호", "거래번호", "청구월", ""])(
    "%s는 정상 컬럼입니다", (header) => {
      expect(isSensitiveHeader(header)).toBe(false);
    },
  );
});
