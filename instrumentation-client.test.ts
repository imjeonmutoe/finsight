import { afterEach, describe, expect, it, vi } from "vitest";

const { initPostHogBrowser, supabase } = vi.hoisted(() => ({
  initPostHogBrowser: vi.fn(),
  supabase: { auth: { onAuthStateChange: vi.fn() } },
}));
vi.mock("@/services/posthog-browser", () => ({ initPostHogBrowser }));
vi.mock("@/services/supabase", () => ({ createBrowserSupabase: () => supabase }));

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
    expect(initPostHogBrowser).toHaveBeenCalledWith("phc_test", "https://us.i.posthog.com", supabase);
  });

  it("개발 환경에서 설정이 빠지면 바로 실패합니다", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    await expect(import("./instrumentation-client")).rejects.toThrow("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN");
    expect(initPostHogBrowser).not.toHaveBeenCalled();
  });
});
