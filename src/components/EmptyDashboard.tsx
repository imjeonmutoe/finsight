import Link from "next/link";
import { StatementDownloadSteps } from "./StatementDownloadSteps";

const PRIMARY = "rounded-md bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const SECONDARY = "rounded-md border border-border-default px-4 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function EmptyDashboard() {
  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-md border border-border-default bg-surface p-5">
        <h2 className="text-2xl font-semibold leading-snug text-text">아직 올린 명세서가 없습니다</h2>
        <p className="text-sm leading-relaxed text-text-body">
          명세서 CSV를 올리면 지출을 분석해 드립니다. 파일을 올리면 매핑 확인까지 1분, 요약까지 5분입니다.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/dashboard/upload" className={PRIMARY} data-ph-capture-attribute-cta="empty_upload">명세서 올리기</Link>
          <Link href="/demo" className={SECONDARY} data-ph-capture-attribute-cta="empty_demo">샘플 대시보드 보기</Link>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          파일이 아직 없다면 샘플 대시보드로 결과를 먼저 볼 수 있습니다.
        </p>
      </section>

      {/* 로그인 다음의 가장 큰 이탈 지점은 "카드사에서 CSV를 받아 오기"다. 그래서 이 화면의 단일
          목표는 조회가 아니라 CSV 확보이고, 경로 안내를 접지 않고 펼친 채로 둔다(docs/UX_GUIDE.md 3.4). */}
      <details data-testid="csv-guide" open className="rounded-md border border-border-default bg-surface p-5">
        <summary className="cursor-pointer text-sm font-medium text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          카드사·은행에서 CSV 내려받는 경로
        </summary>
        <div className="mt-4 space-y-3">
          <StatementDownloadSteps />
          <p className="text-sm leading-relaxed text-muted">여러 달치를 한 파일로 합쳐 받으면 업로드 1회로 계산됩니다.</p>
        </div>
      </details>
    </div>
  );
}
