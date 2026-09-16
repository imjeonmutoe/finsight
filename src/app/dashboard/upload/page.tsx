import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { UploadFlow } from "@/components/UploadFlow";
import { kstMonthStart, nextKstMonthStart, requireUserId } from "@/lib/api";
import { getMonthlyTrend } from "@/lib/queries";
import { createServerSupabase } from "@/services/supabase";
import type { Plan } from "@/types/billing";
import type { FinancialSource } from "@/types/upload";

// 추이 조회에 쓰는 개월 수입니다. "1개월치뿐인가"만 판단하므로 1년이면 충분합니다.
const TREND_MONTHS = 12;

const sourcesSchema = z.array(z.object({
  id: z.string(), label: z.string(), kind: z.enum(["card", "bank"]),
}));
const profileSchema = z.object({
  plan: z.enum(["free", "pro"]),
  plan_expires_at: z.string().nullable().default(null),
});

export default async function UploadPage() {
  const supabase = createServerSupabase(await cookies());
  // 미들웨어가 이미 막지만, 세션이 끊긴 채 렌더되면 빈 화면이 되므로 한 겹 더 둡니다.
  const userId = await requireUserId(supabase);
  if (!userId) redirect("/login");

  const sources = sourcesSchema.safeParse((await supabase.from("financial_sources")
    .select("id,label,kind").eq("user_id", userId).order("created_at", { ascending: true })).data);

  const profile = profileSchema.safeParse((await supabase.from("profiles")
    .select("plan,plan_expires_at").eq("id", userId).maybeSingle()).data);
  const now = new Date();
  const pro = profile.success && profile.data.plan === "pro"
    && (profile.data.plan_expires_at === null || Date.parse(profile.data.plan_expires_at) > now.getTime());
  const plan: Plan = pro ? "pro" : "free";

  // 라우트와 같은 기준으로 셉니다. 카운터 테이블을 두지 않습니다(ADR-005).
  const { count } = await supabase.from("uploads").select("id", { count: "exact", head: true })
    .eq("user_id", userId).in("status", ["mapped", "parsed"]).gte("created_at", kstMonthStart(now));
  const limitReached = !pro && (count ?? 0) >= 1;

  // 집계는 step 6의 queries.ts만 씁니다. 여기서 다시 구현하지 않습니다.
  let monthsHeld = 0;
  try {
    monthsHeld = (await getMonthlyTrend(supabase, userId, TREND_MONTHS))
      .filter((summary) => summary.byCategory.length > 0).length;
  } catch {
    // 추이를 읽지 못해도 업로드는 계속할 수 있어야 합니다. 안내 문구만 보수적으로 감춥니다.
    monthsHeld = TREND_MONTHS;
  }

  const list: FinancialSource[] = sources.success ? sources.data : [];

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-16">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold leading-snug text-text">명세서 올리기</h1>
        <p className="text-sm leading-relaxed text-text-body">
          파일을 올리면 매핑 확인까지 1분, 요약까지 5분입니다.
        </p>
      </header>

      <UploadFlow
        sources={list}
        plan={plan}
        limitReached={limitReached}
        resetsAt={limitReached ? nextKstMonthStart(now) : null}
        monthsHeld={monthsHeld}
      />
    </main>
  );
}
