// 빈 대시보드와 업로드 화면이 같은 안내를 쓴다. 카드사별 메뉴 경로는 직접 확인할 수 없고 자주 바뀌어
// 적지 않는다 — 두 화면이 같은 카드사를 서로 다르게 안내했던 적이 있다(ADR-018).
// 카드사 URL도 같은 이유로 링크를 걸지 않는다.
const STEPS: { kind: string; path: string }[] = [
  { kind: "카드", path: "카드사 웹사이트 로그인 → 이용내역 조회 또는 이용대금명세서 → 엑셀 내려받기" },
  { kind: "은행", path: "은행 웹사이트 로그인 → 조회 → 거래내역 조회 → 엑셀 내려받기" },
];

export function StatementDownloadSteps() {
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border-default">
        {STEPS.map((step) => (
          <li key={step.kind} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3">
            <span className="text-sm text-text">{step.kind}</span>
            <span className="text-sm leading-relaxed text-text-body">{step.path}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm leading-relaxed text-muted">
        화면 이름은 카드사마다 다를 수 있습니다. 엑셀 또는 CSV 내려받기 메뉴를 찾으면 됩니다.
      </p>
    </div>
  );
}
