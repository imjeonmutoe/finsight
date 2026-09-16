// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  columnMappingSchema, errorResponse, jsonResponse, kstMonthStart, nextKstMonthStart, readLimitedBody, requireUserId,
} from "./api";

vi.mock("server-only", () => ({}));

function client(claims: unknown, error: unknown = null) {
  return { auth: { getClaims: vi.fn(async () => ({ data: claims, error })) } };
}

function bodyOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("라우트 공용 응답", () => {
  it("JSON 본문과 상태를 그대로 싣습니다", async () => {
    const response = jsonResponse({ inserted: 3 }, 201);

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ inserted: 3 });
  });

  it("오류는 코드와 한국어 안내를 함께 반환합니다", async () => {
    const response = errorResponse(403, "UPLOAD_LIMIT_REACHED", "이번 달 무료 업로드를 이미 사용했습니다.", {
      resetsAt: "2026-10-01T00:00:00.000Z",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: "UPLOAD_LIMIT_REACHED",
      message: "이번 달 무료 업로드를 이미 사용했습니다.",
      resetsAt: "2026-10-01T00:00:00.000Z",
    });
  });

  it("응답을 캐싱하지 않도록 지시합니다", () => {
    // 금융 데이터 응답이 CDN에 남으면 다른 사용자에게 나갈 수 있습니다.
    expect(jsonResponse({}).headers.get("cache-control")).toBe("no-store");
    expect(errorResponse(400, "BAD_REQUEST", "요청을 확인해 주세요.").headers.get("cache-control")).toBe("no-store");
  });
});

describe("세션 사용자 확인", () => {
  it("검증된 세션의 sub만 사용자 ID로 씁니다", async () => {
    await expect(requireUserId(client({ claims: { sub: "user-1", email: "a@b.c" } }))).resolves.toBe("user-1");
  });

  it("세션이 없거나 오류면 null을 돌려줍니다", async () => {
    await expect(requireUserId(client(null))).resolves.toBeNull();
    await expect(requireUserId(client({ claims: {} }))).resolves.toBeNull();
    await expect(requireUserId(client({ claims: { sub: "user-1" } }, { message: "jwt expired" }))).resolves.toBeNull();
  });

  it("getClaims가 던져도 예외를 흘리지 않습니다", async () => {
    const broken = { auth: { getClaims: vi.fn(async () => { throw new Error("network"); }) } };

    await expect(requireUserId(broken)).resolves.toBeNull();
  });
});

describe("KST 캘린더 월 시작", () => {
  it.each([
    ["2026-09-16T06:17:00.000Z", "2026-08-31T15:00:00.000Z"],
    // KST 9월 1일 00:30은 UTC로는 8월 31일입니다. UTC로 세면 한 달이 어긋납니다.
    ["2026-08-31T15:30:00.000Z", "2026-08-31T15:00:00.000Z"],
    ["2026-08-31T14:30:00.000Z", "2026-07-31T15:00:00.000Z"],
    ["2026-01-01T00:00:00.000Z", "2025-12-31T15:00:00.000Z"],
  ])("%s 시점의 이번 달 시작은 %s입니다", (now, expected) => {
    expect(kstMonthStart(new Date(now))).toBe(expected);
  });

  it.each([
    ["2026-09-16T06:17:00.000Z", "2026-09-30T15:00:00.000Z"],
    // 31일 달과 짧은 달 모두에서 다음 달 1일을 가리켜야 합니다.
    ["2026-01-15T00:00:00.000Z", "2026-01-31T15:00:00.000Z"],
    ["2026-02-15T00:00:00.000Z", "2026-02-28T15:00:00.000Z"],
    // 12월은 해를 넘깁니다.
    ["2026-12-15T00:00:00.000Z", "2026-12-31T15:00:00.000Z"],
  ])("%s 시점의 한도 초기화 시각은 %s입니다", (now, expected) => {
    expect(nextKstMonthStart(new Date(now))).toBe(expected);
  });
});

describe("수신 본문 크기 제한", () => {
  it("Content-Length가 없어도 실제 읽은 bytes로 제한합니다", async () => {
    const request = new Request("http://local/api/uploads", {
      method: "POST", body: bodyOf(["가", "나", "다"]), duplex: "half",
    } as RequestInit);

    // 한글 한 자가 3바이트이므로 9바이트입니다. Content-Length는 붙지 않습니다.
    expect(request.headers.get("content-length")).toBeNull();
    await expect(readLimitedBody(request, 9)).resolves.toEqual(new TextEncoder().encode("가나다"));
    expect(await readLimitedBody(new Request("http://local/api/uploads", {
      method: "POST", body: bodyOf(["가", "나", "다"]), duplex: "half",
    } as RequestInit), 8)).toBeNull();
  });

  it("Content-Length가 상한을 넘으면 본문을 읽지 않고 거절합니다", async () => {
    const request = new Request("http://local/api/uploads", {
      method: "POST", body: "0123456789", headers: { "content-length": "10" },
    });

    await expect(readLimitedBody(request, 4)).resolves.toBeNull();
  });

  it("본문이 없으면 빈 바이트를 돌려줍니다", async () => {
    await expect(readLimitedBody(new Request("http://local/api/uploads", { method: "POST" }), 10))
      .resolves.toEqual(new Uint8Array());
  });
});

describe("컬럼 매핑 스키마", () => {
  it("0 이상 정수 인덱스와 skipRows만 받습니다", () => {
    expect(columnMappingSchema.safeParse({ date: 0, merchant: 1, amount: 2, skipRows: 0 }).success).toBe(true);
    expect(columnMappingSchema.safeParse({
      date: 0, merchant: 1, deposit: 2, withdrawal: 3, krwEquivalent: 4,
      transactionKind: 5, transactionId: 6, billingMonth: 7, skipRows: 1,
    }).success).toBe(true);
  });

  it.each([
    { merchant: 1, amount: 2, skipRows: 0 },
    { date: 0, merchant: 1, skipRows: 0 },
    { date: -1, merchant: 1, amount: 2, skipRows: 0 },
    { date: 0.5, merchant: 1, amount: 2, skipRows: 0 },
    { date: 0, merchant: 1, amount: 2 },
    { date: 0, merchant: 1, amount: 2, skipRows: 0, category: 3 },
  ])("금액 컬럼·필수 인덱스가 빠지거나 모르는 키가 있으면 거절합니다: %o", (mapping) => {
    expect(columnMappingSchema.safeParse(mapping).success).toBe(false);
  });
});
