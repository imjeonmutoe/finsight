import { describe, expect, it } from "vitest";

import { parseAmountFloat } from "./smoke-fixture";

describe("parseAmountFloat", () => {
  it("천단위 쉼표를 제거하고 숫자로 바꿉니다", () => {
    expect(parseAmountFloat("1,234")).toBe(1234);
  });

  it("빈 문자열은 0을 돌려줍니다", () => {
    expect(parseAmountFloat("")).toBe(0);
  });
});
