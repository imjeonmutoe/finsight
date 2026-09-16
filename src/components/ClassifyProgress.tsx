import Link from "next/link";

const SECONDARY = "rounded-md border border-border-default px-4 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function ClassifyProgress({ inserted, duplicates, total, classified, remaining, error, onRetry }: {
  inserted: number;
  duplicates: number;
  total: number;
  classified: number;
  remaining: number;
  error: string | null;
  onRetry: () => void;
}) {
  const percent = total === 0 ? 100 : Math.round((classified / total) * 100);

  return (
    <div className="space-y-4">
      {/* 파싱 결과를 먼저 보여줍니다. 분류가 끝나기를 기다리게 하지 않습니다. */}
      <section data-testid="parse-result" className="space-y-3 rounded-md border border-border-default bg-surface p-5">
        <h2 className="text-sm font-medium text-muted">파싱 결과</h2>
        <p className="font-mono text-3xl font-semibold whitespace-nowrap tabular-nums text-text">
          {inserted}건 추가 · {duplicates}건 중복
        </p>
        <p className="text-sm leading-relaxed text-muted">거래는 이미 저장했습니다. 분류만 남았습니다.</p>
      </section>

      <section className="space-y-3 rounded-md border border-border-default bg-surface p-5">
        <h2 className="text-sm font-medium text-muted">분류</h2>
        {total === 0 ? (
          <p className="text-sm leading-relaxed text-text-body">
            규칙으로 모두 분류했습니다. 모델을 호출하지 않았습니다.
          </p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-text-body">거래를 분류하는 중입니다.</p>
            <div className="flex flex-wrap items-baseline gap-3">
              <span data-testid="classify-progress-text" className="font-mono text-sm tabular-nums text-text">
                {total}건 중 {classified}건을 분류했습니다.
              </span>
              <span className="font-mono text-sm tabular-nums text-muted">{percent}%</span>
            </div>
            {/* 진행률은 정적 막대입니다. shimmer·스켈레톤 애니메이션을 쓰지 않습니다. */}
            <div
              role="progressbar" aria-label="분류 진행률"
              aria-valuenow={classified} aria-valuemin={0} aria-valuemax={total}
              className="h-2 w-full overflow-hidden rounded-md bg-surface-2"
            >
              <div className="h-full bg-text" style={{ width: `${percent}%` }} />
            </div>
            <p className="font-mono text-sm tabular-nums text-muted">남은 거래 {remaining}건</p>
          </>
        )}
        <p className="text-sm leading-relaxed text-muted">
          중간에 창을 닫아도 미분류 거래는 그대로 남아 다음 방문에 이어서 분류됩니다.
        </p>
      </section>

      {error && (
        <section className="space-y-3">
          <p role="alert" className="text-sm leading-relaxed text-up">{error}</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={SECONDARY} onClick={onRetry}>다시 시도하기</button>
            <Link href="/dashboard" className={SECONDARY}>대시보드에서 직접 고치기</Link>
          </div>
        </section>
      )}
    </div>
  );
}
