import { cookies } from "next/headers";
import { z } from "zod";
import { errorResponse, jsonResponse, requireUserId } from "@/lib/api";
import { sanitizeMerchantForLlm } from "@/lib/sanitize";
import { createServerSupabase } from "@/services/supabase";
import type { FinancialSource } from "@/types/upload";

const COLUMNS = "id,label,kind";
const UNAUTHORIZED = "로그인이 필요합니다. 다시 로그인해 주세요.";
const READ_FAILED = "카드·계좌 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
const WRITE_FAILED = "카드·계좌를 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.";

// 별칭에는 계좌번호·카드번호를 저장하지 않습니다. 서버가 만든 UUID만 출처를 가리킵니다.
const sourceSchema = z.object({
  label: z.string().transform((value) => value.trim())
    .refine((value) => value.length >= 1 && value.length <= 60)
    .refine((value) => sanitizeMerchantForLlm(value) === value),
  kind: z.enum(["card", "bank"]),
});
const rowSchema = z.object({ id: z.string(), label: z.string(), kind: z.enum(["card", "bank"]) });

export async function GET() {
  const supabase = createServerSupabase(await cookies());
  const userId = await requireUserId(supabase);
  if (!userId) return errorResponse(401, "UNAUTHORIZED", UNAUTHORIZED);

  const { data, error } = await supabase.from("financial_sources").select(COLUMNS)
    .eq("user_id", userId).order("created_at", { ascending: true });
  const sources = z.array(rowSchema).safeParse(data);
  if (error || !sources.success) return errorResponse(500, "READ_FAILED", READ_FAILED);

  return jsonResponse({ sources: sources.data satisfies FinancialSource[] });
}

export async function POST(request: Request) {
  const supabase = createServerSupabase(await cookies());
  const userId = await requireUserId(supabase);
  if (!userId) return errorResponse(401, "UNAUTHORIZED", UNAUTHORIZED);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_SOURCE", "요청 형식을 확인해 주세요.");
  }
  const parsed = sourceSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "INVALID_SOURCE",
      "별칭은 1~60자이며 계좌번호·카드번호를 넣을 수 없습니다. 사용 목적을 적어 주세요.");
  }

  // id와 user_id는 서버가 정합니다. body의 값을 쓰지 않습니다.
  const { data, error } = await supabase.from("financial_sources")
    .insert({ user_id: userId, label: parsed.data.label, kind: parsed.data.kind })
    .select(COLUMNS).single();
  const source = rowSchema.safeParse(data);
  if (error || !source.success) return errorResponse(500, "WRITE_FAILED", WRITE_FAILED);

  return jsonResponse({ source: source.data satisfies FinancialSource }, 201);
}
