"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Plan } from "@/types/billing";

const SECONDARY = "rounded-md border border-border-default px-4 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const PRIMARY = "rounded-md bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const POLL_INTERVAL_MS = 1_500;
// 무한 폴링을 두지 않습니다. 여기서 멈추고 사용자가 직접 다시 확인합니다.
const POLL_TIMEOUT_MS = 10_000;

/**
 * 체크아웃을 마치고 돌아온 직후입니다. 웹훅이 아직 도착하지 않았을 수 있으므로 서버
 * 컴포넌트를 몇 초간 다시 태워 플랜을 확인합니다. 플랜 자체는 서버가 읽습니다 —
 * 이 컴포넌트는 `router.refresh()`만 돌리고 결과는 prop으로 받습니다.
 */
export function CheckoutReturn({ plan }: { plan: Plan }) {
  const router = useRouter();
  // 렌더 중에는 Date.now()를 읽지 않습니다. 첫 effect에서 한 번만 마감 시각을 세웁니다.
  const deadline = useRef<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (plan === "pro" || waited) return;
    const until = deadline.current ?? Date.now() + POLL_TIMEOUT_MS;
    deadline.current = until;
    const timer = setTimeout(() => {
      if (Date.now() >= until) {
        setWaited(true);
        return;
      }
      router.refresh();
      // 다음 시도를 예약하기 위해 이 effect를 다시 돌립니다.
      setAttempt((value) => value + 1);
    }, POLL_INTERVAL_MS);
    return () => { clearTimeout(timer); };
  }, [plan, waited, attempt, router]);

  if (plan === "pro") {
    return (
      <section
        aria-labelledby="checkout-return-heading"
        className="max-w-2xl space-y-3 rounded-md border border-border-default bg-surface p-5"
      >
        <h2 id="checkout-return-heading" className="text-sm font-medium leading-snug text-muted">결제</h2>
        {/* 축하 화면에서 끝내지 않습니다. 방금 열린 화면으로 보냅니다. */}
        <p role="status" className="text-sm leading-relaxed text-text-body">
          Pro가 활성화되었습니다. 기간별 추이 · 구독 누수 · 이상거래가 열렸습니다.
        </p>
        <Link href="/dashboard" className={PRIMARY}>대시보드로</Link>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="checkout-return-heading"
      className="max-w-2xl space-y-3 rounded-md border border-border-default bg-surface p-5"
    >
      <h2 id="checkout-return-heading" className="text-sm font-medium leading-snug text-muted">결제</h2>
      {/* 기다리는 중은 실패가 아니므로 에러색을 쓰지 않습니다. */}
      <p role="status" className="text-sm leading-relaxed text-muted">
        {waited
          ? "아직 결제 확인이 오지 않았습니다. 결제가 끝났다면 잠시 후 다시 확인해 주세요."
          : "결제를 확인하는 중입니다. 잠시만 기다려 주세요."}
      </p>
      {waited && (
        <button
          type="button"
          className={SECONDARY}
          onClick={() => {
            deadline.current = Date.now() + POLL_TIMEOUT_MS;
            setWaited(false);
            router.refresh();
          }}
        >
          다시 확인하기
        </button>
      )}
    </section>
  );
}
