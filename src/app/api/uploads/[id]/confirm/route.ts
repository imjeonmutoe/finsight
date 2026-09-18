import { cookies } from "next/headers";
import { z } from "zod";
import { columnMappingSchema, errorResponse, jsonResponse, requireUserId } from "@/lib/api";
import { buildTransactions } from "@/lib/csv";
import { parseStatementRows } from "@/lib/statement";
import { decodeCsv } from "@/lib/encoding";
import { MAX_CSV_ROWS } from "@/lib/limits";
import { classifyByRule } from "@/lib/merchant-rules";
import { createServerSupabase } from "@/services/supabase";
import type { ConfirmResponse, ImportReviewResponse } from "@/types/api";
import { CATEGORIES } from "@/types/category";
import type { Category } from "@/types/category";
import type { CategorySource, ParsedTransaction } from "@/types/transaction";
import type { ImportContext } from "@/types/upload";

const BUCKET = "statements";
// URL 길이 제한이 있어 후보·규칙 조회는 나눠 보냅니다.
const LOOKUP_CHUNK = 200;

const confirmSchema = z.object({
  mapping: columnMappingSchema,
  encoding: z.enum(["utf-8", "euc-kr"]),
  accountingMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  duplicateDecisions: z.array(z.object({
    dataRowIndex: z.number().int().nonnegative(),
    action: z.enum(["keep", "duplicate"]),
    transactionId: z.uuid().optional(),
  // 유형 오버라이드나 거래구분 값 매핑은 받지 않습니다. kind는 매핑에서 도출합니다(ADR-013).
  }).refine((decision) => (decision.action === "duplicate") === (decision.transactionId !== undefined))),
});
const uploadSchema = z.object({
  id: z.string(), source_id: z.string(), file_hash: z.string(), storage_path: z.string(),
  status: z.enum(["pending", "mapped", "parsed", "failed"]),
  inserted_count: z.number().int(), duplicate_count: z.number().int(), unclassified_count: z.number().int(),
});
const candidateSchema = z.array(z.object({ id: z.string(), candidate_hash: z.string() }));
const ruleSchema = z.array(z.object({ merchant_norm: z.string(), category: z.enum(CATEGORIES) }));
const reviewSchema = z.object({
  review: z.array(z.object({ dataRowIndex: z.number().int(), transactionIds: z.array(z.string()) })),
});
const confirmedSchema = z.object({
  inserted: z.number().int(), duplicates: z.number().int(), unclassified: z.number().int(),
});

function chunks<T>(items: T[]): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += LOOKUP_CHUNK) {
    groups.push(items.slice(index, index + LOOKUP_CHUNK));
  }
  return groups;
}

