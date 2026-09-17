import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CategoryBars } from "@/components/CategoryBars";
import { DetectionList } from "@/components/DetectionList";
import { EmptyDashboard } from "@/components/EmptyDashboard";
import { InsightPanel } from "@/components/InsightPanel";
import { KpiCard } from "@/components/KpiCard";
import { TransactionList } from "@/components/TransactionList";
import { TrendChart } from "@/components/TrendChart";
import { requireUserId } from "@/lib/api";
import { loadDashboard } from "@/lib/dashboard";
import { buildInsightInput, loadInsight, type Insight } from "@/lib/insights";
import { createServerSupabase, createServiceSupabase } from "@/services/supabase";
import type { Plan } from "@/types/billing";

export const metadata: Metadata = {
  title: "대시보드 | FinSight",
  description: "카테고리별 지출과 AI 월간 요약을 확인합니다.",
};

const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" });

const NAV_LINK = "rounded-md border border-border-default px-4 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** 대시보드에서 업로드·이력·설정으로 나가는 경로입니다. 막다른 화면을 만들지 않습니다. */
function DashboardNav() {
  return (
    <nav aria-label="대시보드" className="flex flex-wrap gap-3">
      <Link href="/dashboard/upload" className={NAV_LINK}>명세서 올리기</Link>
      <Link href="/dashboard/uploads" className={NAV_LINK}>업로드 이력</Link>
      <Link href="/dashboard/settings" className={NAV_LINK}>설정</Link>
    </nav>
  );
}

const profileSchema = z.object({
  plan: z.enum(["free", "pro"]),
  plan_expires_at: z.string().nullable().default(null),
});
const sourcesSchema = z.array(z.object({ label: z.string() }));

/** 캐시 기록은 service role만 한다. 키가 없는 환경에서는 캐시 없이 요약만 보여준다. */
function insightCacheWriter() {
  try {
    return createServiceSupabase();
  } catch {
    return null;
  }
}

