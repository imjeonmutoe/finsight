// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data?: unknown; error?: unknown };
type Call = { key: string; method: string; args: unknown[] };

const {
  getClaims, from, list, remove, storageFrom, serviceFrom,
  createServerSupabase, createServiceSupabase,
} = vi.hoisted(() => {
  const listFn = vi.fn();
  const removeFn = vi.fn();
  const storage = vi.fn(() => ({ list: listFn, remove: removeFn }));
  const claims = vi.fn();
  const fromFn = vi.fn();
  const serviceFromFn = vi.fn();
  return {
    getClaims: claims, from: fromFn, list: listFn, remove: removeFn,
    storageFrom: storage, serviceFrom: serviceFromFn,
    createServerSupabase: vi.fn(() => ({
      auth: { getClaims: claims }, from: fromFn, storage: { from: storage },
    })),
    createServiceSupabase: vi.fn(() => ({ from: serviceFromFn })),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/services/supabase", () => ({ createServerSupabase, createServiceSupabase }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }));

const queues = new Map<string, Result[]>();
const calls: Call[] = [];
// 삭제 순서를 검증하려면 Storage 호출과 DB 호출이 한 타임라인에 있어야 한다.
const timeline: string[] = [];
const WRITERS = ["select", "insert", "update", "delete", "upsert"];

function enqueue(key: string, ...results: Result[]) {
  queues.set(key, [...(queues.get(key) ?? []), ...results]);
}

function builder(table: string, prefix: string) {
  let key = `${prefix}${table}`;
  const api: Record<string, unknown> = {
    then: (resolve: (value: Result) => unknown) => {
      const result = queues.get(key)?.shift() ?? { data: null, error: null };
      return Promise.resolve({ data: null, error: null, ...result }).then(resolve);
    },
  };
  for (const method of [...WRITERS, "eq", "in", "limit"]) {
    api[method] = (...args: unknown[]) => {
      if (WRITERS.includes(method) && key === `${prefix}${table}`) {
        key = `${prefix}${table}:${method}`;
        timeline.push(key);
      }
      calls.push({ key, method, args });
      return api;
    };
  }
  return api;
}

function argsOf(key: string, method: string): unknown[][] {
  return calls.filter((call) => call.key === key && call.method === method).map((call) => call.args);
}

async function call(body: unknown = { confirm: "삭제" }): Promise<Response> {
  const route = await import("./route");
  return route.DELETE(new Request("http://local/api/account/data", {
    method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  queues.clear();
  calls.length = 0;
  timeline.length = 0;
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
  from.mockImplementation((table: string) => builder(table, ""));
  serviceFrom.mockImplementation((table: string) => builder(table, "service:"));
  list.mockImplementation(async () => {
    timeline.push("storage:list");
    return { data: [{ name: "a.csv" }, { name: "b.csv" }], error: null };
  });
  remove.mockImplementation(async () => {
    timeline.push("storage:remove");
    return { data: null, error: null };
  });
});

describe("DELETE /api/account/data", () => {
  it("Storage를 먼저 비우고 그 다음에 DB를 지웁니다", async () => {
    // 순서가 반대면 어떤 객체를 지워야 할지 알 방법이 사라져 고아 파일이 영구히 남는다.
    const response = await call();

    expect(response.status).toBe(200);
    expect(timeline.indexOf("storage:remove")).toBeGreaterThanOrEqual(0);
    for (const table of ["transactions:delete", "uploads:delete", "merchant_rules:delete", "financial_sources:delete"]) {
      expect(timeline.indexOf(table)).toBeGreaterThan(timeline.indexOf("storage:remove"));
    }
  });

  it("사용자 폴더의 객체만 지웁니다", async () => {
    await call();

    expect(list).toHaveBeenCalledWith("user-1", expect.anything());
    expect(remove).toHaveBeenCalledWith(["user-1/a.csv", "user-1/b.csv"]);
  });

  it("금융 데이터 테이블과 insight_cache를 지우고 profiles는 건드리지 않습니다", async () => {
    await call();

    for (const table of ["transactions", "uploads", "merchant_rules", "financial_sources"]) {
      expect(argsOf(`${table}:delete`, "eq")).toEqual([["user_id", "user-1"]]);
    }
    // insight_cache는 authenticated에게 DELETE 권한이 없다. 세션을 검증한 뒤 service role로만 지운다.
    expect(argsOf("service:insight_cache:delete", "eq")).toEqual([["user_id", "user-1"]]);
    expect(from).not.toHaveBeenCalledWith("profiles");
    expect(serviceFrom).not.toHaveBeenCalledWith("profiles");
  });

  it("세션의 sub만 사용하고 본문의 user_id를 믿지 않습니다", async () => {
    await call({ confirm: "삭제", user_id: "victim" });

    expect(argsOf("uploads:delete", "eq")).toEqual([["user_id", "user-1"]]);
  });

  it("확인 문구가 없으면 아무것도 지우지 않습니다", async () => {
    const response = await call({ confirm: "" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "CONFIRM_REQUIRED" });
    expect(remove).not.toHaveBeenCalled();
    expect(timeline).toEqual([]);
  });

  it("로그인하지 않았으면 401을 돌려줍니다", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });

    const response = await call();

    expect(response.status).toBe(401);
    expect(remove).not.toHaveBeenCalled();
  });

  it("Storage 삭제가 실패하면 DB를 건드리지 않습니다", async () => {
    remove.mockResolvedValue({ data: null, error: { message: "boom" } });

    const response = await call();

    expect(response.status).toBe(500);
    expect(timeline.filter((entry) => entry.endsWith(":delete"))).toEqual([]);
  });

  it("service role을 만들 수 없으면 아무것도 지우지 않습니다", async () => {
    // 캐시만 남기고 거래를 지우면 근거 없는 인사이트가 남는다. 먼저 확인하고 시작한다.
    createServiceSupabase.mockImplementationOnce(() => { throw new Error("no key"); });

    const response = await call();

    expect(response.status).toBe(503);
    expect(remove).not.toHaveBeenCalled();
    expect(timeline).toEqual([]);
  });

  it("모델 호출 한도를 되돌리는 경로를 만들지 않습니다", async () => {
    // ADR-012: 사용량 테이블·lease·예약이 없으므로 삭제가 되돌릴 사용량 상태도 없다.
    await call();

    const touched = calls.map((entry) => entry.key);
    expect(touched.some((key) => key.includes("llm_usage") || key.includes("usage"))).toBe(false);
  });
});
