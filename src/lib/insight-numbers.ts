/**
 * AI 인사이트 문장의 금액·비율이 코드가 계산해 넘긴 값인지 확인한다.
 * 화면은 "숫자는 모두 코드로 계산한 값"이라고 안내하므로, 모델이 지어내거나 입력의 가맹점명에
 * 섞인 지시를 따라 만든 숫자를 그 안내와 함께 내보내면 안 된다.
 *
 * 금액 표기(₩·원, 만·천을 쓴 금액은 소수·'원' 생략·이어 적기 포함)와 퍼센트만 본다.
 * 입력에는 비율이 없으므로(모델에게 계산시키지 않는다) 퍼센트는 계산값에 같은 수가 있어야만 통과한다.
 */

/** 입력의 **숫자 필드**만 모은다. 문자열(가맹점명 등)은 CSV에서 온 값이라 근거가 될 수 없다. */
export function knownNumbers(input: unknown): Set<number> {
  const out = new Set<number>();
  const walk = (value: unknown) => {
    if (typeof value === "number") out.add(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(input);
  return out;
}

const digits = (raw: string) => Number(raw.replaceAll(",", ""));

/** '4.5만'처럼 소수로 적은 단위 금액(없는 자리는 0). 원 아래로 떨어지면 계산값일 수 없으므로 NaN(어떤 값과도 안 맞음). */
const scaled = (raw: string | undefined, unit: number) => {
  if (raw === undefined) return 0;
  const v = digits(raw) * unit;
  const won = Math.round(v);
  return Math.abs(v - won) < 1e-6 ? won : NaN;
};

const N = String.raw`\d[\d,]*(?:\.\d+)?`;
/**
 * 만·천을 쓴 금액 한 덩어리. '41만 5,900원'·'41만 5천 900원'·'1천만 원'·'4.5만'('원' 생략)을
 * 하나로 읽는다. 쪼개 읽으면 끝의 '5,900원'만 대조돼 맞는 문장이 버려진다.
 * 그룹: 1 만 앞 수, 2 '천만'의 천, 3 만 뒤 천 앞 수, 4 만 없이 천 앞 수, 5 끝의 원 단위 수.
 */
const UNIT_AMOUNT = new RegExp(
  String.raw`(?:(${N})\s?(천\s?)?만(?:\s?(${N})\s?천)?|(${N})\s?천)(?:\s?(\d[\d,]*)(?=\s?원))?(?:\s?원)?`,
  "g",
);

const unitValue = (m: RegExpMatchArray) =>
  scaled(m[1], m[2] ? 10_000_000 : 10_000) + scaled(m[3], 1_000) + scaled(m[4], 1_000) + scaled(m[5], 1);

const PATTERNS: { re: RegExp; value: (m: RegExpMatchArray) => number }[] = [
  { re: /₩\s?(\d[\d,]*)/g, value: (m) => digits(m[1] ?? "") },
  { re: /(\d[\d,]*)\s?원/g, value: (m) => digits(m[1] ?? "") },
  { re: /(\d+(?:\.\d+)?)\s?%/g, value: (m) => Number(m[1]) },
];

export function groundedNumbers(text: string, known: Set<number>): boolean {
  const units = [...text.matchAll(UNIT_AMOUNT)];
  if (!units.every((m) => known.has(unitValue(m)))) return false;
  // 만·천 덩어리는 이미 대조했으니 지우고 나머지 표기를 본다. 안 지우면 '41만 5,900원'의 '5,900원'을 또 읽는다.
  const rest = text.replace(UNIT_AMOUNT, " ");
  return PATTERNS.every(({ re, value }) => [...rest.matchAll(re)].every((m) => known.has(value(m))));
}
