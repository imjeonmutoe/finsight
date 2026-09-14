// @vitest-environment node

import { expect, it } from "vitest";

function add(left: number, right: number): number {
  return left + right;
}

it("순수 함수 테스트는 브라우저 전역 없이 Node 환경에서 실행됩니다", () => {
  expect(typeof window).toBe("undefined");
  expect(typeof document).toBe("undefined");
  expect(add(2, 3)).toBe(5);
});
