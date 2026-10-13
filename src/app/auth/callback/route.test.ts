// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

const { exchangeCodeForSession, createServerSupabase } = vi.hoisted(() => {
  const exchange = vi.fn();
  return {
    exchangeCodeForSession: exchange,
    createServerSupabase: vi.fn(() => ({ auth: { exchangeCodeForSession: exchange } })),
  };
});
vi.mock("@/services/supabase", () => ({ createServerSupabase }));
const { captureServerEvent } = vi.hoisted(() => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }));

const ORIGIN = "https://finsight.example";

async function get(query: string) {
  const { GET } = await import("./route");
  return GET(new NextRequest(new URL(`/auth/callback${query}`, ORIGIN)));
}

function location(response: Response): string | null {
  return response.headers.get("location");
}

beforeEach(() => {
  vi.clearAllMocks();
  exchangeCodeForSession.mockResolvedValue({ error: null });
});

it("코드를 세션으로 교환하고 대시보드로 보냅니다", async () => {
  const response = await get("?code=인증코드");

  expect(exchangeCodeForSession).toHaveBeenCalledWith("인증코드");
  expect(response.status).toBe(307);
  expect(location(response)).toBe(`${ORIGIN}/dashboard`);
});

it.each([
  ["처음 로그인하면 신규", "2026-10-13T05:00:00Z", "2026-10-13T05:00:02Z", true],
  ["다시 로그인하면 기존", "2026-09-01T00:00:00Z", "2026-10-13T05:00:00Z", false],
])("%s 사용자로 로그인을 기록합니다", async (_label, createdAt, lastSignInAt, isNewUser) => {
  exchangeCodeForSession.mockResolvedValue({
    data: { user: { id: "user-1", created_at: createdAt, last_sign_in_at: lastSignInAt } }, error: null,
  });

  await get("?code=인증코드");

  expect(captureServerEvent).toHaveBeenCalledWith({
    distinctId: "user-1", event: "user_signed_in", properties: { is_new_user: isNewUser },
  });
});

it("교환에 실패하면 로그인 화면으로 되돌립니다", async () => {
  exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid request" } });

  const response = await get("?code=만료된코드");

  expect(location(response)).toBe(`${ORIGIN}/login?error=oauth`);
  // 세션이 없어 사람과 묶지 않는다. 실패율만 본다.
  expect(captureServerEvent).toHaveBeenCalledWith({
    distinctId: expect.any(String),
    event: "api_request_failed",
    properties: { route: "auth/callback", status: 401, error_code: "OAUTH_EXCHANGE_FAILED", $process_person_profile: false },
  });
});

it("코드가 없으면 모델을 호출하지 않고 로그인 화면으로 되돌립니다", async () => {
  const response = await get("");

  expect(exchangeCodeForSession).not.toHaveBeenCalled();
  expect(location(response)).toBe(`${ORIGIN}/login?error=oauth`);
});

it("사용자가 동의를 취소하면 로그인 화면으로 되돌립니다", async () => {
  // Google이 code 대신 error를 붙여 되돌려 보내는 경우입니다.
  const response = await get("?error=access_denied");

  expect(exchangeCodeForSession).not.toHaveBeenCalled();
  expect(location(response)).toBe(`${ORIGIN}/login?error=oauth`);
});

it("목적지를 쿼리 파라미터에서 받지 않습니다", async () => {
  // 오픈 리디렉트 방지. 로그인 후 목적지는 서버가 고정합니다.
  const response = await get("?code=인증코드&next=https://evil.example&redirectTo=https://evil.example");

  expect(location(response)).toBe(`${ORIGIN}/dashboard`);
});

it("실패 메시지에 인증 코드나 원본 오류를 싣지 않습니다", async () => {
  exchangeCodeForSession.mockResolvedValue({ error: { message: "PKCE verifier 만료: 인증코드" } });

  const response = await get("?code=인증코드");

  expect(location(response)).toBe(`${ORIGIN}/login?error=oauth`);
});
