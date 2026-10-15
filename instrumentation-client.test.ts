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

  // 로컬은 키를 비워 PostHog로 보내지 않는다. 개발 서버의 에러가 prod 프로젝트에 섞이면
  // oncall alert가 공개 Issue를 연다.
  it.each(["development", "production"])("설정이 빠지면 %s에서도 멈추지 않고 초기화만 건너뜁니다", async (nodeEnv) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    await expect(import("./instrumentation-client")).resolves.toBeDefined();
    expect(initPostHogBrowser).not.toHaveBeenCalled();
  });
});
