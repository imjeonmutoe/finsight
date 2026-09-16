import { categoryColor } from "@/lib/palette";
import type { MonthlySummary } from "@/types/analytics";
import { CATEGORIES } from "@/types/category";
import type { Category } from "@/types/category";

const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" });
const signedWon = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", signDisplay: "exceptZero" });

function monthLabel(month: string): string {
  return `${Number(month.slice(5))}월`;
}

function amountOf(month: MonthlySummary, category: Category | null): number {
  return month.byCategory.find((item) => item.category === category)?.amountKrw ?? 0;
}

/**
 * 총지출 막대와 카테고리별 표를 함께 둔다. 막대는 크기만 전달하고 숫자는 표가 전부 보여준다 —
 * 카테고리 색은 라이트 모드에서 표면 대비가 낮아, 색 옆에 항상 이름과 금액이 글자로 있어야 한다
 * (src/lib/palette.ts). 금액은 축약하지 않는다(docs/UI_GUIDE.md).
 */
export function TrendChart({ months }: { months: MonthlySummary[] }) {
  const latest = months.at(-1);
  if (!latest) {
    return <p className="text-sm leading-relaxed text-muted">표시할 기간별 추이가 없습니다.</p>;
  }

  const previous = months.at(-2);
  const scale = Math.max(...months.map((month) => Math.abs(month.totalKrw)), 1);
  const hasNegative = months.some((month) => month.totalKrw < 0);
  const rows = [...CATEGORIES, null].filter(
    (category) => months.some((month) => amountOf(month, category) !== 0),
  );

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-md border border-border-default bg-surface p-5">
        <p className="text-sm leading-relaxed text-muted">
          가장 최근 달 총지출은{" "}
          <span className="font-mono whitespace-nowrap tabular-nums text-text">{won.format(latest.totalKrw)}</span>
          입니다.
        </p>
        <ul data-testid="trend-bars" className="flex items-end gap-2 sm:gap-3">
          {months.map((month) => (
            <li key={month.month} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <span className="flex h-32 w-full items-end justify-center">
                {/* 막대는 가늘게 두고 가장 최근 달만 진하게 둔다. 전 구간을 같은 굵기·같은
                    농도로 칠하면 어느 달을 보고 있는지가 사라진다. */}
                <span
                  data-testid="trend-bar"
                  aria-hidden="true"
                  className={`block w-full max-w-12 rounded-t-sm ${month.month === latest.month ? "bg-text" : "bg-neutral-line"}`}
                  style={{ height: `${Math.abs(month.totalKrw) / scale * 100}%` }}
                />
              </span>
              <span className="font-mono text-xs tabular-nums text-muted">{monthLabel(month.month)}</span>
            </li>
          ))}
        </ul>
        {hasNegative && (
          <p className="text-sm leading-relaxed text-muted">
            환불이 지출보다 많은 달이 있어 막대는 크기만 나타냅니다.
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-border-default bg-surface">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">카테고리별 월 지출</caption>
          <thead className="bg-surface-2 text-xs font-medium text-muted">
            <tr>
              <th scope="col" className="px-3 py-3 font-medium sm:px-5">카테고리</th>
              {months.map((month) => (
                <th key={month.month} scope="col" className="px-3 py-3 text-right font-medium sm:px-5">
                  {monthLabel(month.month)}
                </th>
              ))}
              {previous && <th scope="col" className="px-3 py-3 text-right font-medium sm:px-5">전월 대비</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((category) => {
              const delta = previous ? amountOf(latest, category) - amountOf(previous, category) : 0;
              return (
                <tr key={category ?? "unclassified"} className="border-b border-border-default last:border-b-0">
                  <th scope="row" className="px-3 py-3 font-normal whitespace-nowrap text-text sm:px-5">
                    <span
                      aria-hidden="true"
                      className="mr-2 inline-block size-2 rounded-xs align-middle"
                      style={{ backgroundColor: categoryColor(category) }}
                    />
                    {category ?? "미분류"}
                  </th>
                  {months.map((month) => (
                    <td key={month.month} className="px-3 py-3 text-right font-mono whitespace-nowrap tabular-nums text-text-body sm:px-5">
                      {won.format(amountOf(month, category))}
                    </td>
                  ))}
                  {previous && (
                    <td className="px-3 py-3 text-right whitespace-nowrap sm:px-5">
                      <span className={`font-mono tabular-nums ${delta > 0 ? "text-up" : delta < 0 ? "text-down" : "text-muted"}`}>
                        {signedWon.format(delta)}
                      </span>{" "}
                      <span className="text-xs text-muted">
                        {delta > 0 ? "증가" : delta < 0 ? "감소" : "변동 없음"}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
