// @vitest-environment node

import { beforeEach, expect, it, vi } from "vitest";

const { signInWithOAuth, createServerSupabase, headers, redirect } = vi.hoisted(() => {
  const oauth = vi.fn();
  return {
    signInWithOAuth: oauth,
    createServerSupabase: vi.fn(() => ({ auth: { signInWithOAuth: oauth } })),
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

it("이메일·비밀번호 로그인 경로를 만들지 않습니다", async () => {
  const actions = await import("./actions");

  expect(Object.keys(actions)).toEqual(["signInWithGoogle"]);
});
