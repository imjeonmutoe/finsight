// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_CSV_ROWS, MAX_FILE_BYTES, MAX_MULTIPART_BODY_BYTES } from "@/lib/limits";

type Result = { data?: unknown; error?: unknown; count?: number };
type Call = { key: string; method: string; args: unknown[] };

const { getClaims, from, storageFrom, upload, remove, createServerSupabase, inferColumnMapping } = vi.hoisted(() => {
  const uploadFn = vi.fn();
  const removeFn = vi.fn();
  const storage = vi.fn(() => ({ upload: uploadFn, remove: removeFn }));
  const claims = vi.fn();
  const fromFn = vi.fn();
  return {
    getClaims: claims, from: fromFn, storageFrom: storage, upload: uploadFn, remove: removeFn,
    createServerSupabase: vi.fn(() => ({ auth: { getClaims: claims }, from: fromFn, storage: { from: storage } })),
    inferColumnMapping: vi.fn(),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/services/supabase", () => ({ createServerSupabase }));
vi.mock("@/services/claude", () => ({ inferColumnMapping }));
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
  for (const method of [...WRITERS, "eq", "neq", "in", "gte", "order", "limit", "single", "maybeSingle"]) {
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

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const UPLOAD_ID = "22222222-2222-4222-8222-222222222222";
const CSV = "거래일자,가맹점명,이용금액\n2026-08-03,쿠팡,38400\n2026-08-04,스타벅스,4500\n";
const MAPPING = { date: 0, merchant: 1, amount: 2, skipRows: 0 };

async function multipart(
  parts: { sourceId?: string; file?: File | string }, options: { stream?: boolean } = {},
): Promise<Request> {
  const form = new FormData();
  if (parts.sourceId !== undefined) form.set("sourceId", parts.sourceId);
  if (typeof parts.file === "string") form.set("file", parts.file);
  else if (parts.file) form.set("file", parts.file);
  const base = new Request("http://local/api/uploads", { method: "POST", body: form });
  const contentType = base.headers.get("content-type") ?? "";
  const bytes = new Uint8Array(await base.arrayBuffer());
  if (options.stream) {
    return new Request("http://local/api/uploads", {
      method: "POST", headers: { "content-type": contentType }, duplex: "half",
      body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
    } as RequestInit);
  }
  return new Request("http://local/api/uploads", {
    method: "POST",
    headers: { "content-type": contentType, "content-length": String(bytes.byteLength) },
    body: bytes,
  });
}

function csvFile(content: string | Uint8Array = CSV, name = "8월 명세서.csv", type = "text/csv"): File {
  return new File([content as BlobPart], name, { type });
}

async function post(request: Request): Promise<Response> {
  const { POST } = await import("./route");
  return POST(request);
}

/** 출처 확인 → 기존 업로드 조회까지의 기본 응답을 채웁니다. */
function happyPath(options: { existing?: Result; plan?: string; monthCount?: number } = {}) {
  enqueue("financial_sources:select", { data: { id: SOURCE_ID, kind: "card" } });
  enqueue("uploads:select", options.existing ?? { data: null });
  enqueue("uploads:insert", { data: { id: UPLOAD_ID } });
  upload.mockResolvedValue({ error: null });
  enqueue("uploads:select", { data: { status: "pending", column_mapping: null, mapping_confidence: null } });
  enqueue("profiles:select", { data: { plan: options.plan ?? "pro", plan_expires_at: null } });
  enqueue("uploads:select", { count: options.monthCount ?? 0 });
  enqueue("uploads:update", { data: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  queues.clear();
  calls.length = 0;
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
  from.mockImplementation(builder);
  inferColumnMapping.mockResolvedValue({ mapping: MAPPING, confidence: 0.94 });
});
afterEach(() => vi.useRealTimers());

describe("POST /api/uploads 입력 검증", () => {
  it("미인증 요청은 401이며 모델을 호출하지 않습니다", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile() }));

    expect(response.status).toBe(401);
    expect(inferColumnMapping).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("파일 4,000,000 bytes는 통과하고 한 바이트 초과는 413입니다", async () => {
    // 한글은 UTF-8에서 3바이트이므로 경계는 ASCII로만 맞춥니다.
    const exact = "date,merchant,amount\n2026-08-03,shop,38400\n".padEnd(MAX_FILE_BYTES, "a");
    expect(new TextEncoder().encode(exact).byteLength).toBe(MAX_FILE_BYTES);
    happyPath();

    const boundary = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(exact) }));
    expect(boundary.status).toBe(200);

    const over = await post(await multipart({
      sourceId: SOURCE_ID, file: csvFile("a".repeat(MAX_FILE_BYTES + 1)),
    }));
    expect(over.status).toBe(413);
    await expect(over.json()).resolves.toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("Content-Length 없이 스트리밍해도 실제 bytes로 본문 상한을 지킵니다", async () => {
    const request = await multipart({
      sourceId: SOURCE_ID, file: csvFile("a".repeat(MAX_MULTIPART_BODY_BYTES)),
    }, { stream: true });
    expect(request.headers.get("content-length")).toBeNull();

    const response = await post(request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ code: "BODY_TOO_LARGE" });
    expect(upload).not.toHaveBeenCalled();
    expect(inferColumnMapping).not.toHaveBeenCalled();
  });

  it("행수 10,000은 통과하고 초과는 413입니다", async () => {
    const rows = (count: number) => `거래일자,가맹점명,이용금액\n${
      Array.from({ length: count }, (_, index) => `2026-08-03,가맹점,${index + 1}`).join("\n")}\n`;
    happyPath();

    const boundary = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(rows(MAX_CSV_ROWS - 1)) }));
    expect(boundary.status).toBe(200);

    enqueue("financial_sources:select", { data: { id: SOURCE_ID, kind: "card" } });
    const over = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(rows(MAX_CSV_ROWS)) }));
    expect(over.status).toBe(413);
    await expect(over.json()).resolves.toMatchObject({ code: "TOO_MANY_ROWS" });
  });

  it.each([
    ["명세서.txt", "text/csv"],
    ["명세서.csv.png", "image/png"],
    ["명세서.csv", "application/pdf"],
  ])("CSV가 아닌 %s(%s)는 400입니다", async (name, type) => {
    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(CSV, name, type) }));

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("파일이나 출처가 없으면 400입니다", async () => {
    expect((await post(await multipart({ sourceId: SOURCE_ID }))).status).toBe(400);
    expect((await post(await multipart({ file: csvFile() }))).status).toBe(400);
    expect((await post(await multipart({ sourceId: "출처", file: csvFile() }))).status).toBe(400);
    expect((await post(await multipart({ sourceId: SOURCE_ID, file: "파일이-아닌-문자열" }))).status).toBe(400);
  });

  it("남의 출처를 지정하면 404이며 저장하지 않습니다", async () => {
    enqueue("financial_sources:select", { data: null });

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile() }));

    expect(response.status).toBe(404);
    expect(argsOf("financial_sources:select", "eq")).toEqual([["user_id", "user-1"], ["id", SOURCE_ID]]);
    expect(upload).not.toHaveBeenCalled();
  });

  it("CSV로 읽을 수 없는 내용은 400이며 모델을 호출하지 않습니다", async () => {
    enqueue("financial_sources:select", { data: { id: SOURCE_ID, kind: "card" } });

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile("<html><body>로그인</body></html>") }));

    expect(response.status).toBe(400);
    expect(inferColumnMapping).not.toHaveBeenCalled();
  });

  it("HTML 표로 된 명세서를 그대로 읽습니다", async () => {
    // 카드사 '엑셀 내려받기'는 HTML 표를 내려줍니다. 사용자에게 스프레드시트로 열어
    // CSV로 내보내라고 시키지 않습니다. 앞에 빈 행이 붙어 `<`로 시작하지도 않습니다.
    happyPath();
    const html = ",,\n,,\n<html><head><style>td{color:red}</style></head><body><table>"
      + "<tr><th>이용일</th><th>이용가맹점</th><th>이용금액</th></tr>"
      + "<tr><td>2026.08.03</td><td>가게, 본점</td><td>38,400</td></tr>"
      + "</table></body></html>";

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(html) }));

    expect(response.status).toBe(200);
    const body = await response.json() as { preview: string[][] };
    expect(body.preview[0]).toEqual(["이용일", "이용가맹점", "이용금액"]);
    // 칸 경계가 태그라 쉼표가 든 값이 쪼개지지 않습니다.
    expect(body.preview[1]).toEqual(["2026.08.03", "가게, 본점", "38,400"]);
    expect(inferColumnMapping).toHaveBeenCalled();
  });

  it("미리보기와 함께 파일 전체 행 수를 알려줍니다", async () => {
    // 미리보기는 5행까지만 보여줍니다. 나머지가 버려진 게 아님을 화면이 말할 수 있어야 합니다.
    happyPath();
    const csv = ["거래일자,가맹점명,금액",
      ...Array.from({ length: 8 }, (_, index) => `2026-08-0${index + 1},카페,5000`)].join("\n");

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(csv) }));

    expect(response.status).toBe(200);
    const body = await response.json() as { preview: string[][]; totalRows: number };
    expect(body.preview).toHaveLength(5);
    expect(body.totalRows).toBe(9);
  });

  it("카드사가 내려주는 .xls 확장자도 받습니다", async () => {
    // 내려받은 파일 이름이 .xls입니다. 이름을 바꿔 오라고 시키면 HTML을 읽는 의미가 없습니다.
    happyPath();
    const html = "<table><tr><th>이용일</th><th>가맹점</th><th>금액</th></tr>"
      + "<tr><td>2026.08.03</td><td>쿠팡</td><td>38400</td></tr></table>";

    const response = await post(await multipart({
      sourceId: SOURCE_ID, file: csvFile(html, "명세서.xls", "application/vnd.ms-excel"),
    }));

    expect(response.status).toBe(200);
  });
});

