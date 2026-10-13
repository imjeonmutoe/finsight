"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
// 루트 레이아웃을 대신하므로 서체와 전역 스타일을 직접 불러온다(Next 16 error.md의 Global Error).
import "./fonts/pretendard.css";
import "./globals.css";

// 원인과 다음 행동을 함께 준다(docs/UX_GUIDE.md 5). error 객체의 내용은 표시하지 않는다 —
// 거래 내용이 메시지에 섞여 있을 수 있다. 테마는 globals.css가 OS 설정을 따라 정한다.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  reset: () => void;
}) {
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  return (
    <html lang="ko">
      <body className="bg-bg text-text antialiased">
        <main className="mx-auto max-w-6xl space-y-3 px-6 py-16">
          <h1 className="text-2xl font-semibold leading-snug text-text">화면을 불러오지 못했습니다</h1>
          <p className="text-sm leading-relaxed text-text-body">
            잠시 후 다시 시도해 주세요. 계속 실패하면 페이지를 새로 고쳐 주세요.
          </p>
          <button
            type="button"
            onClick={retry}
            className="rounded-md bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            다시 시도하기
          </button>
        </main>
      </body>
    </html>
  );
}
