// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { signInWithOAuth, signInWithPassword, signUp, createServerSupabase, headers, redirect } = vi.hoisted(() => {
  const oauth = vi.fn();
  const password = vi.fn();
  const signUpFn = vi.fn();
  return {
    signInWithOAuth: oauth,
    signInWithPassword: password,
    signUp: signUpFn,
    createServerSupabase: vi.fn(() => ({
      auth: { signInWithOAuth: oauth, signInWithPassword: password, signUp: signUpFn },
    })),
    headers: vi.fn(),
    // 실제 redirect()는 NEXT_REDIRECT 예외를 던져 이후 코드를 멈춥니다. 같은 모양으로 흉내 냅니다.
    redirect: vi.fn((destination: string) => {
      throw new Error(`NEXT_REDIRECT:${destination}`);
    }),
  };
});
vi.mock("@/services/supabase", () => ({ createServerSupabase }));
vi.mock("next/headers", () => ({
  headers,
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));

const ORIGIN = "https://finsight.example";
const PROVIDER_URL = "https://project.supabase.co/auth/v1/authorize?provider=google";

async function run() {
  const { signInWithGoogle } = await import("./actions");
  // redirect()가 던지는 예외는 정상 흐름입니다.
  await signInWithGoogle().catch(() => undefined);
}

function destination(): string | undefined {
  return redirect.mock.calls[0]?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  headers.mockResolvedValue(new Headers({ origin: ORIGIN }));
  signInWithOAuth.mockResolvedValue({ data: { url: PROVIDER_URL }, error: null });
  signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("Google 인증 URL을 받아 그 주소로 보냅니다", async () => {
  await run();

  expect(signInWithOAuth).toHaveBeenCalledWith({
    provider: "google",
    options: { redirectTo: `${ORIGIN}/auth/callback` },
  });
  expect(destination()).toBe(PROVIDER_URL);
});

it("redirectTo를 서버가 고정합니다", async () => {
  // 사용자 입력이 아니라 Next가 Host와 대조해 검증한 origin 헤더에서만 만듭니다.
  await run();
  const options = signInWithOAuth.mock.calls[0]?.[0] as { options: { redirectTo: string } };

  expect(options.options.redirectTo).toBe(`${ORIGIN}/auth/callback`);
});

it("인증 URL을 받지 못하면 로그인 화면에 오류를 표시합니다", async () => {
  signInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });

  await run();

  expect(destination()).toBe("/login?error=oauth");
});

it("Supabase가 오류를 주면 로그인 화면에 오류를 표시합니다", async () => {
  signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: "provider is not enabled" } });

  await run();

  expect(destination()).toBe("/login?error=oauth");
});

it("origin 헤더가 없으면 Supabase를 호출하지 않습니다", async () => {
  // origin 없이 만들어진 요청으로 깨진 redirectTo를 만들지 않습니다.
  headers.mockResolvedValue(new Headers());

  await run();

  expect(signInWithOAuth).not.toHaveBeenCalled();
  expect(destination()).toBe("/login?error=oauth");
});

it("Google 외에는 프리뷰 테스트 계정 로그인만 둡니다", async () => {
  const actions = await import("./actions");

  expect(Object.keys(actions).sort()).toEqual(["signInAsPreviewAccount", "signInWithGoogle"]);
});

describe("signInAsPreviewAccount", () => {
  const FREE_ID = "5eed0000-0000-4000-8000-000000000001";

  async function runPreview(form: FormData) {
    const { signInAsPreviewAccount } = await import("./actions");
    await signInAsPreviewAccount(form).catch(() => undefined);
  }

  function formWith(entries: Record<string, string>): FormData {
    const form = new FormData();
    for (const [key, value] of Object.entries(entries)) form.set(key, value);
    return form;
  }

  it("프리뷰 배포가 아니면 Supabase 클라이언트를 만들지 않습니다", async () => {
    for (const env of ["production", "development", ""]) {
      vi.clearAllMocks();
      vi.stubEnv("VERCEL_ENV", env);

      await runPreview(formWith({ accountId: FREE_ID }));

      expect(createServerSupabase).not.toHaveBeenCalled();
      expect(signInWithPassword).not.toHaveBeenCalled();
      expect(destination()).toBe("/login?error=preview");
    }
  });

  it("목록에 없는 계정 id는 거부합니다", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");

    await runPreview(formWith({ accountId: "00000000-0000-4000-8000-000000000000" }));

    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(destination()).toBe("/login?error=preview");
  });

  it("계정 id가 없으면 거부합니다", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");

    await runPreview(new FormData());

    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(destination()).toBe("/login?error=preview");
  });

  it("성공하면 대시보드로 보냅니다", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");

    await runPreview(formWith({ accountId: FREE_ID }));

    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    expect(destination()).toBe("/dashboard");
  });

  it("실패하면 로그인 화면에 오류를 표시하고 가입으로 폴백하지 않습니다", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    signInWithPassword.mockResolvedValue({ data: { session: null }, error: { message: "Invalid login credentials" } });
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");

    await runPreview(formWith({ accountId: FREE_ID }));

    expect(signUp).not.toHaveBeenCalled();
    expect(destination()).toBe("/login?error=preview");
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("폼의 이메일·비밀번호는 무시하고 서버 상수만 씁니다", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const { PREVIEW_ACCOUNTS, PREVIEW_PASSWORD } = await import("@/lib/preview-accounts");

    await runPreview(formWith({ accountId: FREE_ID, email: "attacker@example.com", password: "guess" }));

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: PREVIEW_ACCOUNTS.find((account) => account.id === FREE_ID)?.email,
      password: PREVIEW_PASSWORD,
    });
  });
});