describe("POST /api/uploads 저장과 매핑", () => {
  it("Storage 경로를 서버가 조합하고 원본 파일명은 컬럼에만 남깁니다", async () => {
    happyPath();

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(CSV, "8월 명세서.csv") }));

    expect(response.status).toBe(200);
    const inserted = argsOf("uploads:insert", "insert")[0]?.[0] as Record<string, unknown>;
    expect(inserted.filename).toBe("8월 명세서.csv");
    expect(inserted.user_id).toBe("user-1");
    expect(inserted.status).toBe("pending");
    expect(inserted.storage_path).toMatch(
      /^user-1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.csv$/,
    );
    expect(storageFrom).toHaveBeenCalledWith("statements");
    const [path] = upload.mock.calls[0] ?? [];
    expect(path).toBe(inserted.storage_path);
    expect(path).not.toContain("명세서");
    expect(path).not.toContain(UPLOAD_ID);
  });

  it("매핑 입력에 원본 헤더·셀 값·식별자를 넣지 않습니다", async () => {
    happyPath();

    await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(CSV) }));

    expect(inferColumnMapping).toHaveBeenCalledTimes(1);
    const payload = JSON.stringify(inferColumnMapping.mock.calls[0]?.[0]);
    for (const secret of ["거래일자", "가맹점명", "이용금액", "쿠팡", "스타벅스", "38400", SOURCE_ID, "user-1", "명세서"]) {
      expect(payload).not.toContain(secret);
    }
    expect(JSON.parse(payload)).toEqual({
      headerRowIndex: 0,
      columns: [
        { index: 0, label: "date", valueTypes: ["date"] },
        { index: 1, label: "merchant", valueTypes: ["text"] },
        { index: 2, label: "amount", valueTypes: ["number"] },
      ],
    });
  });

  it("추론한 매핑과 미리보기 첫 5행을 저장하고 돌려줍니다", async () => {
    happyPath();

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(CSV) }));

    await expect(response.json()).resolves.toEqual({
      uploadId: UPLOAD_ID, sourceId: SOURCE_ID, status: "mapped", reused: false,
      mapping: MAPPING, confidence: 0.94,
      preview: [["거래일자", "가맹점명", "이용금액"], ["2026-08-03", "쿠팡", "38400"], ["2026-08-04", "스타벅스", "4500"]],
      totalRows: 3, headerRowIndex: 0,
    });
    const updated = argsOf("uploads:update", "update")[0]?.[0] as Record<string, unknown>;
    expect(updated).toMatchObject({ status: "mapped", column_mapping: MAPPING, mapping_confidence: 0.94 });
  });

  it("EUC-KR 원본의 가맹점명을 한글로 미리보기합니다", async () => {
    // 인코딩 오판을 사용자가 육안으로 발견할 수 있어야 합니다.
    happyPath();
    const euckr = Uint8Array.from([
      0xb0, 0xc5, 0xb7, 0xa1, 0xc0, 0xcf, 0x2c, 0xb0, 0xa1, 0xb8, 0xcd, 0xc1, 0xa1, 0x2c, 0xb1, 0xdd, 0xbe, 0xd7, 0x0a,
      0x32, 0x30, 0x32, 0x36, 0x2d, 0x30, 0x38, 0x2d, 0x30, 0x33, 0x2c, 0xc4, 0xed, 0xc6, 0xce, 0x2c, 0x33, 0x38, 0x34, 0x30, 0x30, 0x0a,
    ]);

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(euckr) }));
    const body = await response.json() as { preview: string[][] };

    expect(body.preview[0]).toEqual(["거래일", "가맹점", "금액"]);
    expect(body.preview[1]).toEqual(["2026-08-03", "쿠팡", "38400"]);
    const inserted = argsOf("uploads:insert", "insert")[0]?.[0] as Record<string, unknown>;
    expect(inserted.encoding).toBe("euc-kr");
  });

  it("같은 출처의 동일 파일 재업로드는 기존 업로드를 반환하며 모델·Storage를 건드리지 않습니다", async () => {
    enqueue("financial_sources:select", { data: { id: SOURCE_ID, kind: "card" } });
    enqueue("uploads:select", {
      data: {
        id: UPLOAD_ID, status: "mapped", storage_path: `user-1/${UPLOAD_ID}.csv`,
        column_mapping: MAPPING, mapping_confidence: 0.94, encoding: "utf-8",
        created_at: "2026-08-05T00:00:00.000Z",
      },
    });

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(CSV) }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ uploadId: UPLOAD_ID, reused: true, status: "mapped" });
    expect(inferColumnMapping).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(argsOf("uploads:insert", "insert")).toEqual([]);
  });

  it("동시 업로드가 UNIQUE에 부딪히면 기존 행을 재조회해 하나의 업로드만 남깁니다", async () => {
    enqueue("financial_sources:select", { data: { id: SOURCE_ID, kind: "card" } });
    enqueue("uploads:select", { data: null });
    enqueue("uploads:insert", { error: { code: "23505" } });
    enqueue("uploads:select", {
      data: {
        id: UPLOAD_ID, status: "mapped", storage_path: `user-1/${UPLOAD_ID}.csv`,
        column_mapping: MAPPING, mapping_confidence: 0.9, encoding: "utf-8",
        created_at: "2026-08-05T00:00:00.000Z",
      },
    });

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(CSV) }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ uploadId: UPLOAD_ID, reused: true });
    expect(inferColumnMapping).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("처리 중인 pending은 409와 재시도 시각을 돌려줍니다", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-08-05T00:01:00.000Z"));
    enqueue("financial_sources:select", { data: { id: SOURCE_ID, kind: "card" } });
    enqueue("uploads:select", {
      data: {
        id: UPLOAD_ID, status: "pending", storage_path: `user-1/${UPLOAD_ID}.csv`,
        column_mapping: null, mapping_confidence: null, encoding: "utf-8",
        created_at: "2026-08-05T00:00:00.000Z",
      },
    });

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(CSV) }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "UPLOAD_IN_PROGRESS", retryAt: "2026-08-05T00:05:00.000Z",
    });
    expect(inferColumnMapping).not.toHaveBeenCalled();
  });

  it("300초를 넘긴 pending과 failed는 같은 행·파일을 재사용해 재개합니다", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-08-05T00:06:00.000Z"));
    for (const status of ["pending", "failed"]) {
      queues.clear();
      calls.length = 0;
      vi.clearAllMocks();
      inferColumnMapping.mockResolvedValue({ mapping: MAPPING, confidence: 0.94 });
      enqueue("financial_sources:select", { data: { id: SOURCE_ID, kind: "card" } });
      enqueue("uploads:select", {
        data: {
          id: UPLOAD_ID, status, storage_path: `user-1/${UPLOAD_ID}.csv`,
          column_mapping: null, mapping_confidence: null, encoding: "utf-8",
          created_at: "2026-08-05T00:00:00.000Z",
        },
      });
      enqueue("uploads:update", { data: null });
      upload.mockResolvedValue({ error: null });
      enqueue("uploads:select", { data: { status: "pending", column_mapping: null, mapping_confidence: null } });
      enqueue("profiles:select", { data: { plan: "pro", plan_expires_at: null } });
      enqueue("uploads:update", { data: null });

      const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(CSV) }));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ uploadId: UPLOAD_ID, reused: false, status: "mapped" });
      expect(argsOf("uploads:insert", "insert")).toEqual([]);
      expect(upload.mock.calls[0]?.[0]).toBe(`user-1/${UPLOAD_ID}.csv`);
    }
  });

  it("매핑 추론이 실패하면 failed로 기록하고 파일 경로를 남깁니다", async () => {
    happyPath();
    inferColumnMapping.mockRejectedValue(new Error("분석 요청을 처리하지 못했습니다."));

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(CSV) }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: "MAPPING_FAILED" });
    const updated = argsOf("uploads:update", "update")[0]?.[0] as Record<string, unknown>;
    expect(updated.status).toBe("failed");
    expect(updated.error_message).toContain("횟수를 소비하지 않았습니다");
    expect(updated.error_message).not.toContain("쿠팡");
    expect(remove).not.toHaveBeenCalled();
  });

  it("매핑 추론이 실패해도 수동 매핑에 필요한 것을 함께 돌려줍니다", async () => {
    // 화면이 "매핑 확인에서 직접 고르라"고 안내하므로 그 화면을 열 재료를 줘야 한다.
    // uploadId·preview가 없으면 사용자는 안내받은 일을 할 수 없다.
    happyPath();
    inferColumnMapping.mockRejectedValue(new Error("분석 요청을 처리하지 못했습니다."));

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(CSV) }));

    expect(response.status).toBe(502);
    const body = await response.json() as Record<string, unknown>;
    expect(body.code).toBe("MAPPING_FAILED");
    expect(body.uploadId).toBe(UPLOAD_ID);
    expect(body.sourceId).toBe(SOURCE_ID);
    expect(body.mapping).toBeNull();
    expect(body.preview).toEqual([
      ["거래일자", "가맹점명", "이용금액"], ["2026-08-03", "쿠팡", "38400"], ["2026-08-04", "스타벅스", "4500"],
    ]);
  });

  it("추론이 실패하면 찾아둔 헤더 행 위치도 함께 돌려줍니다", async () => {
    // 상단 요약행이 있는 명세서에서, 수동 매핑 화면이 제목 행을 컬럼 이름으로 쓰면 안 된다.
    // 서버는 이미 헤더 행을 찾아놨다. 그 값을 안 주면 화면이 0행으로 되돌아간다.
    happyPath();
    inferColumnMapping.mockRejectedValue(new Error("분석 요청을 처리하지 못했습니다."));
    const csv = ["2026년 10월 이용대금명세서(예정),,", "결제예정 상세내역,,",
      "거래일자,가맹점명,이용금액", "2026-08-03,쿠팡,38400"].join("\n");

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(csv) }));

    expect(response.status).toBe(502);
    const body = await response.json() as Record<string, unknown>;
    expect(body.code).toBe("MAPPING_FAILED");
    expect(body.headerRowIndex).toBe(2);
  });

  it("Storage 저장이 실패하면 failed로 기록하고 모델을 호출하지 않습니다", async () => {
    happyPath();
    upload.mockResolvedValue({ error: { message: "storage down" } });

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(CSV) }));

    expect(response.status).toBe(500);
    expect(inferColumnMapping).not.toHaveBeenCalled();
    expect((argsOf("uploads:update", "update")[0]?.[0] as Record<string, unknown>).status).toBe("failed");
  });

  it("경쟁 요청이 이미 매핑을 만들어 두면 그 결과를 재사용합니다", async () => {
    enqueue("financial_sources:select", { data: { id: SOURCE_ID, kind: "card" } });
    enqueue("uploads:select", { data: null });
    enqueue("uploads:insert", { data: { id: UPLOAD_ID } });
    upload.mockResolvedValue({ error: null });
    enqueue("uploads:select", { data: { status: "mapped", column_mapping: MAPPING, mapping_confidence: 0.8 } });

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(CSV) }));

    await expect(response.json()).resolves.toMatchObject({ reused: true, confidence: 0.8 });
    expect(inferColumnMapping).not.toHaveBeenCalled();
  });
});

