// @vitest-environment node

import { SeverityNumber } from "@opentelemetry/api-logs";
import { afterEach, describe, expect, it, vi } from "vitest";

const { emit, forceFlush, after, getPostHogLogProvider } = vi.hoisted(() => {
  const emit = vi.fn();
  const forceFlush = vi.fn();
  return {
    emit, forceFlush, after: vi.fn(),
    getPostHogLogProvider: vi.fn(() => ({ getLogger: () => ({ emit }), forceFlush })),
  };
});
vi.mock("../../instrumentation", () => ({ getPostHogLogProvider }));
vi.mock("next/server", () => ({ after }));

const { logPostHogOpsEvent } = await import("./posthog-log");

afterEach(() => {
  vi.clearAllMocks();
});

describe("운영 이벤트 로그", () => {
  it("이벤트 코드만 경고 로그로 남기고 응답 뒤에 전송합니다", () => {
    logPostHogOpsEvent("insight_cache_read_failed");

    expect(emit).toHaveBeenCalledWith({
      body: "운영 이벤트",
      severityNumber: SeverityNumber.WARN,
      severityText: "WARN",
      attributes: { event_code: "insight_cache_read_failed" },
    });
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("설정이 없거나 요청 밖이어도 던지지 않습니다", () => {
    getPostHogLogProvider.mockImplementationOnce(() => { throw new Error("missing env"); });
    expect(() => logPostHogOpsEvent("webhook_signature_invalid")).not.toThrow();

    after.mockImplementationOnce(() => { throw new Error("outside request scope"); });
    expect(() => logPostHogOpsEvent("webhook_signature_invalid")).not.toThrow();
  });
});
