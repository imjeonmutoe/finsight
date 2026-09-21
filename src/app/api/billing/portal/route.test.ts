// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getClaims, createServerSupabase, createCustomerPortalUrl } = vi.hoisted(() => {
  const claims = vi.fn();
  return {
    getClaims: claims,
    createServerSupabase: vi.fn(() => ({ auth: { getClaims: claims } })),
    createCustomerPortalUrl: vi.fn(),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/services/supabase", () => ({ createServerSupabase }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }));
vi.mock("@/services/polar", () => ({ createCustomerPortalUrl }));

const original = { ...process.env };
const USER_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  process.env["NEXT_PUBLIC_SITE_URL"] = "https://finsight.example";
  getClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } }, error: null });
  createCustomerPortalUrl.mockResolvedValue("https://sandbox.polar.sh/portal?token=x");
});

afterEach(() => {
  process.env = { ...original };
});

describe("GET /api/billing/portal", () => {
  it("본인 고객 포털로 보냅니다", async () => {
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://sandbox.polar.sh/portal?token=x");
    expect(createCustomerPortalUrl).toHaveBeenCalledWith({
      userId: USER_ID, returnUrl: "https://finsight.example/dashboard/settings",
    });
  });

  it("포털 주소를 CDN이 캐싱하지 않게 합니다", async () => {
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("미인증 요청은 401이며 Polar을 호출하지 않습니다", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(401);
    expect(createCustomerPortalUrl).not.toHaveBeenCalled();
  });

  it("포털 세션을 못 만들면 503과 다음 행동을 돌려줍니다", async () => {
    createCustomerPortalUrl.mockRejectedValue(new Error("Polar /v1/customer-sessions/ 요청이 404로 실패했습니다."));
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json() as { message: string };
    expect(body.message).toContain("다시");
  });
});
