// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { constructor, capture, captureException, flush } = vi.hoisted(() => ({
  constructor: vi.fn(), capture: vi.fn(), captureException: vi.fn(), flush: vi.fn(),
}));
vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(...args: unknown[]) { constructor(...args); }
    capture = capture;
    captureException = captureException;
    flush = flush;
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./posthog-log", () => ({ flushPostHogLogs: vi.fn(), logPostHogCapture: vi.fn() }));

const { captureServerEvent, captureServerException, getPostHogClient, trackApiFailure } = await import("./posthog-server");
const { redactExceptionEvent } = await import("@/lib/posthog-privacy");

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
  flush.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("PostHog 서버 클라이언트", () => {
  it("LLM 원문과 예외 메시지를 보내지 않도록 설정합니다", () => {
    getPostHogClient();
    expect(constructor).toHaveBeenCalledWith("phc_test", expect.objectContaining({
      privacyMode: true,
      before_send: redactExceptionEvent,
    }));
  });

  it("전송이 실패해도 요청을 실패시키지 않습니다", async () => {
    flush.mockRejectedValue(new Error("network"));
    await expect(captureServerEvent({ distinctId: "user-1", event: "checkout_started" })).resolves.toBeUndefined();
    expect(capture).toHaveBeenCalledTimes(1);
  });
});

describe("실패·예외 추적", () => {
  it("API 실패는 라우트·상태·코드만 담아 한 이벤트로 보냅니다", async () => {
    await trackApiFailure("user-1", "uploads", 403, "UPLOAD_LIMIT_REACHED");
    expect(capture).toHaveBeenCalledWith({
      distinctId: "user-1",
      event: "api_request_failed",
      properties: { route: "uploads", status: 403, error_code: "UPLOAD_LIMIT_REACHED" },
    });
  });

  it("서버 예외를 라우트 파일 경로와 함께 보내고 끝까지 전송합니다", async () => {
    const error = new Error("실패");
    await captureServerException(error, { route_path: "/app/dashboard/page", route_type: "render" });
    expect(captureException).toHaveBeenCalledWith(error, undefined,
      { route_path: "/app/dashboard/page", route_type: "render" });
    expect(flush).toHaveBeenCalled();
  });

  it("예외 전송이 실패해도 던지지 않습니다", async () => {
    flush.mockRejectedValue(new Error("network"));
    await expect(captureServerException(new Error("실패"), {})).resolves.toBeUndefined();
  });
});
