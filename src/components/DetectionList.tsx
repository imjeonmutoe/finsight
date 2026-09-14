import type { Outlier, Subscription } from "@/types/analytics";

const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" });

export function DetectionList({ subscriptions, outliers }: {
  subscriptions: Subscription[];
  outliers: Outlier[];
}) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="min-w-0 rounded-md border border-border-default bg-surface p-5">
        <h3 className="text-sm font-medium leading-snug text-muted">정기결제 {subscriptions.length}건</h3>
        {subscriptions.length === 0 ? (
          <p className="mt-4 text-sm leading-relaxed text-muted">정기결제가 발견되지 않았습니다.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border-default">
            {subscriptions.map((subscription) => (
              <li key={subscription.merchantNorm} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm text-text">{subscription.displayName}</p>
                  <p className="text-xs leading-relaxed text-muted">{subscription.occurrences}회 결제를 확인했습니다.</p>
                  <p className="text-xs leading-relaxed text-muted">
                    최근 결제 <span className="font-mono whitespace-nowrap tabular-nums">{subscription.lastChargedOn.replaceAll("-", ".")}</span>
                  </p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="font-mono text-sm whitespace-nowrap tabular-nums text-text">{won.format(subscription.monthlyKrw)}</p>
                  <p className="text-xs leading-relaxed text-muted">월 결제액</p>
                </div>
                {subscription.amountIncreased && (
                  <p className="col-span-full text-xs leading-relaxed text-up">결제 금액이 인상되었습니다.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="min-w-0 rounded-md border border-border-default bg-surface p-5">
        <h3 className="text-sm font-medium leading-snug text-muted">이상거래 {outliers.length}건</h3>
        {outliers.length === 0 ? (
          <p className="mt-4 text-sm leading-relaxed text-muted">이상거래가 발견되지 않았습니다.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border-default">
            {outliers.map((outlier) => (
              <li key={outlier.transactionId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm text-text">{outlier.merchantRaw}</p>
                  <p className="text-xs leading-relaxed text-muted">
                    {outlier.category} 중앙값 <span className="font-mono whitespace-nowrap tabular-nums">{won.format(outlier.medianKrw)}</span>
                  </p>
                </div>
                <p className="text-right font-mono text-sm whitespace-nowrap tabular-nums text-text">{won.format(outlier.amountKrw)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