describe("POST /api/uploads Free 업로드 한도", () => {
  it("한도 도달 시 403·초기화 시각과 함께 pending 행과 파일을 정리합니다", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-16T06:17:00.000Z"));
    happyPath({ plan: "free", monthCount: 1 });
    enqueue("uploads:delete", { data: null });

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(CSV) }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: "UPLOAD_LIMIT_REACHED",
      message: "이번 달 무료 업로드를 이미 사용했습니다. 다음 달 1일에 초기화됩니다.",
      resetsAt: "2026-09-30T15:00:00.000Z",
    });
    expect(inferColumnMapping).not.toHaveBeenCalled();
    // 지우는 대상은 방금 올린 서버 생성 경로와 같아야 합니다.
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0]?.[0]]);
    expect(upload.mock.calls[0]?.[0]).toMatch(/^user-1\/[0-9a-f-]{36}\.csv$/);
    expect(argsOf("uploads:delete", "eq")).toEqual([["id", UPLOAD_ID], ["user_id", "user-1"]]);
  });

  it("한도는 KST 캘린더 월에 만든 업로드를 상태와 관계없이 세고 지금 행은 뺍니다", async () => {
    // status로 거르면 추론을 일부러 실패시킨 업로드(failed)가 세어지지 않아, 그런 파일을 여러 개
    // 쌓아 두고 하나씩 confirm하는 것으로 한도가 무력화됩니다. status는 클라이언트가 바꿀 수도 있습니다.
    vi.useFakeTimers().setSystemTime(new Date("2026-09-16T06:17:00.000Z"));
    happyPath({ plan: "free", monthCount: 0 });

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(CSV) }));

    expect(response.status).toBe(200);
    expect(argsOf("uploads:select", "in")).toEqual([]);
    expect(argsOf("uploads:select", "neq")).toEqual([["id", UPLOAD_ID]]);
    expect(argsOf("uploads:select", "gte")).toEqual([["created_at", "2026-08-31T15:00:00.000Z"]]);
  });

  it("같은 달의 실패한 업로드도 한도에 들어갑니다", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-16T06:17:00.000Z"));
    // 카운트 쿼리가 failed 행 하나를 찾았다고 돌려줍니다.
    happyPath({ plan: "free", monthCount: 1 });
    enqueue("uploads:delete", { data: null });

    const response = await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(CSV) }));

    expect(response.status).toBe(403);
    expect(inferColumnMapping).not.toHaveBeenCalled();
  });

  it("Pro는 한도를 세지 않습니다", async () => {
    happyPath({ plan: "pro" });

    expect((await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(CSV) }))).status).toBe(200);
    expect(argsOf("uploads:select", "in")).toEqual([]);
  });

  it("만료된 Pro는 Free 한도를 적용합니다", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-16T06:17:00.000Z"));
    happyPath({ plan: "pro", monthCount: 1 });
    queues.set("profiles:select", [{ data: { plan: "pro", plan_expires_at: "2026-08-01T00:00:00.000Z" } }]);
    enqueue("uploads:delete", { data: null });

    expect((await post(await multipart({ sourceId: SOURCE_ID, file: csvFile(CSV) }))).status).toBe(403);
    expect(inferColumnMapping).not.toHaveBeenCalled();
  });
});