function review(candidates: { dataRowIndex: number; transactionIds: string[] }[]): Response {
  return jsonResponse({
    code: "IMPORT_REVIEW_REQUIRED", duplicateCandidates: candidates,
  } satisfies ImportReviewResponse, 409);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = createServerSupabase(await cookies());
  const userId = await requireUserId(supabase);
  if (!userId) return errorResponse(401, "UNAUTHORIZED", "로그인이 필요합니다. 다시 로그인해 주세요.");

  const uploadId = (await params).id;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "INVALID_CONFIRM", "요청 형식을 확인해 주세요.");
  }
  const body = confirmSchema.safeParse(payload);
  if (!z.uuid().safeParse(uploadId).success || !body.success) {
    return errorResponse(400, "INVALID_CONFIRM", "매핑 확인 화면에서 컬럼과 인코딩을 다시 확인해 주세요.");
  }
  const { mapping, encoding, accountingMonth, duplicateDecisions } = body.data;

  const found = uploadSchema.safeParse((await supabase.from("uploads")
    .select("id,source_id,file_hash,storage_path,status,inserted_count,duplicate_count,unclassified_count")
    .eq("id", uploadId).eq("user_id", userId).maybeSingle()).data);
  if (!found.success) {
    return errorResponse(404, "UPLOAD_NOT_FOUND", "업로드를 찾지 못했습니다. 업로드 이력에서 다시 선택해 주세요.");
  }
  const upload = found.data;

  // 재승인은 저장된 결과를 그대로 돌려줍니다. 거래도 카운트도 건드리지 않습니다.
  if (upload.status === "parsed") {
    return jsonResponse({
      inserted: upload.inserted_count, duplicates: upload.duplicate_count,
      unclassified: upload.unclassified_count,
    } satisfies ConfirmResponse);
  }
  // failed는 매핑 추론이 실패한 업로드입니다. 사용자가 직접 고른 매핑으로 승인할 수 있어야
  // 합니다. 원본 보관에 실패한 경우라면 아래 Storage 다운로드가 걸러냅니다.
  if (upload.status !== "mapped" && upload.status !== "failed") {
    return errorResponse(409, "UPLOAD_NOT_MAPPED", "아직 매핑을 확인하지 않은 업로드입니다. 매핑 확인부터 진행해 주세요.");
  }

  const source = z.object({ kind: z.enum(["card", "bank"]) }).safeParse((await supabase
    .from("financial_sources").select("kind").eq("user_id", userId).eq("id", upload.source_id).maybeSingle()).data);
  if (!source.success) {
    return errorResponse(404, "SOURCE_NOT_FOUND", "카드·계좌를 찾지 못했습니다. 목록에서 다시 선택해 주세요.");
  }
  if (source.data.kind === "card" && mapping.billingMonth === undefined && accountingMonth === undefined) {
    return errorResponse(400, "ACCOUNTING_MONTH_REQUIRED",
      "카드 청구월을 알 수 없습니다. 명세서의 청구월을 선택해 주세요.");
  }

  // 출처·파일 해시·경로는 모두 DB의 값입니다. 요청으로 바꿀 수 없습니다.
  const context: ImportContext = {
    sourceId: upload.source_id, sourceKind: source.data.kind, fileHash: upload.file_hash,
    ...(accountingMonth === undefined ? {} : { accountingMonth }),
  };

  const stored = await supabase.storage.from(BUCKET).download(upload.storage_path);
  if (stored.error || !stored.data) {
    return errorResponse(500, "STORAGE_FAILED", "원본 파일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  let parsed: ParsedTransaction[];
  let rowCount: number;
  try {
    const rows = parseStatementRows(decodeCsv(new Uint8Array(await stored.data.arrayBuffer()), encoding));
    rowCount = rows.length;
    if (rowCount > MAX_CSV_ROWS) {
      return errorResponse(413, "TOO_MANY_ROWS", "행이 10,000개를 넘습니다. 기간을 나눠 다시 올려 주세요.");
    }
    parsed = buildTransactions(rows, mapping, context);
  } catch (error) {
    // 파서 메시지에는 행 번호만 들어 있습니다. 셀 값은 담기지 않습니다.
    const message = error instanceof Error ? error.message : "매핑을 다시 확인해 주세요.";
    return errorResponse(400, "PARSE_FAILED", message);
  }

  // 고유번호가 없는 행만 후보 확인 대상입니다. 같은 출처의 다른 업로드와만 비교합니다.
  const hashes = [...new Set(parsed
    .filter((transaction) => transaction.sourceTransactionKey === null)
    .map((transaction) => transaction.candidateHash ?? ""))].filter((hash) => hash !== "");
  const byHash = new Map<string, string[]>();
  for (const chunk of chunks(hashes)) {
    const rows = candidateSchema.safeParse((await supabase.from("transactions")
      .select("id,candidate_hash").eq("user_id", userId).eq("source_id", upload.source_id)
      .neq("upload_id", uploadId).in("candidate_hash", chunk)).data);
    if (!rows.success) {
      return errorResponse(500, "CANDIDATE_LOOKUP_FAILED", "중복 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
    for (const row of rows.data) {
      byHash.set(row.candidate_hash, [...(byHash.get(row.candidate_hash) ?? []), row.id]);
    }
  }

  const candidatesByRow = new Map<number, string[]>();
  for (const transaction of parsed) {
    if (transaction.sourceTransactionKey !== null) continue;
    const ids = byHash.get(transaction.candidateHash ?? "");
    if (ids && ids.length > 0) candidatesByRow.set(transaction.dataRowIndex, ids);
  }

  const decisions = new Map(duplicateDecisions.map((decision) => [decision.dataRowIndex, decision]));
  const targets = new Set<string>();
  for (const decision of duplicateDecisions) {
    const ids = candidatesByRow.get(decision.dataRowIndex);
    if (!ids) {
      return errorResponse(400, "INVALID_DECISION", "중복 확인 목록이 바뀌었습니다. 화면을 새로 고쳐 다시 확인해 주세요.");
    }
    if (decision.transactionId === undefined) continue;
    // 한 기존 거래를 여러 새 행에 대응시키면 정상 거래가 사라집니다.
    if (!ids.includes(decision.transactionId) || targets.has(decision.transactionId)) {
      return errorResponse(400, "INVALID_DECISION", "중복으로 지정한 거래를 확인할 수 없습니다. 다시 선택해 주세요.");
    }
    targets.add(decision.transactionId);
  }

  const undecided = [...candidatesByRow.entries()]
    .filter(([dataRowIndex]) => !decisions.has(dataRowIndex))
    .map(([dataRowIndex, transactionIds]) => ({ dataRowIndex, transactionIds }));
  if (undecided.length > 0) return review(undecided);

  // ① 사용자 규칙 → ② 내장 사전 순으로 채웁니다. 이 단계의 모델 호출은 0회입니다(ADR-011).
  const merchants = [...new Set(parsed
    .filter((transaction) => transaction.kind === "expense" || transaction.kind === "refund")
    .map((transaction) => transaction.merchantNorm))];
  const userRules = new Map<string, Category>();
  for (const chunk of chunks(merchants)) {
    const rows = ruleSchema.safeParse((await supabase.from("merchant_rules")
      .select("merchant_norm,category").eq("user_id", userId).in("merchant_norm", chunk)).data);
    if (!rows.success) {
      return errorResponse(500, "RULE_LOOKUP_FAILED", "가맹점 규칙을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    for (const row of rows.data) userRules.set(row.merchant_norm, row.category);
  }

  const classified = parsed.map((transaction) => {
    const classifiable = transaction.kind === "expense" || transaction.kind === "refund";
    const fromUser = classifiable ? userRules.get(transaction.merchantNorm) : undefined;
    const fromRule = classifiable && !fromUser ? classifyByRule(transaction.merchantNorm) : null;
    const category: Category | null = fromUser ?? fromRule;
    const categorySource: CategorySource | null = fromUser ? "user" : fromRule ? "rule" : null;
    return { ...transaction, category, categorySource };
  });

  // confirm_upload는 status가 'mapped'일 때만 저장합니다. 추론이 실패해 failed로 기록된
  // 업로드는 사용자가 직접 고른 매핑이 곧 확인된 매핑이므로 여기서 되돌립니다.
  if (upload.status === "failed") {
    const promoted = await supabase.from("uploads").update({ status: "mapped", error_message: null })
      .eq("id", uploadId).eq("user_id", userId);
    if (promoted.error) {
      return errorResponse(500, "CONFIRM_FAILED", "거래를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  const result = await supabase.rpc("confirm_upload", {
    p_upload_id: uploadId,
    p_rows: classified,
    p_decisions: [...candidatesByRow.entries()].map(([dataRowIndex, candidateIds]) => ({
      dataRowIndex, candidateIds,
      action: decisions.get(dataRowIndex)?.action ?? "keep",
      transactionId: decisions.get(dataRowIndex)?.transactionId ?? null,
    })),
    p_row_count: rowCount,
    p_encoding: encoding,
    p_column_mapping: mapping,
    p_import_context: context,
  });
  if (result.error) {
    return errorResponse(500, "CONFIRM_FAILED", "거래를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  const pending = reviewSchema.safeParse(result.data);
  if (pending.success) return review(pending.data.review);

  const confirmed = confirmedSchema.safeParse(result.data);
  if (!confirmed.success) {
    return errorResponse(500, "CONFIRM_FAILED", "거래를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return jsonResponse(confirmed.data satisfies ConfirmResponse);
}
