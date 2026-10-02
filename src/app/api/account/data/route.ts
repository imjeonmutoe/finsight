import { cookies } from "next/headers";
import { z } from "zod";
import { errorResponse, jsonResponse, requireUserId } from "@/lib/api";
import { createServerSupabase } from "@/services/supabase";
import { createServiceSupabase } from "@/services/supabase-service";

const BUCKET = "statements";
// 화면에서 사용자가 그대로 입력해야 하는 문구입니다.
export const CONFIRM_PHRASE = "삭제";
// Storage list의 한 번 조회 상한입니다. 더 있으면 다음 장을 이어서 받습니다.
const PAGE_SIZE = 1_000;

// 삭제 순서는 자식 → 부모입니다. transactions는 uploads를, uploads는 financial_sources를
// 복합 FK로 참조합니다. profiles는 목록에 없습니다 — 구독 상태가 사라지면 안 됩니다.
const TABLES = ["transactions", "uploads", "merchant_rules", "financial_sources"] as const;

const bodySchema = z.object({ confirm: z.literal(CONFIRM_PHRASE) });

/**
 * 금융 데이터 전체 삭제. 계정 삭제가 아닙니다 — `profiles`와 구독 상태는 그대로 둡니다.
 * 계정 자체의 삭제 요청은 개인정보처리방침의 문의 경로로 접수합니다.
 */
export async function DELETE(request: Request) {
  const supabase = createServerSupabase(await cookies());
  const userId = await requireUserId(supabase);
  if (!userId) return errorResponse(401, "UNAUTHORIZED", "로그인이 필요합니다. 다시 로그인해 주세요.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (!bodySchema.safeParse(body).success) {
    return errorResponse(400, "CONFIRM_REQUIRED", `"${CONFIRM_PHRASE}"를 입력해야 지울 수 있습니다.`);
  }

  // insight_cache는 authenticated에게 DELETE 권한이 없어 service role이 필요합니다.
  // 지우기 전에 먼저 확보합니다 — 거래만 지우고 캐시가 남으면 근거 없는 인사이트가 남습니다.
  let service: ReturnType<typeof createServiceSupabase>;
  try {
    service = createServiceSupabase();
  } catch {
    return errorResponse(503, "DELETE_UNAVAILABLE", "지금은 삭제할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }

  // ① Storage 먼저. DB를 먼저 지우면 어떤 객체를 지워야 할지 알 방법이 사라져
  //    원본 CSV가 영구 고아로 남습니다. 여기서 실패하면 DB는 손대지 않습니다.
  for (;;) {
    const listed = await supabase.storage.from(BUCKET).list(userId, { limit: PAGE_SIZE });
    if (listed.error) {
      return errorResponse(500, "STORAGE_DELETE_FAILED", "원본 파일을 지우지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    const objects = listed.data ?? [];
    if (objects.length === 0) break;
    const removed = await supabase.storage.from(BUCKET)
      .remove(objects.map((object) => `${userId}/${object.name}`));
    if (removed.error) {
      return errorResponse(500, "STORAGE_DELETE_FAILED", "원본 파일을 지우지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    if (objects.length < PAGE_SIZE) break;
  }

  // ② DB. RLS를 믿되 user_id 조건을 명시합니다.
  for (const table of TABLES) {
    const { error } = await supabase.from(table).delete().eq("user_id", userId);
    if (error) {
      return errorResponse(500, "DELETE_FAILED", "금융 데이터를 다 지우지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  // ③ 근거 거래가 사라졌으므로 인사이트 캐시도 함께 지웁니다.
  //    세션에서 확인한 ID만 씁니다. 실패해도 다시 눌러 이어서 지울 수 있습니다(멱등).
  const cache = await service.from("insight_cache").delete().eq("user_id", userId);
  if (cache.error) {
    return errorResponse(500, "INSIGHT_CACHE_DELETE_FAILED",
      "금융 데이터는 지웠지만 인사이트 캐시가 남았습니다. 한 번 더 눌러 주세요.");
  }

  return jsonResponse({ deleted: true });
}
