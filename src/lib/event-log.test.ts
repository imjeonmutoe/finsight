// @vitest-environment node

import { afterEach, expect, it, vi } from "vitest";
import { logEvent } from "./event-log";

afterEach(() => vi.restoreAllMocks());

it("이벤트 코드만 한 줄 JSON으로 남깁니다", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  logEvent("webhook_signature_invalid");

  expect(warn).toHaveBeenCalledExactlyOnceWith('{"event":"webhook_signature_invalid"}');
});

it("정해진 코드 밖의 문자열은 타입에서 거절합니다", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // 금융 데이터가 섞일 자리를 만들지 않는다 — 자유 문자열·추가 필드를 받지 않는다.
  // @ts-expect-error 목록에 없는 코드
  logEvent("스타벅스 4,500원");
});
