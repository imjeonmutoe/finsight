import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DeleteDataForm } from "@/components/DeleteDataForm";
import { requireUserId } from "@/lib/api";
import { createServerSupabase } from "@/services/supabase";
import type { Plan } from "@/types/billing";

export const metadata: Metadata = {
  title: "설정 | FinSight",
  description: "플랜을 확인하고 보관 중인 금융 데이터를 지웁니다.",
};

const SECONDARY = "rounded-md border border-border-default px-4 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const profileSchema = z.object({
  plan: z.enum(["free", "pro"]),
  plan_expires_at: z.string().nullable().default(null),
});

export default async function SettingsPage() {
  const supabase = createServerSupabase(await cookies());
  // 미들웨어가 이미 막지만, 세션이 끊긴 채 렌더되면 빈 화면이 되므로 한 겹 더 둡니다.
  const userId = await requireUserId(supabase);
  if (!userId) redirect("/login");

  const profile = profileSchema.safeParse((await supabase.from("profiles")
    .select("plan,plan_expires_at").eq("id", userId).maybeSingle()).data);
  const now = new Date();
  const pro = profile.success && profile.data.plan === "pro"
    && (profile.data.plan_expires_at === null || Date.parse(profile.data.plan_expires_at) > now.getTime());
  const plan: Plan = pro ? "pro" : "free";
  const expiresAt = profile.success ? profile.data.plan_expires_at : null;

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-10 font-sans">
      <header className="space-y-2">
        <p className="text-sm text-muted">FinSight · 대시보드</p>
        <h1 className="text-2xl font-semibold leading-snug text-text">설정</h1>
      </header>

      {/* 업그레이드·해지 버튼은 step 11이 이 자리에 붙입니다. 여기서는 상태만 보여줍니다. */}
      <section
        aria-labelledby="plan-heading"
        className="max-w-2xl space-y-3 rounded-md border border-border-default bg-surface p-5"
      >
        <h2 id="plan-heading" className="text-sm font-medium leading-snug text-muted">플랜</h2>
        <p className="text-2xl font-semibold leading-snug text-text">{plan === "pro" ? "Pro" : "Free"}</p>
        <p className="text-sm leading-relaxed text-text-body">
          {plan === "pro"
            ? "기간별 추이 · 구독 누수 · 이상거래 · AI 월간 요약을 모두 쓰고 있습니다."
            : "업로드는 KST 캘린더 월 기준 1회입니다. 자동 분류와 해당 월 요약, AI 월간 요약은 Free에서도 제공합니다."}
        </p>
        {plan === "pro" && expiresAt !== null && (
          <p className="font-mono text-sm tabular-nums text-muted">
            {expiresAt.slice(0, 10).replaceAll("-", ".")}까지 이용할 수 있습니다.
          </p>
        )}
      </section>

      <DeleteDataForm />

      <nav aria-label="다음 화면" className="flex flex-wrap gap-3">
        <Link href="/dashboard" className={SECONDARY}>대시보드로 돌아가기</Link>
        <Link href="/dashboard/uploads" className={SECONDARY}>업로드 이력 보기</Link>
      </nav>
    </main>
  );
}