function LockedSection({ title, body, note }: { title: string; body: string; note?: string }) {
  return (
    // 잠금은 모달로 가로막지 않고 해당 자리에 둔다. 존재는 알리고 내용은 나중에 연다.
    <div className="max-w-2xl space-y-3 rounded-md border border-border-default bg-surface p-5">
      <p className="text-xs font-medium text-muted">Pro</p>
      <h3 className="text-sm font-medium leading-snug text-text">{title}</h3>
      <p className="text-sm leading-relaxed text-text-body">{body}</p>
      {note && <p className="text-sm leading-relaxed text-text-body">{note}</p>}
      <p className="text-sm leading-relaxed text-muted">
        여러 달치 데이터가 쌓여야 의미가 생기는 기능입니다. Free에서도 업로드는 계속 쌓입니다.
      </p>
      {/* 결제 버튼은 설정 화면에 하나만 둔다. 화면당 primary 버튼은 하나이고, 이 카드는
          대시보드에 두 번 나온다 — 여기서는 텍스트 링크로 보낸다. */}
      <p className="text-sm leading-relaxed text-muted">
        월 <span className="font-mono whitespace-nowrap tabular-nums">₩9,900</span> · 언제든 해지 ·{" "}
        <Link
          href="/dashboard/settings"
          className="text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          설정에서 Pro 시작하기
        </Link>
      </p>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = createServerSupabase(await cookies());
  // 미들웨어가 이미 막지만, 세션이 끊긴 채 렌더되면 빈 화면이 되므로 한 겹 더 둔다.
  const userId = await requireUserId(supabase);
  if (!userId) redirect("/login");

  const profile = profileSchema.safeParse((await supabase.from("profiles")
    .select("plan,plan_expires_at").eq("id", userId).maybeSingle()).data);
  const now = new Date();
  const pro = profile.success && profile.data.plan === "pro"
    && (profile.data.plan_expires_at === null || Date.parse(profile.data.plan_expires_at) > now.getTime());
  const plan: Plan = pro ? "pro" : "free";

  // 플랜을 서버에서 확인하고, Pro가 아니면 상세를 조회조차 하지 않는다.
  const data = await loadDashboard(supabase, userId, plan);

  if (data.month === null) {
    return (
      <main className="mx-auto max-w-6xl space-y-10 px-6 py-10 font-sans">
        <header className="space-y-2">
          <p className="text-sm text-muted">FinSight · 대시보드</p>
          <h1 className="text-2xl font-semibold leading-snug text-text">지출 요약</h1>
        </header>
        <DashboardNav />
        <EmptyDashboard />
      </main>
    );
  }

  const sources = sourcesSchema.safeParse((await supabase.from("financial_sources")
    .select("label").eq("user_id", userId).order("created_at", { ascending: true })).data);
  const sourceLabels = sources.success ? sources.data.map((source) => source.label).join(", ") : "";

  // 캐시를 먼저 읽고 미스일 때만 모델을 호출한다(ADR-012). 실패는 이 섹션에만 표시하고
  // 나머지 대시보드는 그대로 렌더한다 — 실패를 캐싱하지 않으므로 다음 방문에 다시 시도한다.
  let insight: Insight | null = null;
  try {
    insight = await loadInsight({
      supabase, service: insightCacheWriter(), userId, plan,
      input: buildInsightInput({
        summary: data.summary, transactions: data.transactions,
        trends: data.trends, subscriptions: data.subscriptions, outliers: data.outliers,
      }),
    });
  } catch {
    insight = null;
  }

  const monthLabel = `${data.month.slice(0, 4)}년 ${Number(data.month.slice(5))}월`;
  const excluded = data.transactions.filter(
    (transaction) => transaction.kind === "income" || transaction.kind === "transfer",
  ).length;
  const deltaPercent = data.previousTotalKrw !== null && data.previousTotalKrw !== 0
    ? (data.summary.totalKrw - data.previousTotalKrw) / Math.abs(data.previousTotalKrw) * 100
    : undefined;

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-10 font-sans">
      <header className="space-y-2">
        <p className="text-sm text-muted">FinSight · 대시보드</p>
        <h1 className="text-2xl font-semibold leading-snug text-text">{monthLabel}</h1>
        <p className="text-sm leading-relaxed text-muted">
          청구월 기준{sourceLabels === "" ? "" : ` · ${sourceLabels}`}
        </p>
      </header>

      <DashboardNav />

      {/* md(768px)에서 3열로 가면 카드 폭이 원화 금액보다 좁아 숫자가 카드 밖으로 나간다. */}
      <section aria-label="월간 지출 지표" className="grid gap-4 lg:grid-cols-3">
        <KpiCard
          label="총지출 (지출 − 환불)"
          amountKrw={data.summary.totalKrw}
          deltaPercent={deltaPercent}
          hint={data.previousTotalKrw === null
            ? "비교할 전월 데이터가 없습니다. 수입·이체는 총지출에서 제외했습니다."
            : "수입·이체는 총지출에서 제외했습니다."}
        />
        <div className="min-w-0 space-y-3 rounded-md border border-border-default bg-surface p-5">
          <p className="text-xs font-medium text-muted">거래 건수</p>
          <p className="font-mono text-3xl font-semibold whitespace-nowrap tabular-nums text-text">
            {data.transactions.length}건
          </p>
          <p className="text-sm leading-relaxed text-muted">
            이 가운데 수입·이체 {excluded}건은 총지출에 넣지 않았습니다.
          </p>
        </div>
        {data.subscriptions === null ? (
          <div className="min-w-0 space-y-3 rounded-md border border-border-default bg-surface p-5">
            <p className="text-xs font-medium text-muted">정기결제 합계</p>
            <p className="font-mono text-3xl font-semibold whitespace-nowrap tabular-nums text-text">
              {won.format(data.subscriptionMonthlyKrw)}
            </p>
            <p className="text-sm leading-relaxed text-muted">
              {data.subscriptionCount === 0
                ? "이번 달 거래에서는 정기결제를 찾지 못했습니다."
                : `정기결제 ${data.subscriptionCount}건을 찾았습니다. 어떤 결제인지는 Pro에서 확인합니다.`}
            </p>
          </div>
        ) : (
          <KpiCard
            label="정기결제 합계"
            amountKrw={data.subscriptionMonthlyKrw}
            hint={`정기결제 ${data.subscriptionCount}건을 찾았습니다.`}
          />
        )}
      </section>

      {data.unclassifiedCount > 0 && (
        <p className="text-sm leading-relaxed text-muted">
          분류되지 않은 거래가 {data.unclassifiedCount}건 있습니다.{" "}
          <a
            href="#transactions"
            className="text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            거래 내역에서 카테고리 고르기
          </a>
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section aria-labelledby="category-heading" className="space-y-5 rounded-md border border-border-default bg-surface p-5">
          <h2 id="category-heading" className="text-sm font-medium leading-snug text-muted">카테고리별 지출</h2>
          <CategoryBars items={data.summary.byCategory} totalKrw={data.summary.totalKrw} />
        </section>
        <InsightPanel insight={insight} plan={plan} />
      </div>

      <section aria-labelledby="trend-heading" className="space-y-4">
        <h2 id="trend-heading" className="text-sm font-medium leading-snug text-muted">기간별 추이</h2>
        {data.trends === null ? (
          <LockedSection
            title="월별 · 카테고리별 지출 변화"
            body="6개월 이상의 명세서를 한 화면에서 비교하고, 어떤 카테고리가 언제부터 늘었는지 짚어냅니다."
            note={`지금까지 ${data.monthsHeld}개월치가 쌓였습니다.`}
          />
        ) : (
          <TrendChart months={data.trends} />
        )}
      </section>

      <section aria-labelledby="detection-heading" className="space-y-4">
        <h2 id="detection-heading" className="text-sm font-medium leading-snug text-muted">구독 누수 · 이상거래</h2>
        {data.subscriptions === null || data.outliers === null ? (
          <LockedSection
            title="구독 누수와 이상거래 탐지"
            body="정기결제로 판정된 항목과 월 합계, 금액 인상, 그리고 카테고리 중앙값에서 벗어난 거래를 찾습니다. 판정은 전부 코드로 계산합니다."
            note={data.subscriptionCount === 0
              ? "이번 달 거래에서는 정기결제를 찾지 못했습니다."
              : `당신의 데이터에서 정기결제 ${data.subscriptionCount}건, 월 ${won.format(data.subscriptionMonthlyKrw)}을 찾았습니다.`}
          />
        ) : (
          <>
            <p className="text-sm leading-relaxed text-muted">
              정기결제 판정과 이상치 판정은 모델이 아니라 코드로 계산한 결과입니다.
            </p>
            <DetectionList subscriptions={data.subscriptions} outliers={data.outliers} />
          </>
        )}
      </section>

      <section id="transactions" aria-labelledby="transactions-heading" className="space-y-4">
        <div className="space-y-2">
          <h2 id="transactions-heading" className="text-sm font-medium leading-snug text-muted">거래 내역</h2>
          <p className="text-sm leading-relaxed text-muted">{monthLabel} · {data.transactions.length}건을 표시합니다.</p>
        </div>
        <TransactionList transactions={data.transactions} />
      </section>
    </main>
  );
}
