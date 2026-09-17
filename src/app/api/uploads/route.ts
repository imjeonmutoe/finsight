import { cookies } from "next/headers";
import { z } from "zod";
import {
  columnMappingSchema, errorResponse, jsonResponse, kstMonthStart, nextKstMonthStart, readLimitedBody, requireUserId,
} from "@/lib/api";
import { detectHeaderRow } from "@/lib/csv";
import { parseStatementRows } from "@/lib/statement";
import { computeFileHash } from "@/lib/dedupe";
import { decodeCsv, detectEncoding } from "@/lib/encoding";
import { MAX_CSV_ROWS, MAX_FILE_BYTES, MAX_MULTIPART_BODY_BYTES } from "@/lib/limits";
import { buildSanitizedMappingInput } from "@/lib/sanitize";
import { inferColumnMapping } from "@/services/claude";
import { createServerSupabase } from "@/services/supabase";
import type { MappingResponse } from "@/types/api";
import type { ColumnMapping, ImportContext, UploadStatus } from "@/types/upload";

const BUCKET = "statements";
const PREVIEW_ROWS = 5;
const SAMPLE_ROWS = 20;
// pending이 이 시간을 넘겨 남아 있으면 요청이 죽은 것으로 보고 재개를 허용합니다.
const PENDING_TIMEOUT_MS = 300_000;
// 확장자가 .csv인 파일에 브라우저·OS가 붙이는 타입들입니다. 이미지·PDF·압축은 거절합니다.
const ALLOWED_TYPES = new Set([
  "", "text/csv", "text/plain", "application/csv", "application/vnd.ms-excel", "application/octet-stream",
]);
// 카드사가 주는 확장자입니다. 내용은 아래에서 CSV·HTML 표 어느 쪽이든 읽습니다.
const STATEMENT_EXTENSIONS = [".csv", ".xls"];
const EXISTING_COLUMNS = "id,status,storage_path,column_mapping,mapping_confidence,encoding,created_at";

const uploadSchema = z.object({ sourceId: z.uuid() });
const sourceSchema = z.object({ id: z.string(), kind: z.enum(["card", "bank"]) });
const existingSchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "mapped", "parsed", "failed"]),
  storage_path: z.string(),
  column_mapping: z.unknown(),
  mapping_confidence: z.number().nullable().default(null),
  encoding: z.enum(["utf-8", "euc-kr"]).nullable().default(null),
  created_at: z.string(),
});
const insertedSchema = z.object({ id: z.string() });
const mappedSchema = z.object({
  status: z.enum(["pending", "mapped", "parsed", "failed"]),
  column_mapping: z.unknown(),
  mapping_confidence: z.number().nullable().default(null),
});
const profileSchema = z.object({ plan: z.enum(["free", "pro"]), plan_expires_at: z.string().nullable().default(null) });

const MAPPING_ERROR = "컬럼 매핑을 추론하지 못했습니다. 매핑 확인 화면에서 컬럼을 직접 선택해 주세요. 이번 업로드는 한 달 횟수를 소비하지 않았습니다.";

