import { cookies } from "next/headers";
import { z } from "zod";
import { errorResponse, jsonResponse, requireUserId } from "@/lib/api";
import { computeCandidateHash, computeDedupeHash } from "@/lib/dedupe";
import { getMonthlySummary } from "@/lib/queries";
import { createServerSupabase } from "@/services/supabase";
import { CATEGORIES } from "@/types/category";
import type { ParsedTransaction } from "@/types/transaction";

const COLUMNS = [
  "id", "source_id", "upload_id", "occurred_on", "accounting_month", "merchant_raw",
  "merchant_norm", "amount_krw", "kind", "category", "category_source",
  "source_transaction_key", "data_row_index",
].join(",");
const NOT_FOUND = "거래를 찾지 못했습니다. 목록을 새로 고쳐 주세요.";
const WRITE_FAILED = "거래를 수정하지 못했습니다. 잠시 후 다시 시도해 주세요.";

// 카테고리와 거래 유형만 고칠 수 있습니다. 금액·가맹점·날짜는 원본에서 파생된 값입니다.
// strictObject로 모르는 키를 거절합니다. 조용히 버리면 클라이언트는 반영된 줄 알게 됩니다.
const patchSchema = z.strictObject({
  category: z.enum(CATEGORIES).optional(),
  kind: z.enum(["expense", "income", "refund", "transfer"]).optional(),
}).refine((body) => body.category !== undefined || body.kind !== undefined);
const rowSchema = z.object({
  id: z.string(), source_id: z.string(), upload_id: z.string(),
  occurred_on: z.iso.date(), accounting_month: z.iso.date(),
  merchant_raw: z.string(), merchant_norm: z.string(), amount_krw: z.number().int().nonnegative(),
  kind: z.enum(["expense", "income", "refund", "transfer"]),
  category: z.enum(CATEGORIES).nullable(), category_source: z.enum(["ai", "rule", "user"]).nullable(),
  source_transaction_key: z.string().nullable(), data_row_index: z.number().int().nonnegative(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = createServerSupabase(await cookies());
  const userId = await requireUserId(supabase);
  if (!userId) return errorResponse(401, "UNAUTHORIZED", "로그인이 필요합니다. 다시 로그인해 주세요.");

  const transactionId = (await params).id;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "INVALID_PATCH", "요청 형식을 확인해 주세요.");
  }
  const body = patchSchema.safeParse(payload);
  if (!z.uuid().safeParse(transactionId).success || !body.success) {
    return errorResponse(400, "INVALID_PATCH", "카테고리 또는 거래 유형만 고칠 수 있습니다.");
  }

  const found = rowSchema.safeParse((await supabase.from("transactions").select(COLUMNS)
    .eq("id", transactionId).eq("user_id", userId).maybeSingle()).data);
  if (!found.success) return errorResponse(404, "TRANSACTION_NOT_FOUND", NOT_FOUND);
  const row = found.data;

  const update: Record<string, unknown> = {};
  if (body.data.kind !== undefined && body.data.kind !== row.kind) {
    // 유형이 바뀌면 확정·후보 해시의 근거가 바뀝니다. 파일 해시는 원본 업로드에서 읽습니다.
    const upload = z.object({ file_hash: z.string() }).safeParse((await supabase.from("uploads")
      .select("file_hash").eq("id", row.upload_id).eq("user_id", userId).maybeSingle()).data);
    if (!upload.success) return errorResponse(500, "WRITE_FAILED", WRITE_FAILED);

    const rehashed: ParsedTransaction = {
      sourceId: row.source_id, occurredOn: row.occurred_on,
      accountingMonth: row.accounting_month.slice(0, 7), merchantRaw: row.merchant_raw,
      merchantNorm: row.merchant_norm, amountKrw: row.amount_krw, kind: body.data.kind,
      sourceTransactionKey: row.source_transaction_key, dataRowIndex: row.data_row_index,
      dedupeHash: null, candidateHash: null,
    };
    update.kind = body.data.kind;
    update.dedupe_hash = computeDedupeHash(rehashed, upload.data.file_hash);
    update.candidate_hash = computeCandidateHash(rehashed);
  }

  if (body.data.category !== undefined) {
    // 규칙을 먼저 저장합니다. 여기서 실패하면 화면의 카테고리도 바뀌지 않아 상태가 갈리지 않습니다.
    // 유형은 규칙에 저장하지 않습니다 — merchant_rules는 카테고리만 담습니다.
    const { error } = await supabase.from("merchant_rules").upsert({
      user_id: userId, merchant_norm: row.merchant_norm,
      category: body.data.category, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,merchant_norm" });
    if (error) return errorResponse(500, "WRITE_FAILED", WRITE_FAILED);
    update.category = body.data.category;
    update.category_source = "user";
  }

  const updated = await supabase.from("transactions").update(update)
    .eq("id", transactionId).eq("user_id", userId).select("id").single();
  if (updated.error) {
    // 해시가 기존 거래와 겹치면 알리고 멈춥니다. 거래를 자동으로 지우지 않습니다.
    if ((updated.error as { code?: string }).code === "23505") {
      return errorResponse(409, "DUPLICATE_TRANSACTION",
        "같은 출처에 이미 같은 거래가 있습니다. 거래 유형을 다시 확인해 주세요.");
    }
    return errorResponse(500, "WRITE_FAILED", WRITE_FAILED);
  }

  // 집계는 여기서 다시 구현하지 않고 queries.ts를 재조회합니다.
  const summary = await getMonthlySummary(supabase, userId, row.accounting_month.slice(0, 7));

  return jsonResponse({
    id: row.id,
    category: body.data.category ?? row.category,
    categorySource: body.data.category === undefined ? row.category_source : "user",
    kind: body.data.kind ?? row.kind,
    summary,
  });
}
