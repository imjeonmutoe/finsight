"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isPreviewDeployment, PREVIEW_ACCOUNTS, PREVIEW_PASSWORD } from "@/lib/preview-accounts";
import { createServerSupabase } from "@/services/supabase";

const ON_FAILURE = "/login?error=oauth";
const ON_PREVIEW_FAILURE = "/login?error=preview";

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

// Vercel 프리뷰 배포 전용. 프리뷰 브랜치는 Supabase 주소가 매번 달라 Google 콜백을 등록할 수 없어서
// 시드 계정으로 비밀번호 로그인한다. 서버 액션은 버튼 없이도 POST로 호출되므로 여기서 다시 막는다.
// 폼에서는 계정 id만 받고, 이메일·비밀번호는 서버 상수에서만 읽는다.
export async function signInAsPreviewAccount(formData: FormData) {
  if (!isPreviewDeployment()) {
    redirect(ON_PREVIEW_FAILURE);
  }

  const accountId = formData.get("accountId");
  const account = PREVIEW_ACCOUNTS.find((candidate) => candidate.id === accountId);
  if (!account) {
    redirect(ON_PREVIEW_FAILURE);
  }

  const supabase = createServerSupabase(await cookies());
  const { error } = await supabase.auth.signInWithPassword({
    email: account.email,
    password: PREVIEW_PASSWORD,
  });

  if (error) {
    redirect(ON_PREVIEW_FAILURE);
  }

  redirect("/dashboard");
}
