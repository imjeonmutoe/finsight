const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" });
const percent = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1, signDisplay: "exceptZero" });

export function KpiCard({ label, amountKrw, deltaPercent, hint }: {
  label: string;
  amountKrw: number;
  deltaPercent?: number;
  hint?: string;
}) {
  const deltaColor = deltaPercent === undefined || deltaPercent === 0
    ? "text-muted" : deltaPercent > 0 ? "text-up" : "text-down";

  return (
    <dl className="min-w-0 space-y-3 rounded-md border border-border-default bg-surface p-5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="font-mono text-3xl font-semibold tabular-nums text-text">{won.format(amountKrw)}</dd>
      {deltaPercent !== undefined && (
        <dd className="flex flex-wrap items-baseline gap-3 text-sm leading-relaxed">
          <span className={`font-mono tabular-nums ${deltaColor}`}>{percent.format(deltaPercent)}%</span>
          <span className="text-muted">{deltaPercent > 0 ? "증가" : deltaPercent < 0 ? "감소" : "변동 없음"}</span>
        </dd>
      )}
      {hint && <dd className="text-sm leading-relaxed text-muted">{hint}</dd>}
    </dl>
  );
}
