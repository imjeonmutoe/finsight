// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLASSIFICATION_BATCH_SIZE } from "@/lib/limits";

type Result = { data?: unknown; error?: unknown; count?: number };
type Call = { key: string; method: string; args: unknown[] };

const { getClaims, from, rpc, createServerSupabase, classifyTransactions } = vi.hoisted(() => {
  const claims = vi.fn();
  const fromFn = vi.fn();
  const rpcFn = vi.fn();
  return {
    getClaims: claims, from: fromFn, rpc: rpcFn,
    createServerSupabase: vi.fn(() => ({ auth: { getClaims: claims }, from: fromFn, rpc: rpcFn })),
    classifyTransactions: vi.fn(),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/services/supabase", () => ({ createServerSupabase }));
vi.mock("@/services/claude", () => ({ classifyTransactions }));
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
      const result = queues.get(key)?.shift() ?? { data: [], error: null };
      return Promise.resolve({ data: null, error: null, ...result }).then(resolve);
    },
  };
  for (const method of [...WRITERS, "eq", "in", "is", "order", "limit", "single", "maybeSingle"]) {
    api[method] = (...args: unknown[]) => {
      if (WRITERS.includes(method) && key === table) key = `${table}:${method}`;
      calls.push({ key, method, args });
      return api;
    };
  }
  return api;
}

function callsOf(key: string): Call[] {
  return calls.filter((call) => call.key === key);
}

function argsOf(key: string, method: string): unknown[][] {
  return callsOf(key).filter((call) => call.method === method).map((call) => call.args);
}

const ID = (index: number) => `0000000${index}-0000-4000-8000-000000000000`;

function row(index: number, merchantRaw: string) {
  return {
    id: ID(index), merchant_raw: merchantRaw, merchant_norm: merchantRaw.replace(/\s/g, ""),
    amount_krw: 10_000 + index,
  };
}

async function classify(): Promise<Response> {
  const { POST } = await import("./route");
  return POST();
}

beforeEach(() => {
  vi.clearAllMocks();
  queues.clear();
  calls.length = 0;
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
  from.mockImplementation(builder);
  classifyTransactions.mockResolvedValue([]);
});

describe("POST /api/transactions/classify 선택", () => {
  it("미인증 요청은 401이며 모델을 호출하지 않습니다", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });

    expect((await classify()).status).toBe(401);
    expect(classifyTransactions).not.toHaveBeenCalled();
  });

  it("한 요청에 한 배치만 처리하고 지출·환불의 미분류만 선택합니다", async () => {
    enqueue("transactions:select", { data: [row(1, "스타벅스")] });
    enqueue("merchant_rules:select", { data: [] });
    enqueue("transactions:update", { data: [{ id: ID(1) }] });
    enqueue("transactions:select", { count: 0 });

    const response = await classify();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ classified: 1, remaining: 0 });
    expect(argsOf("transactions:select", "limit")).toEqual([[CLASSIFICATION_BATCH_SIZE]]);
    expect(argsOf("transactions:select", "in")).toEqual([
      ["kind", ["expense", "refund"]], ["kind", ["expense", "refund"]],
    ]);
    expect(argsOf("transactions:select", "is")).toEqual([["category", null], ["category", null]]);
    expect(argsOf("transactions:select", "eq")).toEqual([["user_id", "user-1"], ["user_id", "user-1"]]);
    // 서버가 배치 루프를 돌지 않습니다. 반복은 클라이언트가 합니다(ADR-006).
    expect(callsOf("transactions:select").filter((call) => call.method === "limit")).toHaveLength(1);
    // lease·사용량 예약 RPC를 만들지 않습니다(ADR-012).
    expect(rpc).not.toHaveBeenCalled();
  });

  it("미분류가 없으면 모델을 호출하지 않고 0을 돌려줍니다", async () => {
    enqueue("transactions:select", { data: [] });

    const response = await classify();

    await expect(response.json()).resolves.toEqual({ classified: 0, remaining: 0 });
    expect(classifyTransactions).not.toHaveBeenCalled();
    expect(argsOf("transactions:update", "update")).toEqual([]);
  });

  it("조회에 실패하면 500이며 모델을 호출하지 않습니다", async () => {
    enqueue("transactions:select", { data: null, error: { message: "permission denied" } });

    const response = await classify();

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.not.toContain("permission denied");
    expect(classifyTransactions).not.toHaveBeenCalled();
  });
});

