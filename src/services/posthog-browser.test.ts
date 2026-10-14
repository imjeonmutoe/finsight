import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

type AuthCallback = (event: string, session: { user: { id: string; email?: string } } | null) => void;

const { init, identify, reset, onAuthStateChange } = vi.hoisted(() => ({
  init: vi.fn(), identify: vi.fn(), reset: vi.fn(), onAuthStateChange: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: { init, identify, reset } }));

const { initPostHogBrowser } = await import("./posthog-browser");
const supabase = { auth: { onAuthStateChange } } as unknown as SupabaseClient;
const { BROWSER_PRIVACY_OPTIONS } = await import("@/lib/posthog-privacy");

function authCallback(): AuthCallback {
  const callback = onAuthStateChange.mock.calls[0]?.[0] as AuthCallback | undefined;
  if (!callback) throw new Error("인증 상태 구독이 없습니다.");
  return callback;
}

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("브라우저 PostHog 초기화", () => {
  it("개인정보 가림 설정으로 초기화합니다", () => {
    initPostHogBrowser("phc_test", "https://us.i.posthog.com", supabase);
    expect(init).toHaveBeenCalledWith("phc_test", expect.objectContaining(BROWSER_PRIVACY_OPTIONS));
  });

  it("로그인 사용자를 id로만 식별하고 이메일은 보내지 않습니다", () => {
    initPostHogBrowser("phc_test", "https://us.i.posthog.com", supabase);
    authCallback()("SIGNED_IN", { user: { id: "user-1", email: "a@example.com" } });
    expect(identify).toHaveBeenCalledWith("user-1");
  });

  it("로그아웃하면 식별을 초기화합니다", () => {
    initPostHogBrowser("phc_test", "https://us.i.posthog.com", supabase);
    authCallback()("SIGNED_IN", { user: { id: "user-1" } });
    authCallback()("SIGNED_OUT", null);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
