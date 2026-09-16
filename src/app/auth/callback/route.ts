import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/services/supabase";

// 목적지는 서버가 고정합니다. 쿼리 파라미터로 받으면 오픈 리디렉트가 됩니다.
const AFTER_LOGIN = "/dashboard";
const ON_FAILURE = "/login?error=oauth";

// profiles 행은 step 2의 가입 트리거가 만듭니다. 여기서 만들지 않습니다 —
// 사용자 세션에는 profiles INSERT 권한이 없고(RLS), 플랜은 서버만 정합니다.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL(ON_FAILURE, request.url));
  }

  const supabase = createServerSupabase(await cookies());
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // 원본 오류 메시지를 사용자에게 흘리지 않습니다. 로그인 화면이 한국어로 안내합니다.
    return NextResponse.redirect(new URL(ON_FAILURE, request.url));
  }

  return NextResponse.redirect(new URL(AFTER_LOGIN, request.url));
}
