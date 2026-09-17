import { cookies } from "next/headers";
import { z } from "zod";
import { errorResponse, jsonResponse, requireUserId } from "@/lib/api";
import { clientIpAddress, createProCheckout } from "@/services/polar";
import { createServerSupabase } from "@/services/supabase";

// 결제를 마치면 설정 화면으로 돌아옵니다. 웹훅이 늦을 수 있어 그 화면이 플랜을 잠시 폴링합니다.
export const CHECKOUT_RETURN_PATH = "/dashboard/settings?checkout=success";

const profileSchema = z.object({
  plan: z.enum(["free", "pro"]),
  plan_expires_at: z.string().nullable().default(null),
  email: z.email(),
});

export async function POST(request: Request) {
  const supabase = createServerSupabase(await cookies());
  const userId = await requireUserId(supabase);
  if (!userId) return errorResponse(401, "UNAUTHORIZED", "로그인이 필요합니다. 다시 로그인해 주세요.");

  const { data, error } = await supabase.from("profiles")
    .select("plan,plan_expires_at,email").eq("id", userId).maybeSingle();
  const profile = profileSchema.safeParse(data);
  if (error || !profile.success) {
    return errorResponse(500, "PROFILE_READ_FAILED",
      "플랜을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  const active = profile.data.plan === "pro" && (profile.data.plan_expires_at === null
    || Date.parse(profile.data.plan_expires_at) > Date.now());
  if (active) {
    return errorResponse(409, "ALREADY_PRO", "이미 Pro를 이용하고 있습니다. 설정에서 구독을 관리해 주세요.");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return errorResponse(503, "CHECKOUT_UNAVAILABLE",
      "지금은 결제를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }

  let url: string;
  try {
    url = await createProCheckout({
      userId,
      email: profile.data.email,
      // Polar이 요청 출처로 지오로케이션하면 한국 사용자에게 USD 가격이 뜹니다.
      ipAddress: clientIpAddress(request.headers),
      successUrl: `${siteUrl}${CHECKOUT_RETURN_PATH}`,
    });
  } catch {
    return errorResponse(503, "CHECKOUT_UNAVAILABLE",
      "지금은 결제를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }

  return jsonResponse({ url });
}
