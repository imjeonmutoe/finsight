// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const { constructor } = vi.hoisted(() => ({ constructor: vi.fn() }));
vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(...args: unknown[]) { constructor(...args); }
  },
}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./posthog-log", () => ({ flushPostHogLogs: vi.fn(), logPostHogCapture: vi.fn() }));

const { getPostHogClient } = await import("./posthog-server");
const { redactExceptionEvent } = await import("./posthog-privacy");

describe("PostHog 서버 클라이언트", () => {
  it("LLM 원문과 예외 메시지를 보내지 않도록 설정합니다", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    getPostHogClient();
    expect(constructor).toHaveBeenCalledWith("phc_test", expect.objectContaining({
      privacyMode: true,
      before_send: redactExceptionEvent,
    }));
    vi.unstubAllEnvs();
  });
});