describe("POST /api/transactions/classify 3단 분류", () => {
  it("사용자 규칙 → 내장 사전 → 남은 것만 모델 순으로 처리합니다", async () => {
    enqueue("transactions:select", {
      data: [row(1, "쿠팡"), row(2, "스타벅스"), row(3, "동네철물점")],
    });
    enqueue("merchant_rules:select", { data: [{ merchant_norm: "쿠팡", category: "배달" }] });
    classifyTransactions.mockResolvedValue([{ id: ID(3), category: "기타" }]);
    enqueue("transactions:update", { data: [{ id: ID(1) }] });
    enqueue("transactions:update", { data: [{ id: ID(2) }] });
    enqueue("transactions:update", { data: [{ id: ID(3) }] });
    enqueue("transactions:select", { count: 0 });

    const response = await classify();

    await expect(response.json()).resolves.toEqual({ classified: 3, remaining: 0 });
    // 모델에는 규칙이 못 잡은 한 건만 갑니다.
    expect(classifyTransactions).toHaveBeenCalledTimes(1);
    expect(classifyTransactions).toHaveBeenCalledWith([
      { id: ID(3), merchant: "동네철물점", amountKrw: 10_003 },
    ]);
    const updates = argsOf("transactions:update", "update").map(([payload]) => payload);
    expect(updates).toEqual([
      { category: "배달", category_source: "user" },
      { category: "카페/간식", category_source: "rule" },
      { category: "기타", category_source: "ai" },
    ]);
  });

  it("규칙이 전부 잡으면 모델을 호출하지 않습니다", async () => {
    enqueue("transactions:select", { data: [row(1, "쿠팡"), row(2, "넷플릭스")] });
    enqueue("merchant_rules:select", { data: [] });
    enqueue("transactions:update", { data: [{ id: ID(1) }] });
    enqueue("transactions:update", { data: [{ id: ID(2) }] });
    enqueue("transactions:select", { count: 0 });

    const response = await classify();

    await expect(response.json()).resolves.toEqual({ classified: 2, remaining: 0 });
    expect(classifyTransactions).not.toHaveBeenCalled();
  });

  it("모델 반환에 없는 id는 미분류로 남기고 순서를 신뢰하지 않습니다", async () => {
    enqueue("transactions:select", { data: [row(1, "가게하나"), row(2, "가게둘")] });
    enqueue("merchant_rules:select", { data: [] });
    // 두 번째 항목만 돌려주고 배열 순서를 뒤집습니다.
    classifyTransactions.mockResolvedValue([{ id: ID(2), category: "쇼핑" }]);
    enqueue("transactions:update", { data: [{ id: ID(2) }] });
    enqueue("transactions:select", { count: 1 });

    const response = await classify();

    await expect(response.json()).resolves.toEqual({ classified: 1, remaining: 1 });
    expect(argsOf("transactions:update", "in")).toEqual([["id", [ID(2)]]]);
  });

  it("모델이 실패해도 규칙으로 채운 결과는 남기고 진행을 멈추게 합니다", async () => {
    enqueue("transactions:select", { data: [row(1, "쿠팡"), row(2, "가게하나")] });
    enqueue("merchant_rules:select", { data: [] });
    classifyTransactions.mockRejectedValue(new Error("분석 요청을 처리하지 못했습니다."));
    enqueue("transactions:update", { data: [{ id: ID(1) }] });
    enqueue("transactions:select", { count: 1 });

    const response = await classify();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "CLASSIFY_FAILED", classified: 1, remaining: 1,
    });
  });
});

describe("POST /api/transactions/classify 멱등", () => {
  it("갱신에 category IS NULL 조건과 user_id를 함께 겁니다", async () => {
    enqueue("transactions:select", { data: [row(1, "쿠팡")] });
    enqueue("merchant_rules:select", { data: [] });
    enqueue("transactions:update", { data: [{ id: ID(1) }] });
    enqueue("transactions:select", { count: 0 });

    await classify();

    expect(argsOf("transactions:update", "eq")).toEqual([["user_id", "user-1"]]);
    expect(argsOf("transactions:update", "is")).toEqual([["category", null]]);
    expect(argsOf("transactions:update", "in")).toEqual([["id", [ID(1)]]]);
  });

  it("동시 호출의 두 번째 갱신은 아무 행도 바꾸지 않아 결과가 같습니다", async () => {
    enqueue("transactions:select", { data: [row(1, "쿠팡"), row(2, "넷플릭스")] });
    enqueue("merchant_rules:select", { data: [] });
    // 먼저 도착한 요청이 이미 채운 뒤이므로 UPDATE ... WHERE category IS NULL이 0행을 바꿉니다.
    enqueue("transactions:update", { data: [] });
    enqueue("transactions:update", { data: [] });
    enqueue("transactions:select", { count: 0 });

    const response = await classify();

    // 진척이 없고 remaining도 그대로이므로 클라이언트가 반복을 멈춥니다.
    await expect(response.json()).resolves.toEqual({ classified: 0, remaining: 0 });
  });

  it("갱신에 실패하면 500이며 성공으로 응답하지 않습니다", async () => {
    enqueue("transactions:select", { data: [row(1, "쿠팡")] });
    enqueue("merchant_rules:select", { data: [] });
    enqueue("transactions:update", { data: null, error: { message: "deadlock detected" } });

    const response = await classify();

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.not.toContain("deadlock");
  });
});
