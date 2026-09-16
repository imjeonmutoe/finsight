import "server-only";

import { z } from "zod";

// 라우트 핸들러가 공유하는 응답·세션·본문 유틸입니다. Supabase 클라이언트는 queries.ts와 같은
// 규약으로 호출자가 주입하며 이 모듈에서 생성하지 않습니다.

type ClaimsClient = {
  auth: { getClaims(): PromiseLike<{ data: unknown; error?: unknown }> };
};

const NO_STORE = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_STORE });
}

/** 오류 본문은 코드와 한국어 안내만 담습니다. 원본 오류 메시지를 싣지 않습니다. */
export function errorResponse(
  status: number, code: string, message: string, extra?: Record<string, unknown>,
): Response {
  return jsonResponse({ code, message, ...extra }, status);
}

/** body의 user_id를 신뢰하지 않습니다. 검증된 세션의 sub만 사용합니다. */
export async function requireUserId(supabase: ClaimsClient): Promise<string | null> {
  let result: { data: unknown; error?: unknown };
  try {
    result = await supabase.auth.getClaims();
  } catch {
    return null;
  }
  if (result.error) return null;
  const claims = (result.data as { claims?: { sub?: unknown } } | null)?.claims;
  return typeof claims?.sub === "string" && claims.sub !== "" ? claims.sub : null;
}

/** KST 캘린더 월의 첫 순간을 UTC ISO로 돌려줍니다. 사용자의 달력과 한도를 일치시킵니다. */
export function kstMonthStart(now: Date): string {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - KST_OFFSET_MS).toISOString();
}

/** 다음 KST 캘린더 월의 첫 순간. Free 업로드 한도가 초기화되는 시각입니다. */
export function nextKstMonthStart(now: Date): string {
  // 이번 달 시작에 32일을 더하면 달 길이와 무관하게 다음 달 안으로 들어갑니다.
  return kstMonthStart(new Date(Date.parse(kstMonthStart(now)) + 32 * 86_400_000));
}

/**
 * 실제 읽은 bytes를 세어 상한을 넘으면 null을 돌려줍니다. Content-Length는 있으면 먼저 보고
 * 없거나 거짓이어도 스트림 누적으로 막습니다.
 */
export async function readLimitedBody(
  request: Request, limit: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  const body = request.body;
  if (!body) return new Uint8Array();

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) return null;
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

const columnIndex = z.number().int().nonnegative().max(4_096);

/**
 * 업로드와 승인이 함께 쓰는 ColumnMapping 검증기입니다. 모르는 키를 거절해
 * 클라이언트가 파서에 없는 필드를 흘려 넣지 못하게 합니다.
 */
export const columnMappingSchema = z.strictObject({
  date: columnIndex,
  merchant: columnIndex,
  amount: columnIndex.optional(),
  deposit: columnIndex.optional(),
  withdrawal: columnIndex.optional(),
  krwEquivalent: columnIndex.optional(),
  transactionKind: columnIndex.optional(),
  transactionId: columnIndex.optional(),
  billingMonth: columnIndex.optional(),
  skipRows: columnIndex,
}).refine((mapping) => mapping.amount !== undefined || mapping.deposit !== undefined
  || mapping.withdrawal !== undefined || mapping.krwEquivalent !== undefined);
