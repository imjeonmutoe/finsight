/**
 * AI 인사이트 문장의 금액·비율이 코드가 계산해 넘긴 값인지 확인한다.
 * 화면은 "숫자는 모두 코드로 계산한 값"이라고 안내하므로, 모델이 지어내거나 입력의 가맹점명에
 * 섞인 지시를 따라 만든 숫자를 그 안내와 함께 내보내면 안 된다.
 *
 * 금액 표기(₩·원·만 원)와 퍼센트만 본다. 입력에는 비율이 없으므로(모델에게 계산시키지 않는다)
 * 퍼센트는 계산값에 같은 수가 있어야만 통과한다.
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

const PATTERNS: { re: RegExp; value: (m: RegExpMatchArray) => number }[] = [
  { re: /₩\s?(\d[\d,]*)/g, value: (m) => digits(m[1] ?? "") },
  { re: /(\d[\d,]*)\s?만\s?원/g, value: (m) => digits(m[1] ?? "") * 10_000 },
  { re: /(\d[\d,]*)\s?원/g, value: (m) => digits(m[1] ?? "") },
  { re: /(\d+(?:\.\d+)?)\s?%/g, value: (m) => Number(m[1]) },
];

export function groundedNumbers(text: string, known: Set<number>): boolean {
  return PATTERNS.every(({ re, value }) => [...text.matchAll(re)].every((m) => known.has(value(m))));
}
