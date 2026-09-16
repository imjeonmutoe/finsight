"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/services/supabase";

const ON_FAILURE = "/login?error=oauth";

export async function signInWithGoogle() {
  // origin은 사용자 입력이 아닙니다. Next가 Server Action 요청마다 Host와 대조해
  // 어긋나면 요청을 거절합니다. 없는 경우는 브라우저가 보낸 요청이 아니므로 진행하지 않습니다.
  const origin = (await headers()).get("origin");
  if (!origin) {
    redirect(ON_FAILURE);
  }

  const supabase = createServerSupabase(await cookies());
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data.url) {
    redirect(ON_FAILURE);
  }

  redirect(data.url);
}
