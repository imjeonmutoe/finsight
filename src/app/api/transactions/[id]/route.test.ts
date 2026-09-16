// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeCandidateHash, computeDedupeHash } from "@/lib/dedupe";

type Result = { data?: unknown; error?: unknown; count?: number };
type Call = { key: string; method: string; args: unknown[] };

const { getClaims, from, createServerSupabase, getMonthlySummary } = vi.hoisted(() => {
  const claims = vi.fn();
  const fromFn = vi.fn();
  return {
    getClaims: claims, from: fromFn,
    createServerSupabase: vi.fn(() => ({ auth: { getClaims: claims }, from: fromFn })),
    getMonthlySummary: vi.fn(),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/services/supabase", () => ({ createServerSupabase }));
vi.mock("@/lib/queries", () => ({ getMonthlySummary }));
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
  for (const method of [...WRITERS, "eq", "in", "is", "order", "limit", "single", "maybeSingle"]) {
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

const TX_ID = "44444444-4444-4444-8444-444444444444";
const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const UPLOAD_ID = "22222222-2222-4222-8222-222222222222";
const FILE_HASH = "file-hash";

function txRow(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: TX_ID, source_id: SOURCE_ID, upload_id: UPLOAD_ID,
      occurred_on: "2026-08-25", accounting_month: "2026-08-01",
      merchant_raw: "행복은행 급여", merchant_norm: "행복은행급여", amount_krw: 3_000_000,
      kind: "expense", category: null, category_source: null,
      source_transaction_key: null, data_row_index: 4, ...overrides,
    },
  };
}

async function patch(body: unknown, id = TX_ID): Promise<Response> {
  const { PATCH } = await import("./route");
  return PATCH(
    new Request(`http://local/api/transactions/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  queues.clear();
  calls.length = 0;
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
  from.mockImplementation(builder);
  getMonthlySummary.mockResolvedValue({ month: "2026-08", totalKrw: 0, byCategory: [] });
});

describe("PATCH /api/transactions/[id] 검증", () => {
  it("미인증 요청은 401이며 조회하지 않습니다", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });

    expect((await patch({ category: "식비" })).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { category: "반려동물" },
    { kind: "카드대금" },
    { category: null },
    { category: "식비", merchantRaw: "고친 가맹점" },
    { amountKrw: 1 },
  ])("허용하지 않는 수정은 400입니다: %o", async (body) => {
    expect((await patch(body)).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("남의 거래는 404이며 user_id 조건을 함께 겁니다", async () => {
    enqueue("transactions:select", { data: null });

    expect((await patch({ category: "식비" })).status).toBe(404);
    expect(argsOf("transactions:select", "eq")).toEqual([["id", TX_ID], ["user_id", "user-1"]]);
  });
});

describe("PATCH /api/transactions/[id] 카테고리", () => {
  it("category_source를 user로 바꾸고 가맹점 규칙을 함께 저장합니다", async () => {
    enqueue("transactions:select", txRow({ merchant_raw: "쿠팡", merchant_norm: "쿠팡" }));
    enqueue("merchant_rules:upsert", { error: null });
    enqueue("transactions:update", { data: { id: TX_ID }, error: null });

    const response = await patch({ category: "배달" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: TX_ID, category: "배달", categorySource: "user", kind: "expense",
      summary: { month: "2026-08", totalKrw: 0, byCategory: [] },
    });
    expect(argsOf("merchant_rules:upsert", "upsert")[0]?.[0]).toMatchObject({
      user_id: "user-1", merchant_norm: "쿠팡", category: "배달",
    });
    expect(argsOf("transactions:update", "update")[0]?.[0]).toEqual({
      category: "배달", category_source: "user",
    });
    expect(argsOf("transactions:update", "eq")).toEqual([["id", TX_ID], ["user_id", "user-1"]]);
  });

  it("집계는 queries.ts를 재조회해 갱신합니다", async () => {
    enqueue("transactions:select", txRow());
    enqueue("merchant_rules:upsert", { error: null });
    enqueue("transactions:update", { data: { id: TX_ID }, error: null });
    getMonthlySummary.mockResolvedValue({
      month: "2026-08", totalKrw: 1_000_000, byCategory: [{ category: "식비", amountKrw: 1_000_000, count: 1 }],
    });

    const response = await patch({ category: "식비" });

    expect(getMonthlySummary).toHaveBeenCalledTimes(1);
    expect(getMonthlySummary.mock.calls[0]?.[1]).toBe("user-1");
    expect(getMonthlySummary.mock.calls[0]?.[2]).toBe("2026-08");
    await expect(response.json()).resolves.toMatchObject({ summary: { totalKrw: 1_000_000 } });
  });

  it("규칙 저장이 실패하면 카테고리를 바꾸지 않습니다", async () => {
    enqueue("transactions:select", txRow());
    enqueue("merchant_rules:upsert", { error: { message: "deadlock detected" } });

    const response = await patch({ category: "식비" });

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.not.toContain("deadlock");
    expect(argsOf("transactions:update", "update")).toEqual([]);
  });
});

describe("PATCH /api/transactions/[id] 거래 유형", () => {
  it("유형을 고치면 해시를 다시 계산하고 규칙은 저장하지 않습니다", async () => {
    // 급여가 지출로 잡혔던 행입니다. income으로 고치면 총지출에서 빠집니다.
    enqueue("transactions:select", txRow());
    enqueue("uploads:select", { data: { file_hash: FILE_HASH } });
    enqueue("transactions:update", { data: { id: TX_ID }, error: null });

    const response = await patch({ kind: "income" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ kind: "income", category: null });
    const base = {
      sourceId: SOURCE_ID, occurredOn: "2026-08-25", accountingMonth: "2026-08",
      merchantRaw: "행복은행 급여", merchantNorm: "행복은행급여", amountKrw: 3_000_000,
      kind: "income" as const, sourceTransactionKey: null, dataRowIndex: 4,
      dedupeHash: null, candidateHash: null,
    };
    expect(argsOf("transactions:update", "update")[0]?.[0]).toEqual({
      kind: "income",
      dedupe_hash: computeDedupeHash(base, FILE_HASH),
      candidate_hash: computeCandidateHash(base),
    });
    // 유형은 가맹점 규칙으로 저장하지 않습니다 — 규칙은 카테고리만 담습니다.
    expect(argsOf("merchant_rules:upsert", "upsert")).toEqual([]);
  });

  it("해시 UNIQUE 충돌은 409이며 거래를 지우지 않습니다", async () => {
    enqueue("transactions:select", txRow());
    enqueue("uploads:select", { data: { file_hash: FILE_HASH } });
    enqueue("transactions:update", {
      data: null,
      error: { code: "23505", message: 'duplicate key value violates unique constraint' },
    });

    const response = await patch({ kind: "refund" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "DUPLICATE_TRANSACTION" });
    expect(argsOf("transactions:delete", "delete")).toEqual([]);
  });

  it("유형과 카테고리를 함께 고치면 규칙도 함께 저장합니다", async () => {
    enqueue("transactions:select", txRow({ merchant_raw: "스타벅스", merchant_norm: "스타벅스" }));
    enqueue("uploads:select", { data: { file_hash: FILE_HASH } });
    enqueue("merchant_rules:upsert", { error: null });
    enqueue("transactions:update", { data: { id: TX_ID }, error: null });

    const response = await patch({ kind: "refund", category: "카페/간식" });

    expect(response.status).toBe(200);
    expect(argsOf("transactions:update", "update")[0]?.[0]).toMatchObject({
      kind: "refund", category: "카페/간식", category_source: "user",
    });
    expect(argsOf("merchant_rules:upsert", "upsert")[0]?.[0]).toMatchObject({ category: "카페/간식" });
  });

  it("원본 파일 해시를 찾지 못하면 500이며 거래를 바꾸지 않습니다", async () => {
    enqueue("transactions:select", txRow());
    enqueue("uploads:select", { data: null });

    expect((await patch({ kind: "transfer" })).status).toBe(500);
    expect(argsOf("transactions:update", "update")).toEqual([]);
  });
});
