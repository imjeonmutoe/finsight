import { cookies } from "next/headers";
import { z } from "zod";
import { errorResponse, jsonResponse, requireUserId } from "@/lib/api";
import { ownsStoragePath } from "@/lib/storage-path";
import { createServerSupabase } from "@/services/supabase";

const BUCKET = "statements";
const COLUMNS = "id,filename,storage_path,status,created_at";
const UNAUTHORIZED = "로그인이 필요합니다. 다시 로그인해 주세요.";
const NOT_FOUND = "업로드를 찾지 못했습니다. 업로드 이력에서 다시 선택해 주세요.";

const uploadSchema = z.object({
  id: z.string(), filename: z.string(), storage_path: z.string(),
  status: z.enum(["pending", "mapped", "parsed", "failed"]), created_at: z.string(),
});

async function load(id: string) {
  const supabase = createServerSupabase(await cookies());
  const userId = await requireUserId(supabase);
  if (!userId) return { response: errorResponse(401, "UNAUTHORIZED", UNAUTHORIZED) };
  if (!z.uuid().safeParse(id).success) {
    return { response: errorResponse(400, "INVALID_UPLOAD_ID", NOT_FOUND) };
  }

  const found = uploadSchema.safeParse((await supabase.from("uploads").select(COLUMNS)
    .eq("id", id).eq("user_id", userId).maybeSingle()).data);
  if (!found.success) return { response: errorResponse(404, "UPLOAD_NOT_FOUND", NOT_FOUND) };
  // storage_path는 클라이언트가 직접 INSERT할 수 있는 컬럼이다(0004). 남의 폴더면 없는 업로드로 본다.
  if (!ownsStoragePath(userId, found.data.storage_path)) {
    return { response: errorResponse(404, "UPLOAD_NOT_FOUND", NOT_FOUND) };
  }

  // 삭제 확인 화면이 "함께 삭제됩니다"를 고지할 수 있게 건수를 함께 돌려줍니다(ADR-008).
  const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("upload_id", id);

  return { supabase, userId, upload: found.data, transactionCount: count ?? 0 };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const loaded = await load((await params).id);
  if (loaded.response) return loaded.response;

  return jsonResponse({
    uploadId: loaded.upload.id, filename: loaded.upload.filename, status: loaded.upload.status,
    createdAt: loaded.upload.created_at, transactionCount: loaded.transactionCount,
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const loaded = await load((await params).id);
  if (loaded.response) return loaded.response;
  const { supabase, userId, upload, transactionCount } = loaded;

  // Storage를 먼저 지웁니다. DB만 지우면 CASCADE가 원본 객체를 남겨 유출 표면이 남습니다.
  // 여기서 실패하면 DB는 손대지 않으므로 삭제 전 상태가 그대로 유지됩니다.
  const removed = await supabase.storage.from(BUCKET).remove([upload.storage_path]);
  if (removed.error) {
    return errorResponse(500, "STORAGE_DELETE_FAILED", "원본 파일을 지우지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  const { error } = await supabase.from("uploads").delete().eq("id", upload.id).eq("user_id", userId);
  if (error) {
    return errorResponse(500, "DELETE_FAILED", "업로드를 지우지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  return jsonResponse({ deleted: transactionCount });
}
