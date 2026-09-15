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
    // 간격은 서로 다른 결제일로만 셉니다. 기프트카드 동시 결제나 재시도 청구로 생긴 간격 0이
    // 끼면 every 조건이 그 가맹점의 구독을 통째로 버립니다.
    const dates = [...new Set(payments.map((payment) => payment.occurredOn))];
    if (dates.length < 3) continue;
    const regularIntervals = dates.every((date, index) => {
      const previous = dates[index - 1];
      if (!previous) return true;
      const days = (Date.parse(date) - Date.parse(previous)) / DAY_MS;
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

// medians는 queries.ts가 SQL로 계산한 값이며 이 함수에서 다시 집계하지 않습니다.
// 표본 하한도 medians가 판정합니다 — 표본 3건 미만 카테고리는 0으로 옵니다. 여기서 다시 세면
// 넘겨받은 부분집합만 세게 되어, 전체 표본은 충분한 카테고리를 통째로 놓칩니다.
export function detectOutliers(transactions: Transaction[], medians: Record<Category, number>): Outlier[] {
  const outliers: Outlier[] = [];
  for (const transaction of transactions) {
    const category = transaction.category;
    if (transaction.kind !== "expense" || category === null) continue;
    const medianKrw = medians[category] ?? 0;
    if (medianKrw <= 0) continue;
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
