// @vitest-environment node

import { describe, expect, it } from "vitest";
import { normalizeMerchant } from "./merchant";

describe("가맹점 정규화", () => {
  it.each(["(주)스타벅스코리아", "㈜스타벅스코리아", "주식회사 스타벅스코리아"])(
    "%s의 법인격 표기를 제거합니다", (raw) => {
      expect(normalizeMerchant(raw)).toBe("스타벅스코리아");
    },
  );

  it("지점명·지역명·리저브를 보존합니다", () => {
    expect(normalizeMerchant("스타벅스 강남점")).toBe("스타벅스강남점");
    expect(normalizeMerchant("스타벅스 강남점")).not.toBe(normalizeMerchant("스타벅스"));
    expect(normalizeMerchant("스타벅스 리저브")).not.toBe(normalizeMerchant("스타벅스"));
  });

  it("전각·반각을 통일하고 소문자화한 뒤 공백·특수문자를 제거합니다", () => {
    expect(normalizeMerchant("ＮＥＴＦＬＩＸ　ＫＯＲＥＡ")).toBe(normalizeMerchant("Netflix Korea"));
    expect(normalizeMerchant("(주) C U * 강남+2호점!")).toBe("cu강남2호점");
    expect(normalizeMerchant("")).toBe("");
  });
});
