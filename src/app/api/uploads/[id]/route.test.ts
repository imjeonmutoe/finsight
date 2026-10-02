// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data?: unknown; error?: unknown; count?: number };
type Call = { key: string; method: string; args: unknown[] };

const { getClaims, from, remove, storageFrom, createServerSupabase } = vi.hoisted(() => {
  const removeFn = vi.fn();
  const storage = vi.fn(() => ({ remove: removeFn }));
  const claims = vi.fn();
  const fromFn = vi.fn();
  return {
    getClaims: claims, from: fromFn, remove: removeFn, storageFrom: storage,
    createServerSupabase: vi.fn(() => ({
      auth: { getClaims: claims }, from: fromFn, storage: { from: storage },
    })),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/services/supabase", () => ({ createServerSupabase }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }));

const queues = new Map<string, Result[]>();
const calls: Call[] = [];
const WRITERS = ["select", "insert", "update", "delete", "upsert"];

function enqueue(key: string, ...results: Result[]) {
  queues.set(key, [...(queues.get(key) ?? []), ...results]);
}

function builder(table: string) {
  let key = table;
  const api: Record<string, unknown> = {
    then: (resolve: (value: Result) => unknown) => {
      const result = queues.get(key)?.shift() ?? { data: null, error: null };
      return Promise.resolve({ data: null, error: null, ...result }).then(resolve);
    },
  };
  for (const method of [...WRITERS, "eq", "in", "neq", "order", "limit", "single", "maybeSingle"]) {
    api[method] = (...args: unknown[]) => {
      if (WRITERS.includes(method) && key === table) key = `${table}:${method}`;
      calls.push({ key, method, args });
      return api;
    };
  }
  return api;
}

function argsOf(key: string, method: string): unknown[][] {
  return calls.filter((call) => call.key === key && call.method === method).map((call) => call.args);
}

const UPLOAD_ID = "22222222-2222-4222-8222-222222222222";
const PATH = `user-1/${UPLOAD_ID}.csv`;

function uploadRow(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: UPLOAD_ID, filename: "8월 명세서.csv", storage_path: PATH, status: "parsed",
      inserted_count: 34, duplicate_count: 2, unclassified_count: 5,
      created_at: "2026-08-05T00:00:00.000Z", ...overrides,
    },
  };
}

async function call(method: "GET" | "DELETE", id = UPLOAD_ID): Promise<Response> {
  const route = await import("./route");
  const handler = method === "GET" ? route.GET : route.DELETE;
  return handler(
    new Request(`http://local/api/uploads/${id}`, { method }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  queues.clear();
  calls.length = 0;
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
  from.mockImplementation(builder);
  remove.mockResolvedValue({ error: null });
});

describe("GET /api/uploads/[id]", () => {
  it("함께 삭제될 거래 건수를 돌려줘 삭제 확인 화면이 고지할 수 있게 합니다", async () => {
    enqueue("uploads:select", uploadRow());
    enqueue("transactions:select", { count: 34 });

    const response = await call("GET");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      uploadId: UPLOAD_ID, filename: "8월 명세서.csv", status: "parsed",
      createdAt: "2026-08-05T00:00:00.000Z", transactionCount: 34,
    });
    expect(argsOf("transactions:select", "eq")).toEqual([["user_id", "user-1"], ["upload_id", UPLOAD_ID]]);
  });

  it("미인증·남의 업로드는 조회되지 않습니다", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    expect((await call("GET")).status).toBe(401);

    vi.clearAllMocks();
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    enqueue("uploads:select", { data: null });
    expect((await call("GET")).status).toBe(404);
    expect(argsOf("uploads:select", "eq")).toEqual([["id", UPLOAD_ID], ["user_id", "user-1"]]);
  });

  it("업로드 ID 형식이 아니면 400입니다", async () => {
    expect((await call("GET", "업로드")).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/uploads/[id]", () => {
  it("원본을 먼저 지우고 파생 거래까지 함께 삭제합니다", async () => {
    enqueue("uploads:select", uploadRow());
    enqueue("transactions:select", { count: 34 });
    enqueue("uploads:delete", { error: null });

    const response = await call("DELETE");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: 34 });
    expect(storageFrom).toHaveBeenCalledWith("statements");
    expect(remove).toHaveBeenCalledWith([PATH]);
    expect(argsOf("uploads:delete", "eq")).toEqual([["id", UPLOAD_ID], ["user_id", "user-1"]]);
  });

  it("Storage 삭제가 실패하면 DB 삭제를 하지 않습니다", async () => {
    // auth.users의 CASCADE는 Storage 객체를 지우지 않으므로 순서를 Storage → DB로 둡니다.
    enqueue("uploads:select", uploadRow());
    enqueue("transactions:select", { count: 34 });
    remove.mockResolvedValue({ error: { message: "storage down" } });

    const response = await call("DELETE");

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.not.toContain("storage down");
    expect(argsOf("uploads:delete", "delete")).toEqual([]);
  });

  it("DB 삭제가 실패하면 500이며 성공으로 응답하지 않습니다", async () => {
    enqueue("uploads:select", uploadRow());
    enqueue("transactions:select", { count: 34 });
    enqueue("uploads:delete", { error: { message: "deadlock detected" } });

    const response = await call("DELETE");

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.not.toContain("deadlock");
  });

  it("미인증 요청은 401이며 원본을 지우지 않습니다", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });

    expect((await call("DELETE")).status).toBe(401);
    expect(remove).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("남의 업로드는 404이며 원본을 지우지 않습니다", async () => {
    enqueue("uploads:select", { data: null });

    expect((await call("DELETE")).status).toBe(404);
    expect(remove).not.toHaveBeenCalled();
  });

  it("행의 storage_path가 남의 폴더면 404이며 그 경로를 지우지 않습니다", async () => {
    // storage_path는 클라이언트가 PostgREST로 직접 INSERT할 수 있는 컬럼입니다(0004).
    enqueue("uploads:select", uploadRow({ storage_path: `00000000-0000-4000-8000-000000000009/${UPLOAD_ID}.csv` }));
    enqueue("transactions:select", { count: 0 });

    expect((await call("DELETE")).status).toBe(404);
    expect(remove).not.toHaveBeenCalled();
    expect(argsOf("uploads:delete", "delete")).toEqual([]);
  });
});
