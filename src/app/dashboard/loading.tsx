// 로딩은 정적 placeholder 블록으로 처리한다. shimmer·스켈레톤 애니메이션은 쓰지 않는다
// (docs/UI_GUIDE.md 애니메이션).
export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-6xl space-y-3 px-6 py-16">
      <p className="text-sm leading-relaxed text-muted">대시보드를 불러오는 중입니다.</p>
      <div className="h-8 w-48 rounded-md bg-surface-2" />
      <div className="h-5 w-72 rounded-md bg-surface-2" />
    </main>
  );
}
