// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmRequest } from "@/types/api";

type Result = { data?: unknown; error?: unknown; count?: number };
type Call = { key: string; method: string; args: unknown[] };

const { getClaims, from, rpc, download, storageFrom, createServerSupabase, claude } = vi.hoisted(() => {
  const downloadFn = vi.fn();
  const storage = vi.fn(() => ({ download: downloadFn }));
  const claims = vi.fn();
  const fromFn = vi.fn();
  const rpcFn = vi.fn();
  return {
    getClaims: claims, from: fromFn, rpc: rpcFn, download: downloadFn, storageFrom: storage,
    createServerSupabase: vi.fn(() => ({
      auth: { getClaims: claims }, from: fromFn, rpc: rpcFn, storage: { from: storage },
    })),
    claude: {
      inferColumnMapping: vi.fn(), classifyTransactions: vi.fn(), generateInsights: vi.fn(),
    },
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/services/supabase", () => ({ createServerSupabase }));
vi.mock("@/services/claude", () => claude);
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
  for (const method of [...WRITERS, "eq", "in", "neq", "is", "order", "limit", "single", "maybeSingle"]) {
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
const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";
const CSV = "거래일자,가맹점명,이용금액\n2026-08-03,쿠팡,38400\n2026-08-04,스타벅스,4500\n";
const MAPPING = { date: 0, merchant: 1, amount: 2, skipRows: 0 };
const BODY: ConfirmRequest = {
  mapping: MAPPING, encoding: "utf-8", accountingMonth: "2026-08", duplicateDecisions: [],
};

function uploadRow(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: UPLOAD_ID, source_id: SOURCE_ID, file_hash: "file-hash", storage_path: `user-1/${UPLOAD_ID}.csv`,
      status: "mapped", row_count: 3, inserted_count: 0, duplicate_count: 0, unclassified_count: 0,
      ...overrides,
    },
  };
}

async function confirm(body: unknown = BODY, id = UPLOAD_ID): Promise<Response> {
  const { POST } = await import("./route");
  return POST(
    new Request(`http://local/api/uploads/${id}/confirm`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

/** 업로드·출처·원본까지의 응답을 채웁니다. */
function stage(options: { upload?: Result; kind?: string; csv?: string } = {}) {
  enqueue("uploads:select", options.upload ?? uploadRow());
  enqueue("financial_sources:select", { data: { kind: options.kind ?? "card" } });
  download.mockResolvedValue({ data: new Blob([options.csv ?? CSV]), error: null });
}

function rows(): Record<string, unknown>[] {
  return (rpc.mock.calls[0]?.[1] as { p_rows: Record<string, unknown>[] }).p_rows;
}

beforeEach(() => {
  vi.clearAllMocks();
  queues.clear();
  calls.length = 0;
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
  from.mockImplementation(builder);
  rpc.mockResolvedValue({ data: { inserted: 2, duplicates: 0, unclassified: 0 }, error: null });
});

describe("POST /api/uploads/[id]/confirm 검증", () => {
  it("행의 storage_path가 남의 폴더면 404이며 그 경로를 내려받지 않습니다", async () => {
    // storage_path는 클라이언트가 PostgREST로 직접 INSERT할 수 있는 컬럼입니다(0004).
    // Storage 정책 하나에만 기대지 않습니다.
    stage({ upload: uploadRow({ storage_path: `00000000-0000-4000-8000-000000000009/${UPLOAD_ID}.csv` }) });

    const response = await confirm();

    expect(response.status).toBe(404);
    expect(download).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("미인증 요청은 401이며 원본을 읽지 않습니다", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });

    expect((await confirm()).status).toBe(401);
    expect(download).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("남의 업로드는 404이며 user_id 조건을 함께 겁니다", async () => {
    enqueue("uploads:select", { data: null });

    expect((await confirm()).status).toBe(404);
    expect(argsOf("uploads:select", "eq")).toEqual([["id", UPLOAD_ID], ["user_id", "user-1"]]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { mapping: MAPPING, encoding: "cp949", duplicateDecisions: [] },
    { mapping: { date: 0, merchant: 1, skipRows: 0 }, encoding: "utf-8", duplicateDecisions: [] },
    { mapping: MAPPING, encoding: "utf-8" },
    { mapping: MAPPING, encoding: "utf-8", accountingMonth: "2026-13", duplicateDecisions: [] },
    {
      mapping: MAPPING, encoding: "utf-8", duplicateDecisions: [{ dataRowIndex: 0, action: "merge" }],
    },
    {
      mapping: MAPPING, encoding: "utf-8", duplicateDecisions: [{ dataRowIndex: 0, action: "duplicate" }],
    },
  ])("잘못된 요청은 400이며 원본을 읽지 않습니다: %o", async (body) => {
    expect((await confirm(body)).status).toBe(400);
    expect(download).not.toHaveBeenCalled();
  });

  it("출처·파일 해시·경로는 DB에서 읽고 요청으로 바꿀 수 없습니다", async () => {
    stage();
    enqueue("transactions:select", { data: [] });
    enqueue("merchant_rules:select", { data: [] });

    await confirm({ ...BODY, sourceId: OTHER_ID, fileHash: "위조", storagePath: "user-2/남의파일.csv" });

    expect(download).toHaveBeenCalledWith(`user-1/${UPLOAD_ID}.csv`);
    expect(storageFrom).toHaveBeenCalledWith("statements");
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args.p_import_context).toEqual({
      sourceId: SOURCE_ID, sourceKind: "card", fileHash: "file-hash", accountingMonth: "2026-08",
    });
  });

  it("parsed 재승인은 저장된 결과를 돌려주고 승인 트랜잭션을 실행하지 않습니다", async () => {
    enqueue("uploads:select", uploadRow({
      status: "parsed", inserted_count: 34, duplicate_count: 2, unclassified_count: 5,
    }));

    const response = await confirm();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ inserted: 34, duplicates: 2, unclassified: 5 });
    expect(rpc).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("추론이 실패한 업로드도 수동 매핑으로 승인할 수 있습니다", async () => {
    // 매핑 추론 실패는 failed로 기록된다. 사용자가 직접 컬럼을 고른 뒤 승인하는 경로가
    // 막히면, 화면이 안내하는 "직접 선택"을 실제로는 할 수 없다.
    stage({ upload: uploadRow({ status: "failed" }) });

    const response = await confirm();

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalled();
  });

  it("승인 전에 failed를 mapped로 되돌립니다", async () => {
    // confirm_upload는 status가 'mapped'가 아니면 UPLOAD_NOT_MAPPED로 거절한다.
    // 라우트만 failed를 통과시키면 화면은 진행되는데 저장에서 조용히 막힌다.
    stage({ upload: uploadRow({ status: "failed" }) });

    expect((await confirm()).status).toBe(200);
    const updated = argsOf("uploads:update", "update")[0]?.[0] as Record<string, unknown>;
    expect(updated).toMatchObject({ status: "mapped" });
    expect(argsOf("uploads:update", "eq")).toEqual([["id", UPLOAD_ID], ["user_id", "user-1"]]);
  });

  it("이미 mapped면 상태를 다시 쓰지 않습니다", async () => {
    stage();

    expect((await confirm()).status).toBe(200);
    expect(argsOf("uploads:update", "update")).toEqual([]);
  });

  it("아직 매핑되지 않은 업로드는 409입니다", async () => {
    enqueue("uploads:select", uploadRow({ status: "pending" }));

    expect((await confirm()).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("카드 청구월을 어디에서도 얻을 수 없으면 400으로 사용자 입력을 요구합니다", async () => {
    stage();

    const response = await confirm({ ...BODY, accountingMonth: undefined });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "ACCOUNTING_MONTH_REQUIRED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("은행 거래내역은 청구월 없이 거래월로 승인합니다", async () => {
    stage({ kind: "bank" });
    enqueue("transactions:select", { data: [] });
    enqueue("merchant_rules:select", { data: [] });

    const response = await confirm({ ...BODY, accountingMonth: undefined });

    expect(response.status).toBe(200);
    expect(rows().map((row) => row.accountingMonth)).toEqual(["2026-08", "2026-08"]);
  });

  // 청구월 컬럼이 있으면 화면은 accountingMonth를 아예 싣지 않습니다. 이 조합이 막히면
  // 청구월이 있는 카드 명세서는 확정 자체가 안 됩니다(`MappingReview`가 ""를 보내던 회귀).
  it("청구월 컬럼이 있으면 청구월 입력 없이도 승인하고 행별 값을 씁니다", async () => {
    stage({ csv: "거래일자,가맹점명,이용금액,청구월\n2026-08-03,쿠팡,38400,2026-09\n2026-08-04,스타벅스,4500,2026-10\n" });
    enqueue("transactions:select", { data: [] });
    enqueue("merchant_rules:select", { data: [] });

    const response = await confirm({
      ...BODY,
      mapping: { date: 0, merchant: 1, amount: 2, billingMonth: 3, skipRows: 0 },
      accountingMonth: undefined,
    });

    expect(response.status).toBe(200);
    expect(rows().map((row) => row.accountingMonth)).toEqual(["2026-09", "2026-10"]);
  });

  it("파싱 오류는 행 번호만 담은 400으로 돌려줍니다", async () => {
    stage({ csv: "거래일자,가맹점명,이용금액\n2026-99-99,쿠팡,38400\n" });

    const response = await confirm();
    const body = await response.json() as { message: string };

    expect(response.status).toBe(400);
    expect(body.message).toContain("2행");
    expect(body.message).not.toContain("쿠팡");
    expect(body.message).not.toContain("38400");
  });

  it("원본을 읽지 못하면 500이며 거래를 넣지 않습니다", async () => {
    stage();
    download.mockResolvedValue({ data: null, error: { message: "object not found" } });

    const response = await confirm();

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.not.toContain("object not found");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/uploads/[id]/confirm 중복 후보", () => {
  it("다른 업로드의 겹치는 후보는 결정 전에 409로 되돌리고 insert하지 않습니다", async () => {
    stage();
    enqueue("transactions:select", {
      data: [{ id: OTHER_ID, candidate_hash: "candidate-0", upload_id: "another-upload" }],
    });
    const candidateHash = (await import("@/lib/dedupe")).computeCandidateHash({
      sourceId: SOURCE_ID, occurredOn: "2026-08-03", accountingMonth: "2026-08",
      merchantRaw: "쿠팡", merchantNorm: "쿠팡", amountKrw: 38_400, kind: "expense",
      sourceTransactionKey: null, dataRowIndex: 0, dedupeHash: null, candidateHash: null,
    });
    queues.set("transactions:select", [{
      data: [{ id: OTHER_ID, candidate_hash: candidateHash, upload_id: "another-upload" }],
    }]);

    const response = await confirm();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "IMPORT_REVIEW_REQUIRED",
      duplicateCandidates: [{ dataRowIndex: 0, transactionIds: [OTHER_ID] }],
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("후보 조회는 같은 출처의 다른 업로드만 봅니다", async () => {
    // 다른 카드의 동일 날짜·가맹점·금액은 후보가 아니며, 같은 파일 내 행도 아닙니다.
    stage();
    enqueue("transactions:select", { data: [] });
    enqueue("merchant_rules:select", { data: [] });

    await confirm();

    expect(argsOf("transactions:select", "eq")).toEqual([["user_id", "user-1"], ["source_id", SOURCE_ID]]);
    expect(argsOf("transactions:select", "neq")).toEqual([["upload_id", UPLOAD_ID]]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("후보가 아닌 행이나 남의 거래를 가리키는 결정을 거절합니다", async () => {
    for (const decision of [
      { dataRowIndex: 1, action: "duplicate", transactionId: OTHER_ID },
      { dataRowIndex: 0, action: "duplicate", transactionId: "44444444-4444-4444-8444-444444444444" },
      { dataRowIndex: 9, action: "keep" },
    ] as const) {
      queues.clear();
      calls.length = 0;
      vi.clearAllMocks();
      rpc.mockResolvedValue({ data: { inserted: 0, duplicates: 0, unclassified: 0 }, error: null });
      stage();
      const { computeCandidateHash } = await import("@/lib/dedupe");
      const candidateHash = computeCandidateHash({
        sourceId: SOURCE_ID, occurredOn: "2026-08-03", accountingMonth: "2026-08",
        merchantRaw: "쿠팡", merchantNorm: "쿠팡", amountKrw: 38_400, kind: "expense",
        sourceTransactionKey: null, dataRowIndex: 0, dedupeHash: null, candidateHash: null,
      });
      enqueue("transactions:select", {
        data: [{ id: OTHER_ID, candidate_hash: candidateHash, upload_id: "another-upload" }],
      });

      const response = await confirm({ ...BODY, duplicateDecisions: [decision] });

      expect(response.status).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it("한 기존 거래를 여러 행에 대응시키는 결정을 거절합니다", async () => {
    stage({ csv: "거래일자,가맹점명,이용금액\n2026-08-03,쿠팡,38400\n2026-08-03,쿠팡,38400\n" });
    const { computeCandidateHash } = await import("@/lib/dedupe");
    const candidateHash = computeCandidateHash({
      sourceId: SOURCE_ID, occurredOn: "2026-08-03", accountingMonth: "2026-08",
      merchantRaw: "쿠팡", merchantNorm: "쿠팡", amountKrw: 38_400, kind: "expense",
      sourceTransactionKey: null, dataRowIndex: 0, dedupeHash: null, candidateHash: null,
    });
    enqueue("transactions:select", {
      data: [{ id: OTHER_ID, candidate_hash: candidateHash, upload_id: "another-upload" }],
    });

    const response = await confirm({
      ...BODY,
      duplicateDecisions: [
        { dataRowIndex: 0, action: "duplicate", transactionId: OTHER_ID },
        { dataRowIndex: 1, action: "duplicate", transactionId: OTHER_ID },
      ],
    });

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("승인 트랜잭션이 새 후보를 발견하면 409로 되돌립니다", async () => {
    stage();
    enqueue("transactions:select", { data: [] });
    enqueue("merchant_rules:select", { data: [] });
    rpc.mockResolvedValue({
      data: { review: [{ dataRowIndex: 1, transactionIds: [OTHER_ID] }] }, error: null,
    });

    const response = await confirm();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "IMPORT_REVIEW_REQUIRED",
      duplicateCandidates: [{ dataRowIndex: 1, transactionIds: [OTHER_ID] }],
    });
  });
});

describe("POST /api/uploads/[id]/confirm 즉시 분류", () => {
  it("사용자 규칙을 먼저, 내장 사전을 그다음에 적용하며 모델을 호출하지 않습니다", async () => {
    stage();
    enqueue("transactions:select", { data: [] });
    // 내장 사전은 쿠팡을 쇼핑으로 잡지만 사용자 규칙이 이깁니다.
    enqueue("merchant_rules:select", { data: [{ merchant_norm: "쿠팡", category: "배달" }] });

    const response = await confirm();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ inserted: 2, duplicates: 0, unclassified: 0 });
    expect(rows().map((row) => [row.merchantNorm, row.category, row.categorySource])).toEqual([
      ["쿠팡", "배달", "user"],
      ["스타벅스", "카페/간식", "rule"],
    ]);
    expect(claude.classifyTransactions).not.toHaveBeenCalled();
    expect(claude.inferColumnMapping).not.toHaveBeenCalled();
  });

  it("규칙이 못 잡은 가맹점은 미분류로 남겨 분류 단계로 넘깁니다", async () => {
    stage({ csv: "거래일자,가맹점명,이용금액\n2026-08-03,동네철물점,12000\n" });
    enqueue("transactions:select", { data: [] });
    enqueue("merchant_rules:select", { data: [] });

    await confirm();

    expect(rows()[0]).toMatchObject({ category: null, categorySource: null });
    expect(claude.classifyTransactions).not.toHaveBeenCalled();
  });

  it("승인 트랜잭션이 실패하면 500이며 모델 호출이 0회입니다", async () => {
    stage();
    enqueue("transactions:select", { data: [] });
    enqueue("merchant_rules:select", { data: [] });
    rpc.mockResolvedValue({ data: null, error: { message: 'relation "transactions" violates' } });

    const response = await confirm();

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.not.toContain("transactions");
    expect(claude.classifyTransactions).not.toHaveBeenCalled();
  });

  it("승인 payload에 원본 파일명이나 세션 사용자 ID를 담지 않습니다", async () => {
    stage();
    enqueue("transactions:select", { data: [] });
    enqueue("merchant_rules:select", { data: [] });

    await confirm();

    const args = JSON.stringify(rpc.mock.calls[0]?.[1]);
    expect(args).not.toContain("user-1");
    expect(rpc.mock.calls[0]?.[0]).toBe("confirm_upload");
    expect(rows()[0]).toMatchObject({
      dataRowIndex: 0, occurredOn: "2026-08-03", amountKrw: 38_400, kind: "expense",
      sourceTransactionKey: null,
    });
    expect(rows()[0]?.dedupeHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
