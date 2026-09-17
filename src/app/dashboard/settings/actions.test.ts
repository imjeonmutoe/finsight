// @vitest-environment node

import { beforeEach, expect, it, vi } from "vitest";

const { signOut, createServerSupabase, cookies, redirect, cookieStore } = vi.hoisted(() => {
  const out = vi.fn();
  const store = { getAll: () => [], set: () => {} };
  return {
    signOut: out,
    createServerSupabase: vi.fn(() => ({ auth: { signOut: out } })),
    cookies: vi.fn(async () => store),
    cookieStore: store,
    // 실제 redirect()는 NEXT_REDIRECT 예외를 던져 이후 코드를 멈춥니다. 같은 모양으로 흉내 냅니다.
    redirect: vi.fn((destination: string) => {
      throw new Error(`NEXT_REDIRECT:${destination}`);
    }),
  };
});
vi.mock("@/services/supabase", () => ({ createServerSupabase }));
vi.mock("next/headers", () => ({ cookies }));
vi.mock("next/navigation", () => ({ redirect }));

async function run() {
  const actions = await import("./actions");
  // redirect()가 던지는 예외는 정상 흐름입니다.
  await actions.signOut().catch(() => undefined);
}

function destination(): string | undefined {
  return redirect.mock.calls[0]?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  signOut.mockResolvedValue({ error: null });
});

it("이 브라우저의 세션만 끝냅니다", async () => {
  // 기본 scope는 global이라 다른 기기의 로그인까지 끊깁니다. 로그아웃 버튼의 기대와 다릅니다.
  await run();

  expect(signOut).toHaveBeenCalledWith({ scope: "local" });
});

it("쿠키 저장소를 주입해 세션 쿠키가 실제로 지워지게 합니다", async () => {
  // 쿠키를 지우는 주체는 @supabase/ssr의 setAll입니다. 저장소를 넘기지 않으면
  // 서버에서만 세션이 끝나고 브라우저 쿠키는 남습니다.
  await run();

  expect(createServerSupabase).toHaveBeenCalledWith(cookieStore);
});

it("로그아웃하면 랜딩으로 보냅니다", async () => {
  await run();

  expect(destination()).toBe("/");
});

it("실패하면 설정 화면에 오류를 남깁니다", async () => {
  // auth-js는 signOut 요청이 실패하면 로컬 세션을 지우지 않습니다. 그대로 랜딩으로 보내면
  // 로그인 상태로 판정돼 대시보드로 되돌아오고, 사용자는 로그아웃된 줄 압니다.
  signOut.mockResolvedValue({ error: { message: "network error" } });

  await run();

  expect(destination()).toBe("/dashboard/settings?error=signout");
});
