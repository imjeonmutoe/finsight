// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@/types/category";
import { CATEGORY_COLOR_TOKENS, UNCLASSIFIED_COLOR_TOKEN, categoryColor } from "./palette";

function globals(): string {
  return readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
}

describe("카테고리 색 팔레트", () => {
  it("고정 12개 카테고리에 서로 다른 색 토큰을 하나씩 둡니다", () => {
    expect(Object.keys(CATEGORY_COLOR_TOKENS)).toEqual([...CATEGORIES]);
    expect(new Set(Object.values(CATEGORY_COLOR_TOKENS)).size).toBe(CATEGORIES.length);
  });

  it("색을 hex가 아니라 토큰 참조로만 내보냅니다", () => {
    for (const category of CATEGORIES) {
      expect(categoryColor(category)).toBe(`var(${CATEGORY_COLOR_TOKENS[category]})`);
      expect(categoryColor(category)).not.toContain("#");
    }
  });

  it("미분류는 카테고리 색을 쓰지 않고 중립 토큰을 씁니다", () => {
    expect(categoryColor(null)).toBe(`var(${UNCLASSIFIED_COLOR_TOKEN})`);
    expect(Object.values(CATEGORY_COLOR_TOKENS)).not.toContain(UNCLASSIFIED_COLOR_TOKEN);
  });

  it("모든 토큰이 globals.css의 라이트·다크 세 블록에 모두 선언돼 있습니다", () => {
    // 한 블록만 빠뜨리면 그 테마에서 막대가 색 없이 렌더되고, 빌드는 통과한다.
    // (Tailwind v4는 없는 변수를 에러 없이 무시한다)
    const css = globals();
    for (const token of [...Object.values(CATEGORY_COLOR_TOKENS), UNCLASSIFIED_COLOR_TOKEN]) {
      expect(css.match(new RegExp(`${token}:`, "g")) ?? []).toHaveLength(4);
    }
  });
});
