// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: unknown };

const { getClaims, from, createServerSupabase, createProCheckout } = vi.hoisted(() => {
  const claims = vi.fn();
  const fromFn = vi.fn();
  return {
    getClaims: claims,
    from: fromFn,
    createServerSupabase: vi.fn(() => ({ auth: { getClaims: claims }, from: fromFn })),
    createProCheckout: vi.fn(),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/services/supabase", () => ({ createServerSupabase }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }));
vi.mock("@/services/polar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/polar")>();
  // clientIpAddress는 실제 구현을 그대로 씁니다 — IP 추출이 이 라우트의 검증 대상입니다.
  return { ...actual, createProCheckout };
});

const original = { ...process.env };
const USER_ID = "00000000-0000-4000-8000-000000000001";

function query(result: Result) {
  const api: Record<string, unknown> = {
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const name of ["select", "eq", "maybeSingle"]) {
    api[name] = vi.fn(() => api);
  }
  return api as Record<string, ReturnType<typeof vi.fn>> & { then: unknown };
}

function request(headers: Record<string, string> = {}): Request {
  return new Request("http://local/api/billing/checkout", { method: "POST", headers });
}

function profile(row: unknown) {
  const table = query({ data: row, error: null });
  from.mockReturnValue(table);
  return table;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env["NEXT_PUBLIC_SITE_URL"] = "https://finsight.example";
  getClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } }, error: null });
  createProCheckout.mockResolvedValue("https://sandbox.polar.sh/checkout/abc");
});

afterEach(() => {
  process.env = { ...original };
});

describe("POST /api/billing/checkout", () => {
  it("사용자 IP와 함께 체크아웃을 만들고 주소를 돌려줍니다", async () => {
    profile({ plan: "free", plan_expires_at: null, email: "user@example.com" });
    const { POST } = await import("./route");

    const response = await POST(request({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ url: "https://sandbox.polar.sh/checkout/abc" });
    expect(createProCheckout).toHaveBeenCalledWith({
      userId: USER_ID,
      email: "user@example.com",
      // 빠뜨리면 한국 사용자에게 USD 가격이 뜹니다.
      ipAddress: "203.0.113.7",
      successUrl: "https://finsight.example/dashboard/settings?checkout=success",
    });
  });

  it("본인 프로필만 조회합니다", async () => {
    const table = profile({ plan: "free", plan_expires_at: null, email: "user@example.com" });
    const { POST } = await import("./route");

    await POST(request());

    expect(from).toHaveBeenCalledWith("profiles");
    expect(table.eq).toHaveBeenCalledWith("id", USER_ID);
  });

  it("IP 헤더가 없으면 null로 넘깁니다", async () => {
    profile({ plan: "free", plan_expires_at: null, email: "user@example.com" });
    const { POST } = await import("./route");

    await POST(request());

    expect(createProCheckout).toHaveBeenCalledWith(expect.objectContaining({ ipAddress: null }));
  });

  it("미인증 요청은 401이며 Polar을 호출하지 않습니다", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(createProCheckout).not.toHaveBeenCalled();
  });

  it("이미 Pro면 409이며 두 번 결제시키지 않습니다", async () => {
    profile({ plan: "pro", plan_expires_at: null, email: "user@example.com" });
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(createProCheckout).not.toHaveBeenCalled();
  });

  it("만료된 Pro는 다시 결제할 수 있습니다", async () => {
    profile({ plan: "pro", plan_expires_at: "2020-01-01T00:00:00.000Z", email: "user@example.com" });
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(createProCheckout).toHaveBeenCalled();
  });

  it("프로필을 못 읽으면 500입니다", async () => {
    from.mockReturnValue(query({ data: null, error: { message: "boom" } }));
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(createProCheckout).not.toHaveBeenCalled();
  });

  it("Polar 호출이 실패하면 503과 다음 행동을 돌려줍니다", async () => {
    profile({ plan: "free", plan_expires_at: null, email: "user@example.com" });
    createProCheckout.mockRejectedValue(new Error("polar down"));
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(503);
    const body = await response.json() as { message: string };
    expect(body.message).toContain("다시");
  });
});
