import type { Metadata } from "next";
import { CategoryBars } from "@/components/CategoryBars";
import { DetectionList } from "@/components/DetectionList";
import { KpiCard } from "@/components/KpiCard";
import { TransactionTable } from "@/components/TransactionTable";
import { buildDemoDataset } from "@/lib/demo/dataset";

export const metadata: Metadata = {
  title: "샘플 지출 대시보드 | FinSight",
  description: "합성 명세서로 카테고리별 지출과 구독·이상거래 탐지 결과를 확인합니다.",
};

export default function DemoPage() {
  const dataset = buildDemoDataset();
  const { currentMonth } = dataset;
  const monthLabel = `${currentMonth.month.slice(0, 4)}년 ${Number(currentMonth.month.slice(5))}월`;
  const transactions = dataset.transactions
    .filter((transaction) => transaction.accountingMonth === currentMonth.month)
    .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn));

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-10 font-sans">
      <div className="space-y-6">
        <p className="rounded-md border border-border-default bg-surface px-5 py-3 text-sm leading-relaxed text-text-body">
          샘플 데이터입니다. 실제 카드 명세서가 아닙니다.
        </p>
        <header className="space-y-2">
          <p className="text-sm text-muted">FinSight · 샘플 대시보드</p>
          <h1 className="text-2xl font-semibold leading-snug text-text">{monthLabel}</h1>
          <p className="text-sm leading-relaxed text-muted">청구월 기준 · 샘플의 가장 최근 달을 표시합니다.</p>
        </header>
      </div>

      <section aria-label="월간 지출 지표" className="grid gap-4 md:grid-cols-3">
        <KpiCard label="이번 달 총지출" amountKrw={currentMonth.totalKrw} hint="지출에서 환불을 차감했습니다." />
        {dataset.previousMonthDeltaKrw === null ? (
          <div className="space-y-3 rounded-md border border-border-default bg-surface p-5">
            <p className="text-xs font-medium text-muted">전월 대비 증감</p>
            <p className="text-sm leading-relaxed text-muted">비교할 전월 데이터가 없습니다.</p>
          </div>
        ) : (
          <KpiCard
            label="전월 대비 증감"
            amountKrw={dataset.previousMonthDeltaKrw}
            deltaPercent={dataset.previousMonthDeltaPercent ?? undefined}
            hint={dataset.previousMonthDeltaPercent === null ? "전월 총지출이 0원이어서 증감률을 표시하지 않습니다." : undefined}
          />
        )}
        <KpiCard label="구독 월 합계" amountKrw={dataset.subscriptionMonthlyKrw} hint={`정기결제 ${dataset.subscriptions.length}건을 찾았습니다.`} />
      </section>

      <section aria-labelledby="insight-heading" className="space-y-3 rounded-md border border-border-default bg-surface p-5">
        <h2 id="insight-heading" className="text-sm font-medium leading-snug text-muted">AI 월간 요약</h2>
        <p className="text-sm leading-relaxed text-muted">샘플 화면에서는 AI 요약을 생성하지 않습니다.</p>
      </section>

      <section aria-labelledby="category-heading" className="space-y-5 rounded-md border border-border-default bg-surface p-5">
        <h2 id="category-heading" className="text-sm font-medium leading-snug text-muted">카테고리별 지출</h2>
        <CategoryBars items={currentMonth.byCategory} totalKrw={currentMonth.totalKrw} />
      </section>

      <section aria-labelledby="detection-heading" className="space-y-4">
        <div className="space-y-2">
          <h2 id="detection-heading" className="text-sm font-medium leading-snug text-muted">구독 누수 · 이상거래</h2>
          <p className="text-sm leading-relaxed text-muted">{dataset.months.length}개월의 샘플 거래를 기준으로 탐지했습니다.</p>
        </div>
        <DetectionList subscriptions={dataset.subscriptions} outliers={dataset.outliers} />
      </section>

      <section aria-labelledby="transactions-heading" className="space-y-4">
        <div className="space-y-2">
          <h2 id="transactions-heading" className="text-sm font-medium leading-snug text-muted">거래 내역</h2>
          <p className="text-sm leading-relaxed text-muted">{monthLabel} · {transactions.length}건을 표시합니다.</p>
        </div>
        <TransactionTable transactions={transactions} />
      </section>
    </main>
  );
}
