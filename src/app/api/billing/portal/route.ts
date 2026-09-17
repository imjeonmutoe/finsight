import { cookies } from "next/headers";
import { errorResponse, requireUserId } from "@/lib/api";
import { createCustomerPortalUrl } from "@/services/polar";
import { createServerSupabase } from "@/services/supabase";

const RETURN_PATH = "/dashboard/settings";

/**
 * Polar 고객 포털(결제 수단·영수증·해지)로 보냅니다. 포털 주소에는 일회성 토큰이 들어 있어
 * 화면에 심어 두지 않고 누를 때마다 서버에서 만듭니다.
 */
export async function GET() {
  const supabase = createServerSupabase(await cookies());
  const userId = await requireUserId(supabase);
  if (!userId) return errorResponse(401, "UNAUTHORIZED", "로그인이 필요합니다. 다시 로그인해 주세요.");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  let url: string;
  try {
    url = await createCustomerPortalUrl({ userId, returnUrl: `${siteUrl}${RETURN_PATH}` });
  } catch {
    return errorResponse(503, "PORTAL_UNAVAILABLE",
      "고객 포털을 열지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  // 토큰이 들어 있는 주소입니다. CDN이 캐싱하면 다른 사용자에게 같은 세션이 나갑니다.
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } });
}
