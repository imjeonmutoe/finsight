import { afterEach, describe, expect, it, vi } from "vitest";

const { initPostHogBrowser } = vi.hoisted(() => ({ initPostHogBrowser: vi.fn() }));
vi.mock("@/lib/posthog-browser", () => ({ initPostHogBrowser }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("브라우저 계측 진입점", () => {
  it("설정이 있으면 PostHog를 초기화합니다", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    await import("./instrumentation-client");
    expect(initPostHogBrowser).toHaveBeenCalledWith("phc_test", "https://us.i.posthog.com");
  });

  it("개발 환경에서 설정이 빠지면 바로 실패합니다", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    await expect(import("./instrumentation-client")).rejects.toThrow("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN");
    expect(initPostHogBrowser).not.toHaveBeenCalled();
  });
});
