"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/services/supabase";

const ON_FAILURE = "/dashboard/settings?error=signout";

export async function signOut() {
  const supabase = createServerSupabase(await cookies());
  // 기본값인 global scope는 이 사용자의 다른 기기 세션까지 함께 끊습니다.
  // 로그아웃 버튼이 하는 일로는 과합니다 — 이 브라우저만 끝냅니다.
  const { error } = await supabase.auth.signOut({ scope: "local" });

  // auth-js는 요청이 실패하면 로컬 세션을 지우지 않고 에러만 돌려줍니다(GoTrueClient._signOut).
  // 이때 랜딩으로 보내면 로그인 상태로 판정돼 대시보드로 되돌아오므로, 실패를 화면에 남깁니다.
  redirect(error ? ON_FAILURE : "/");
}
