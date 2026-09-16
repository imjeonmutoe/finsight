import "server-only";

import { detectOutliers, detectSubscriptions } from "./analytics";
import {
  getCategoryMedians, getMonthlyTrend, getTransactionsForMerchants, getTransactionsForMonth,
  type QueriesClient,
} from "./queries";
import type { MonthlySummary, Outlier, Subscription } from "@/types/analytics";
import type { Plan } from "@/types/billing";
import type { Transaction } from "@/types/transaction";

/** 추이를 조회하는 범위. 쌓인 개월 수를 세는 데도 같은 결과를 쓴다. */
export const TREND_MONTHS = 12;
/** 화면에 그리는 개월 수. 조회 범위보다 짧게 잘라 표가 가로로 넘치지 않게 한다. */
export const TREND_WINDOW = 6;

export type DashboardData = {
  /** 표시할 거래가 하나도 없으면 null이며 화면은 빈 상태(S3)를 그린다. */
  month: string | null;
  summary: MonthlySummary;
  previousTotalKrw: number | null;
  transactions: Transaction[];
  unclassifiedCount: number;
  monthsHeld: number;
  /** 코드로 계산한 요약 수치. Free 잠금 카드의 한 줄이 이 값을 쓴다. */
  subscriptionCount: number;
  subscriptionMonthlyKrw: number;
  /** 아래 셋은 Pro 전용 상세다. Free에서는 null이라 응답 본문에 실리지 않는다. */
  trends: MonthlySummary[] | null;
  subscriptions: Subscription[] | null;
  outliers: Outlier[] | null;
};

const EMPTY: DashboardData = {
  month: null, summary: { month: "", totalKrw: 0, byCategory: [] }, previousTotalKrw: null,
  transactions: [], unclassifiedCount: 0, monthsHeld: 0,
  subscriptionCount: 0, subscriptionMonthlyKrw: 0,
  trends: null, subscriptions: null, outliers: null,
};

/**
 * 대시보드(S3~S6)가 그릴 데이터를 모은다. 합계는 전부 queries.ts의 SQL 집계에서 오고
 * 여기서 다시 더하지 않는다. 탐지는 analytics.ts의 순수 함수가 한다.
 *
 * Pro 게이팅은 이 함수에서 끝난다 — Free 호출은 상세 배열을 만들지도, 조회하지도 않으므로
 * 화면이 CSS로 가릴 것 자체가 없다.
 */
export async function loadDashboard(
  supabase: QueriesClient, userId: string, plan: Plan,
): Promise<DashboardData> {
  const trend = await getMonthlyTrend(supabase, userId, TREND_MONTHS);
  // byCategory가 빈 달은 그 달에 지출·환불 거래가 없었다는 뜻이다.
  const held = trend.filter((month) => month.byCategory.length > 0);
  const summary = held.at(-1);
  if (!summary) return EMPTY;

  const index = trend.findIndex((month) => month.month === summary.month);
  const previous = index > 0 ? trend[index - 1] : undefined;
  const transactions = await getTransactionsForMonth(supabase, userId, summary.month);

  // 정기결제는 이번 달에도 청구된 가맹점만 후보로 둔다. 후보의 지난 달치는 탐지 함수가 본다.
  const merchants = [...new Set(transactions
    .filter((transaction) => transaction.kind === "expense")
    .map((transaction) => transaction.merchantNorm))];
  const subscriptions = detectSubscriptions(await getTransactionsForMerchants(supabase, userId, merchants));
  const subscriptionMonthlyKrw = subscriptions.reduce((sum, subscription) => sum + subscription.monthlyKrw, 0);

  const shared = {
    month: summary.month,
    summary,
    previousTotalKrw: previous && previous.byCategory.length > 0 ? previous.totalKrw : null,
    transactions,
    unclassifiedCount: summary.byCategory.find((item) => item.category === null)?.count ?? 0,
    monthsHeld: held.length,
    subscriptionCount: subscriptions.length,
    subscriptionMonthlyKrw,
  };

  if (plan !== "pro") return { ...shared, trends: null, subscriptions: null, outliers: null };

  return {
    ...shared,
    trends: trend.slice(-TREND_WINDOW),
    subscriptions,
    outliers: detectOutliers(transactions, await getCategoryMedians(supabase, userId)),
  };
}
