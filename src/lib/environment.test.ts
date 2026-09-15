// @vitest-environment node

import { expect, it } from "vitest";

// vitest.config.mts의 기본 환경은 jsdom이다. 순수 유틸은 파일 상단 pragma로 Node 환경을 고른다.
// 이 파일은 그 pragma가 실제로 기본값을 덮는지만 확인한다 — 제품 코드를 테스트하지 않는다.
it("pragma를 둔 파일은 브라우저 전역 없이 Node 환경에서 실행됩니다", () => {
  expect(typeof window).toBe("undefined");
  expect(typeof document).toBe("undefined");
  expect(typeof process.versions.node).toBe("string");
});
