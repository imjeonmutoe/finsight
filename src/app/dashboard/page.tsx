import { cookies } from "next/headers";
import { createServerSupabase } from "@/services/supabase";

// 로그인 성공을 확인할 최소 화면이다. 실제 대시보드(S3~S6)는 step 8이 만든다.
export default async function DashboardPage() {
  const supabase = createServerSupabase(await cookies());
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims.email;

  return (
    <main className="mx-auto max-w-6xl space-y-3 px-6 py-16">
      <h1 className="text-2xl font-semibold leading-snug text-text">대시보드</h1>
      <p className="text-sm leading-relaxed text-text-body">
        {email ? `${email} 계정으로 로그인했습니다.` : "로그인했습니다."}
      </p>
      <p className="text-sm leading-relaxed text-muted">지출 요약은 준비하고 있습니다.</p>
    </main>
  );
}
