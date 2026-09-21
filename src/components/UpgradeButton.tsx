"use client";

import { useState } from "react";

const PRIMARY = "rounded-md bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:bg-surface-2 disabled:text-disabled disabled:hover:opacity-100";

const NETWORK_ERROR = "결제 화면을 열지 못했습니다. 연결을 확인하고 다시 시도해 주세요.";
const CHECKOUT_ERROR = "지금은 결제를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.";

/** Polar 체크아웃으로 보냅니다. 세션 생성은 서버가 합니다 — 토큰은 클라이언트에 없습니다. */
export function UpgradeButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    let response: Response;
    try {
      response = await fetch("/api/billing/checkout", {
        method: "POST", headers: { "content-type": "application/json" },
      });
    } catch {
      setBusy(false);
      setError(NETWORK_ERROR);
      return;
    }
    const body = await response.json().catch(() => ({})) as { url?: unknown; message?: unknown };
    if (!response.ok || typeof body.url !== "string") {
      setBusy(false);
      setError(typeof body.message === "string" ? body.message : CHECKOUT_ERROR);
      return;
    }
    // 이동 중에는 잠긴 상태를 유지합니다. 되돌아오면 화면이 새로 렌더됩니다.
    window.location.assign(body.url);
  }

  return (
    <div className="space-y-3">
      <button
        type="button" className={PRIMARY} disabled={busy}
        onClick={() => { void start(); }}
      >
        {busy ? "결제 화면을 여는 중입니다" : "Pro 시작하기"}
      </button>
      <p className="text-sm leading-relaxed text-muted">
        월 <span className="font-mono whitespace-nowrap tabular-nums">₩9,900</span> · 언제든 해지
      </p>
      <p className="text-sm leading-relaxed text-muted">
        샌드박스 결제입니다. 실제 청구는 발생하지 않습니다.
      </p>
      {error && <p role="alert" className="text-sm leading-relaxed text-up">{error}</p>}
    </div>
  );
}
