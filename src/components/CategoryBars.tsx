import type { MonthlySummary } from "@/types/analytics";

const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" });

export function CategoryBars({ items, totalKrw }: {
  items: MonthlySummary["byCategory"];
  totalKrw: number;
}) {
  if (items.length === 0) {
    return <p className="text-sm leading-relaxed text-muted">표시할 카테고리별 지출이 없습니다.</p>;
  }

  // 환불로 순지출이 0원·음수가 되어도 막대의 길이는 유효한 범위를 유지합니다.
  const scale = Math.max(Math.abs(totalKrw), ...items.map((item) => Math.abs(item.amountKrw)), 1);

  return (
    <ul className="space-y-4">
      {[...items].sort((left, right) => right.amountKrw - left.amountKrw).map((item) => (
        <li key={item.category ?? "unclassified"} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_10rem]">
          <span className="text-sm text-text">{item.category ?? "미분류"}</span>
          <span aria-hidden="true" className="col-span-2 row-start-2 h-2 overflow-hidden rounded-sm bg-surface-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
            <span className="block h-full bg-text" style={{ width: `${Math.abs(item.amountKrw) / scale * 100}%` }} />
          </span>
          <span className="col-start-2 row-start-1 text-right font-mono text-sm whitespace-nowrap tabular-nums text-text sm:col-start-3">
            {won.format(item.amountKrw)}
          </span>
          {item.amountKrw < 0 && (
            <p className="col-span-full text-xs leading-relaxed text-muted">환불이 지출보다 많습니다.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
