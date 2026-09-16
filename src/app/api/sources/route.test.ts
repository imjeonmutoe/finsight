// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: unknown };

const { getClaims, from, createServerSupabase } = vi.hoisted(() => {
  const claims = vi.fn();
  const fromFn = vi.fn();
  return {
    getClaims: claims,
    from: fromFn,
    createServerSupabase: vi.fn(() => ({ auth: { getClaims: claims }, from: fromFn })),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/services/supabase", () => ({ createServerSupabase }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }));

function query(result: Result) {
  const api: Record<string, unknown> = {
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const name of ["select", "insert", "eq", "order", "single"]) {
    api[name] = vi.fn(() => api);
  }
  return api as Record<string, ReturnType<typeof vi.fn>> & { then: unknown };
}

function request(body: unknown): Request {
  return new Request("http://local/api/sources", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
});

describe("GET /api/sources", () => {
  it("본인 출처만 조회해 목록을 돌려줍니다", async () => {
    const table = query({ data: [{ id: "source-1", label: "신한카드 (5·12)", kind: "card" }], error: null });
    from.mockReturnValue(table);

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sources: [{ id: "source-1", label: "신한카드 (5·12)", kind: "card" }],
    });
    expect(from).toHaveBeenCalledWith("financial_sources");
    expect(table.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("미인증 요청은 401이며 조회하지 않습니다", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("POST /api/sources", () => {
  it("UUID를 서버에서 만들고 세션 사용자로 저장합니다", async () => {
    const table = query({ data: { id: "source-2", label: "국민은행 (입출금)", kind: "bank" }, error: null });
    from.mockReturnValue(table);

    const { POST } = await import("./route");
    const response = await POST(request({ label: "  국민은행 (입출금)  ", kind: "bank", id: "공격자-id", user_id: "user-2" }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      source: { id: "source-2", label: "국민은행 (입출금)", kind: "bank" },
    });
    // 클라이언트가 보낸 id·user_id를 신뢰하지 않습니다.
    expect(table.insert).toHaveBeenCalledWith({ user_id: "user-1", label: "국민은행 (입출금)", kind: "bank" });
  });

  it.each([
    { label: "카드", kind: "credit" },
    { label: "", kind: "card" },
    { label: "   ", kind: "card" },
    { label: "카".repeat(61), kind: "card" },
    { kind: "card" },
    { label: "카드" },
  ])("잘못된 별칭·종류는 400이며 저장하지 않습니다: %o", async (body) => {
    const table = query({ data: null, error: null });
    from.mockReturnValue(table);

    const { POST } = await import("./route");
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("계좌·카드번호처럼 보이는 별칭을 거절합니다", async () => {
    const table = query({ data: null, error: null });
    from.mockReturnValue(table);

    const { POST } = await import("./route");
    const response = await POST(request({ label: "신한 1234-5678-9012-3456", kind: "card" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_SOURCE" });
    expect(from).not.toHaveBeenCalled();
  });

  it("JSON이 아니면 400입니다", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://local/api/sources", { method: "POST", body: "{" }));

    expect(response.status).toBe(400);
  });

  it("저장에 실패하면 원본 오류 없이 500을 돌려줍니다", async () => {
    const table = query({ data: null, error: { message: 'duplicate key value violates "financial_sources_pkey"' } });
    from.mockReturnValue(table);

    const { POST } = await import("./route");
    const response = await POST(request({ label: "신한카드", kind: "card" }));

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.not.toContain("financial_sources_pkey");
  });
});
