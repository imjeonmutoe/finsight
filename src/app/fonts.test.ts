import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const APP = join(process.cwd(), "src/app");
const css = readFileSync(join(APP, "fonts/pretendard.css"), "utf-8");

const WEIGHTS: Record<string, number> = {
  thin: 100, extralight: 200, light: 300, normal: 400, medium: 500,
  semibold: 600, bold: 700, extrabold: 800, black: 900,
};

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

it("본문 서체 선언이 가리키는 woff2가 모두 있습니다", () => {
  const urls = [...css.matchAll(/url\(\.\/([^)]+)\)/g)].map((match) => match[1] ?? "");

  expect(urls).toHaveLength(93);
  for (const url of urls) expect(existsSync(join(APP, "fonts", url))).toBe(true);
});

// 겹치는 unicode-range는 나중에 선언한 face가 먼저 쓰인다. 화면 문구 서체가 마지막이어야
// 화면이 92개 청크 대신 이 파일 하나를 받는다(scripts/gen_pretendard.py).
it("화면 문구 서체가 마지막에 선언되어 화면 글자를 먼저 맡습니다", () => {
  const urls = [...css.matchAll(/url\(\.\/([^)]+)\)/g)].map((match) => match[1] ?? "");
  expect(urls.at(-1)).toBe("pretendard/FinSightSans.ui.woff2");
  expect(css.slice(css.lastIndexOf("@font-face"))).toMatch(/unicode-range: U\+20-7e, .*U\+ac00/);
});

// 굵기 축을 400~700으로 잘랐다(scripts/gen_pretendard.py). 그 밖의 굵기는 끝값으로 눌려 그려진다.
it("화면에 쓰는 굵기가 본문 서체의 굵기 범위 안에 있습니다", () => {
  const declared = [...css.matchAll(/font-weight: (\d+) (\d+);/g)].map((m) => [Number(m[1]), Number(m[2])]);
  expect(new Set(declared.map((range) => range.join(" ")))).toEqual(new Set(["400 700"]));

  const used = sources(join(process.cwd(), "src")).flatMap((file) =>
    [...readFileSync(file, "utf-8").matchAll(/\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g)]
      .map((m) => WEIGHTS[m[1] ?? ""] ?? 0),
  );
  expect(used.length).toBeGreaterThan(0);
  for (const weight of used) {
    expect(weight).toBeGreaterThanOrEqual(400);
    expect(weight).toBeLessThanOrEqual(700);
  }
});
