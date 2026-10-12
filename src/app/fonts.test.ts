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

  expect(urls).toHaveLength(92);
  for (const url of urls) expect(existsSync(join(APP, "fonts", url))).toBe(true);
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
