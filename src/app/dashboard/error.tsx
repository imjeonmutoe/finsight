"use client";

// 에러 경계는 Client Component여야 한다. 원인과 다음 행동을 함께 준다(docs/UX_GUIDE.md 5).
// error 객체의 내용은 표시하지 않는다 — 거래 내용이 메시지에 섞여 있을 수 있다.
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-6xl space-y-3 px-6 py-16">
      <h1 className="text-2xl font-semibold leading-snug text-text">대시보드를 불러오지 못했습니다</h1>
      <p className="text-sm leading-relaxed text-text-body">
        잠시 후 다시 시도해 주세요. 계속 실패하면 로그인 상태를 확인해 주세요.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        다시 시도하기
      </button>
    </main>
  );
}
