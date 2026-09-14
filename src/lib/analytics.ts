import type { Outlier, Subscription } from "@/types/analytics";
import type { Category } from "@/types/category";
import type { Transaction } from "@/types/transaction";

const DAY_MS = 86_400_000;

export function detectSubscriptions(transactions: Transaction[]): Subscription[] {
  const merchants = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    if (transaction.kind !== "expense") continue;
    const payments = merchants.get(transaction.merchantNorm) ?? [];
    payments.push(transaction);
    merchants.set(transaction.merchantNorm, payments);
  }

  const subscriptions: Subscription[] = [];
  for (const [merchantNorm, payments] of merchants) {
    if (payments.length < 3) continue;
    payments.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id.localeCompare(b.id));
    const regularIntervals = payments.every((payment, index) => {
      const previous = payments[index - 1];
      if (!previous) return true;
      const days = (Date.parse(payment.occurredOn) - Date.parse(previous.occurredOn)) / DAY_MS;
      return days >= 26 && days <= 35;
    });
    if (!regularIntervals) continue;

    // 평균 대비 ±10%. 나눗셈 없이 정수로 비교해 반올림과 합계 정밀도 손실을 피합니다.
    // 10,000 / 10,000 / 11,500원은 평균 10,500원 기준으로 모두 범위 안입니다.
    let total = 0n;
    for (const payment of payments) total += BigInt(payment.amountKrw);
    const count = BigInt(payments.length);
    const stableAmounts = payments.every((payment) => {
      const difference = BigInt(payment.amountKrw) * count - total;
      return (difference < 0n ? -difference : difference) * 10n <= total;
    });
    if (!stableAmounts) continue;

    const latest = payments.at(-1);
    const previous = payments.at(-2);
    if (!latest || !previous) continue;
    subscriptions.push({
      merchantNorm,
      displayName: latest.merchantRaw,
      monthlyKrw: latest.amountKrw,
      occurrences: payments.length,
      lastChargedOn: latest.occurredOn,
      amountIncreased: BigInt(latest.amountKrw) * 10n > BigInt(previous.amountKrw) * 11n,
    });
  }
  return subscriptions.sort((a, b) => a.merchantNorm.localeCompare(b.merchantNorm));
}

// 표본 부족을 판정할 수 있도록 분석 대상 카테고리의 지출들을 함께 전달합니다.
// medians는 queries.ts가 SQL로 계산한 값이며 이 함수에서 다시 집계하지 않습니다.
export function detectOutliers(transactions: Transaction[], medians: Record<Category, number>): Outlier[] {
  const counts = new Map<Category, number>();
  for (const transaction of transactions) {
    if (transaction.kind !== "expense" || transaction.category === null) continue;
    counts.set(transaction.category, (counts.get(transaction.category) ?? 0) + 1);
  }

  const outliers: Outlier[] = [];
  for (const transaction of transactions) {
    const category = transaction.category;
    if (transaction.kind !== "expense" || category === null || (counts.get(category) ?? 0) < 3) continue;
    const medianKrw = medians[category];
    if (transaction.amountKrw < 30_000 || BigInt(transaction.amountKrw) <= BigInt(medianKrw) * 3n) continue;
    outliers.push({
      transactionId: transaction.id,
      merchantRaw: transaction.merchantRaw,
      amountKrw: transaction.amountKrw,
      category,
      medianKrw,
    });
  }
  return outliers;
}
