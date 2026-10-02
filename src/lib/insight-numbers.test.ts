import { describe, expect, it } from "vitest";
import { groundedNumbers, knownNumbers } from "./insight-numbers";

const input = {
  summary: {
    month: "2026-04",
    totalKrw: 415_900,
    byCategory: [
      { category: "쇼핑", amountKrw: 400_000, count: 2 },
      { category: "카페", amountKrw: 45_000, count: 9 },
      { category: "교통", amountKrw: 9_000, count: 3 },
      { category: "편의점", amountKrw: 1_100, count: 1 },
    ],
  },
  outliers: [{ transactionId: "id", merchantRaw: "가맹점 99,999원", amountKrw: 120_000, medianKrw: 30_000 }],
};

describe("knownNumbers", () => {
  it("입력의 숫자 필드만 모으고 문자열 속 숫자는 모으지 않습니다", () => {
    // 가맹점명은 CSV에서 온 문자열입니다. 거기 적힌 금액을 '계산값'으로 인정하면 주입이 통과합니다.
    const known = knownNumbers(input);
    expect(known.has(415_900)).toBe(true);
    expect(known.has(400_000)).toBe(true);
    expect(known.has(120_000)).toBe(true);
    expect(known.has(99_999)).toBe(false);
  });
});

describe("groundedNumbers", () => {
  const known = knownNumbers(input);

  it.each([
    "4월 지출은 ₩415,900입니다.",
    "쇼핑에 400,000원을 썼습니다.",
    "쇼핑에 40만 원을 썼습니다.",
    "중앙값 30,000원보다 큰 120,000 원 결제가 있었습니다.",
    "쇼핑 2건이 대부분이었습니다.",
    "카페에 4.5만 원을 썼습니다.",
    "교통에 9천 원을 썼습니다.",
    "편의점에서 1.1천 원이 나갔습니다.",
  ])("계산값과 맞는 금액은 통과합니다: %s", (text) => {
    expect(groundedNumbers(text, known)).toBe(true);
  });

  it.each([
    ["입력에 없는 금액", "4월 지출은 ₩500,000입니다."],
    ["원 단위로 적은 없는 금액", "쇼핑에 123,456원을 썼습니다."],
    ["만 단위로 적은 없는 금액", "쇼핑에 45만 원을 썼습니다."],
    ["가맹점명에서 온 금액", "가맹점에서 99,999원이 나갔습니다."],
    ["모델이 계산한 비율", "쇼핑이 지출의 96%를 차지했습니다."],
    // 소수점 뒤만 읽으면 '5만 원'이 되어 다른 계산값과 우연히 맞을 수 있습니다.
    ["소수 만 단위로 적은 없는 금액", "카페에 4.2만 원을 썼습니다."],
    ["천 단위로 적은 없는 금액", "교통에 8천 원을 썼습니다."],
    ["원 아래로 떨어지는 금액", "카페에 4.50001만 원을 썼습니다."],
  ])("%s는 거절합니다", (_label, text) => {
    // 안내문은 '숫자는 모두 코드로 계산한 값'이라고 말합니다. 틀린 숫자를 그 안내와 함께 내보내지 않습니다.
    expect(groundedNumbers(text, known)).toBe(false);
  });
});