function storedMapping(value: unknown): ColumnMapping | null {
  const parsed = columnMappingSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function POST(request: Request) {
  const supabase = createServerSupabase(await cookies());
  const userId = await requireUserId(supabase);
  if (!userId) return errorResponse(401, "UNAUTHORIZED", "로그인이 필요합니다. 다시 로그인해 주세요.");

  if (!(request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    return errorResponse(400, "INVALID_UPLOAD", "파일을 첨부해 다시 올려 주세요.");
  }
  // Content-Length를 믿지 않고 실제 읽은 bytes로 막습니다.
  const body = await readLimitedBody(request, MAX_MULTIPART_BODY_BYTES);
  if (!body) {
    return errorResponse(413, "BODY_TOO_LARGE", "요청이 너무 큽니다. 기간을 나눠 다시 올려 주세요.");
  }

  let form: FormData;
  try {
    form = await new Request("http://upload.local/", {
      method: "POST", headers: { "content-type": request.headers.get("content-type") ?? "" },
      // 이미 받아 둔 bytes로 다시 파싱합니다. Blob으로 감싸는 것은 BodyInit 타입 때문입니다.
      body: new Blob([body]),
    }).formData();
  } catch {
    return errorResponse(400, "INVALID_UPLOAD", "파일을 첨부해 다시 올려 주세요.");
  }

  const fields = uploadSchema.safeParse({ sourceId: form.get("sourceId") });
  const file = form.get("file");
  if (!fields.success || !(file instanceof File)) {
    return errorResponse(400, "INVALID_UPLOAD", "카드·계좌를 선택하고 CSV 파일을 첨부해 주세요.");
  }
  // .xls도 받습니다 — 카드사·은행의 "엑셀 내려받기"가 주는 것은 대개 HTML 표이고,
  // 파일 이름을 바꿔 오라고 시키지 않으려면 확장자도 함께 받아야 합니다.
  if (!STATEMENT_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension))
    || !ALLOWED_TYPES.has(file.type)) {
    return errorResponse(400, "INVALID_FILE_TYPE",
      "CSV 또는 카드사에서 내려받은 엑셀 파일만 올릴 수 있습니다.");
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  if (fileBytes.byteLength > MAX_FILE_BYTES) {
    return errorResponse(413, "FILE_TOO_LARGE", "파일이 4MB를 넘습니다. 기간을 나눠 다시 올려 주세요.");
  }

  const { sourceId } = fields.data;
  const source = sourceSchema.safeParse((await supabase.from("financial_sources").select("id,kind")
    .eq("user_id", userId).eq("id", sourceId).maybeSingle()).data);
  if (!source.success) {
    return errorResponse(404, "SOURCE_NOT_FOUND", "카드·계좌를 찾지 못했습니다. 목록에서 다시 선택해 주세요.");
  }

  const encoding = detectEncoding(fileBytes);
  let rows: string[][];
  let headerRowIndex: number;
  try {
    rows = parseStatementRows(decodeCsv(fileBytes, encoding));
    headerRowIndex = detectHeaderRow(rows);
  } catch {
    // 파서 오류 메시지에는 셀 값이 없지만 사용자에게는 고정 문구로 안내합니다.
    return errorResponse(400, "INVALID_CSV", "읽을 수 없는 파일입니다. 명세서를 다시 내려받아 올려 주세요.");
  }
  if (rows.length > MAX_CSV_ROWS) {
    return errorResponse(413, "TOO_MANY_ROWS", "행이 10,000개를 넘습니다. 기간을 나눠 다시 올려 주세요.");
  }

  const fileHash = computeFileHash(fileBytes);
  const preview = rows.slice(0, PREVIEW_ROWS);

  function reuseResponse(row: { id: string; status: UploadStatus; column_mapping: unknown; mapping_confidence: number | null }): Response {
    return jsonResponse({
      uploadId: row.id, sourceId, status: row.status, reused: true,
      mapping: storedMapping(row.column_mapping), confidence: row.mapping_confidence ?? 0, preview,
    } satisfies MappingResponse);
  }

  async function findExisting() {
    return existingSchema.safeParse((await supabase.from("uploads").select(EXISTING_COLUMNS)
      .eq("user_id", userId).eq("source_id", sourceId).eq("file_hash", fileHash).maybeSingle()).data);
  }

  const existing = await findExisting();
  if (existing.success) {
    const row = existing.data;
    if (row.status === "mapped" || row.status === "parsed") return reuseResponse(row);
    if (row.status === "pending" && Date.now() - Date.parse(row.created_at) < PENDING_TIMEOUT_MS) {
      return errorResponse(409, "UPLOAD_IN_PROGRESS", "같은 파일을 처리하고 있습니다. 잠시 후 다시 시도해 주세요.", {
        retryAt: new Date(Date.parse(row.created_at) + PENDING_TIMEOUT_MS).toISOString(),
      });
    }
  }

  const importContext: ImportContext = { sourceId, sourceKind: source.data.kind, fileHash };
  const record = {
    encoding, byte_size: fileBytes.byteLength, row_count: rows.length,
    filename: file.name, import_context: importContext, status: "pending" as const, error_message: null,
  };

  let uploadId: string;
  let storagePath: string;
  if (existing.success) {
    // 같은 행·파일을 재사용합니다. 실패한 업로드가 이력에 중복으로 쌓이지 않습니다.
    uploadId = existing.data.id;
    storagePath = existing.data.storage_path;
    const { error } = await supabase.from("uploads").update(record).eq("id", uploadId).eq("user_id", userId);
    if (error) return errorResponse(500, "UPLOAD_FAILED", "업로드를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  } else {
    // 경로는 서버가 조합합니다. 원본 파일명과 클라이언트가 보낸 값은 경로에 들어가지 않습니다.
    storagePath = `${userId}/${crypto.randomUUID()}.csv`;
    const created = await supabase.from("uploads")
      .insert({ user_id: userId, source_id: sourceId, file_hash: fileHash, storage_path: storagePath, ...record })
      .select("id").single();
    const inserted = insertedSchema.safeParse(created.data);
    if (!inserted.success) {
      // 동시 업로드가 UNIQUE에 부딪히면 먼저 만들어진 행을 그대로 씁니다.
      const raced = await findExisting();
      if (raced.success && (raced.data.status === "mapped" || raced.data.status === "parsed")) {
        return reuseResponse(raced.data);
      }
      if (raced.success) {
        return errorResponse(409, "UPLOAD_IN_PROGRESS", "같은 파일을 처리하고 있습니다. 잠시 후 다시 시도해 주세요.", {
          retryAt: new Date(Date.parse(raced.data.created_at) + PENDING_TIMEOUT_MS).toISOString(),
        });
      }
      return errorResponse(500, "UPLOAD_FAILED", "업로드를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    uploadId = inserted.data.id;
  }

  async function markFailed(message: string) {
    await supabase.from("uploads").update({ status: "failed", error_message: message })
      .eq("id", uploadId).eq("user_id", userId);
  }

  const stored = await supabase.storage.from(BUCKET)
    .upload(storagePath, fileBytes, { contentType: "text/csv", upsert: true });
  if (stored.error) {
    await markFailed("원본 파일을 보관하지 못했습니다. 잠시 후 다시 올려 주세요.");
    return errorResponse(500, "STORAGE_FAILED", "원본 파일을 보관하지 못했습니다. 잠시 후 다시 올려 주세요.");
  }

  // 경쟁 요청이 이미 매핑을 만들어 뒀으면 모델을 다시 호출하지 않습니다.
  const cached = mappedSchema.safeParse((await supabase.from("uploads")
    .select("status,column_mapping,mapping_confidence").eq("id", uploadId).eq("user_id", userId).maybeSingle()).data);
  if (cached.success && cached.data.status !== "pending" && storedMapping(cached.data.column_mapping)) {
    return reuseResponse({ id: uploadId, ...cached.data });
  }

  const profile = profileSchema.safeParse((await supabase.from("profiles").select("plan,plan_expires_at")
    .eq("id", userId).maybeSingle()).data);
  const now = new Date();
  const pro = profile.success && profile.data.plan === "pro"
    && (profile.data.plan_expires_at === null || Date.parse(profile.data.plan_expires_at) > now.getTime());
  if (!pro) {
    // 카운터 테이블을 두지 않습니다. uploads를 KST 캘린더 월로 직접 셉니다.
    const { count } = await supabase.from("uploads").select("id", { count: "exact", head: true })
      .eq("user_id", userId).in("status", ["mapped", "parsed"]).gte("created_at", kstMonthStart(now));
    if ((count ?? 0) >= 1) {
      // 모델을 호출하기 전에 되돌립니다. 한도 초과가 호출 비용을 쓰지 않습니다.
      await supabase.storage.from(BUCKET).remove([storagePath]);
      if (existing.success) await markFailed(MAPPING_ERROR);
      else await supabase.from("uploads").delete().eq("id", uploadId).eq("user_id", userId);
      return errorResponse(403, "UPLOAD_LIMIT_REACHED",
        "이번 달 무료 업로드를 이미 사용했습니다. 다음 달 1일에 초기화됩니다.",
        { resetsAt: nextKstMonthStart(now) });
    }
  }

  const headers = rows[headerRowIndex] ?? [];
  const sanitized = buildSanitizedMappingInput(
    headers, rows.slice(headerRowIndex + 1, headerRowIndex + 1 + SAMPLE_ROWS), headerRowIndex,
  );

  let mapping: ColumnMapping;
  let confidence: number;
  try {
    ({ mapping, confidence } = await inferColumnMapping(sanitized));
  } catch {
    await markFailed(MAPPING_ERROR);
    // 추론만 실패했습니다. 원본은 Storage에 있으므로 사용자가 직접 컬럼을 고르면 그대로 진행됩니다.
    // 안내 문구가 "매핑 확인 화면에서 직접 선택하라"고 하므로 그 화면을 열 재료를 함께 줍니다.
    return errorResponse(502, "MAPPING_FAILED", MAPPING_ERROR, {
      uploadId, sourceId, status: "failed", reused: false, mapping: null, confidence: 0, preview,
    });
  }

  const { error } = await supabase.from("uploads")
    .update({ status: "mapped", column_mapping: mapping, mapping_confidence: confidence })
    .eq("id", uploadId).eq("user_id", userId);
  if (error) return errorResponse(500, "UPLOAD_FAILED", "매핑을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");

  return jsonResponse({
    uploadId, sourceId, status: "mapped", reused: false, mapping, confidence, preview,
  } satisfies MappingResponse);
}
