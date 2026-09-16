import Link from "next/link";

const PRIMARY = "rounded-md bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const SECONDARY = "rounded-md border border-border-default px-4 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function UploadSummary({ inserted, duplicates, classified, unclassified, monthsHeld, onRestart }: {
  inserted: number;
  duplicates: number;
  classified: number;
  unclassified: number;
  monthsHeld: number;
  onRestart: () => void;
}) {
  return (
    <div className="space-y-4">
      <section data-testid="upload-result" className="space-y-3 rounded-md border border-border-default bg-surface p-5">
        <h2 className="text-sm font-medium text-muted">저장 결과</h2>
        <p className="font-mono text-3xl font-semibold whitespace-nowrap tabular-nums text-text">
          {inserted}건 추가 · {duplicates}건 중복
        </p>
        <p className="font-mono text-sm tabular-nums text-text-body">자동 분류 {classified}건을 마쳤습니다.</p>
        <p className="text-sm leading-relaxed text-muted">원본 CSV는 Storage에 보관되며 언제든 다시 파싱할 수 있습니다.</p>
      </section>

      {unclassified > 0 && (
        <p data-testid="unclassified-notice" className="text-sm leading-relaxed text-muted">
          분류되지 않은 거래 {unclassified}건이 남았습니다. 대시보드에서 직접 카테고리를 고를 수 있습니다.
        </p>
      )}

      {/* 추이는 Pro 기능이지만, 데이터가 쌓여야 Pro의 가치가 보입니다(ADR-005). */}
      {monthsHeld <= 1 && (
        <p data-testid="months-hint" className="text-sm leading-relaxed text-text-body">
          지난달 명세서도 올려보세요 — 지출 추이를 보려면 2개월 이상이 필요합니다.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard" className={PRIMARY}>대시보드에서 보기</Link>
        <button type="button" className={SECONDARY} onClick={onRestart}>다른 파일 올리기</button>
      </div>
    </div>
  );
}
