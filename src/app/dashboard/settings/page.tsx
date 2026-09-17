import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CheckoutReturn } from "@/components/CheckoutReturn";
import { DeleteDataForm } from "@/components/DeleteDataForm";
import { UpgradeButton } from "@/components/UpgradeButton";
import { requireUserId } from "@/lib/api";
import { createServerSupabase } from "@/services/supabase";
import type { Plan } from "@/types/billing";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: "설정 | FinSight",
  description: "플랜을 확인하고 보관 중인 금융 데이터를 지웁니다.",
};

const SECONDARY = "rounded-md border border-border-default px-4 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const profileSchema = z.object({
  plan: z.enum(["free", "pro"]),
  plan_expires_at: z.string().nullable().default(null),
});

export default async function SettingsPage(
  { searchParams }: {
    searchParams: Promise<{ checkout?: string | string[]; error?: string | string[] }>;
  },
) {
  // 체크아웃 success_url이 `?checkout=success`로 돌려보냅니다. 웹훅이 늦을 수 있어
  // 그동안 CheckoutReturn이 플랜을 잠시 폴링합니다.
  const params = await searchParams;
  const returned = params.checkout === "success";
  const signOutFailed = params.error === "signout";
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

      {returned && <CheckoutReturn plan={plan} />}

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

        {plan === "pro" ? (
          <>
            <p className="text-sm leading-relaxed text-muted">
              {expiresAt === null ? (
                // 다음 결제일은 저장하지 않습니다. 갱신·해지가 일어나는 곳에서 읽는 값이
                // 우리 DB의 사본보다 항상 정확합니다.
                "매월 자동으로 갱신됩니다. 다음 결제일과 영수증은 고객 포털에서 확인합니다."
              ) : (
                <>
                  해지가 예약돼 있습니다.{" "}
                  <span className="font-mono whitespace-nowrap tabular-nums">
                    {expiresAt.slice(0, 10).replaceAll("-", ".")}
                  </span>
                  까지 이용할 수 있습니다.
                </>
              )}
            </p>
            {/* 결제 수단 변경·영수증·해지는 Polar이 담당합니다. 같은 화면을 두 벌 만들지 않습니다. */}
            <a href="/api/billing/portal" className={`inline-block ${SECONDARY}`}>Polar 고객 포털 열기</a>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-muted">
              여러 달치 데이터가 쌓여야 의미가 생기는 기능입니다. Free에서도 업로드는 계속 쌓입니다.
            </p>
            <UpgradeButton />
          </>
        )}
      </section>

      <section
        aria-labelledby="account-heading"
        className="max-w-2xl space-y-3 rounded-md border border-border-default bg-surface p-5"
      >
        <h2 id="account-heading" className="text-sm font-medium leading-snug text-text">계정</h2>
        <p className="text-sm leading-relaxed text-text-body">
          이 브라우저에서만 로그아웃합니다. 다른 기기의 로그인과 올려 둔 데이터는 그대로 둡니다.
        </p>
        {signOutFailed && (
          <p role="alert" className="text-sm leading-relaxed text-up">
            로그아웃하지 못했습니다. 세션이 그대로 남아 있으니 다시 시도해 주세요.
          </p>
        )}
        {/* Server Action 폼이라 JS 없이도 동작합니다. 확인 절차는 두지 않습니다 — 되돌리는 비용이 로그인 한 번입니다. */}
        <form action={signOut}>
          <button type="submit" className={SECONDARY}>로그아웃</button>
        </form>
      </section>

      <DeleteDataForm />

      <nav aria-label="다음 화면" className="flex flex-wrap gap-3">
        <Link href="/dashboard" className={SECONDARY}>대시보드로 돌아가기</Link>
        <Link href="/dashboard/uploads" className={SECONDARY}>업로드 이력 보기</Link>
      </nav>
    </main>
  );
}
