"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TransactionTable } from "./TransactionTable";
import type { Category } from "@/types/category";
import type { Transaction, TransactionKind } from "@/types/transaction";

const NETWORK_ERROR = "요청을 보내지 못했습니다. 연결을 확인하고 다시 시도해 주세요.";
const WRITE_ERROR = "거래를 고치지 못했습니다. 잠시 후 다시 시도해 주세요.";

/**
 * 거래 목록의 인라인 수정을 담당한다. 수정은 PATCH /api/transactions/[id]가 하고, 집계는
 * router.refresh()로 Server Component를 다시 태워 받는다 — 화면에서 합계를 다시 계산하지 않는다.
 * 수정한 뒤 목록을 다시 정렬하지 않는다: 방금 고친 행이 사라지면 취소된 것처럼 보인다.
 */
export function TransactionList({ transactions }: { transactions: Transaction[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(transactions);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patch(id: string, body: { category: Category } | { kind: TransactionKind }) {
    setPendingId(id);
    setError(null);
    let response: Response;
    try {
      response = await fetch(`/api/transactions/${id}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
    } catch {
      setPendingId(null);
      setError(NETWORK_ERROR);
      return;
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = await response.json() as Record<string, unknown>;
    } catch {
      payload = {};
    }
    setPendingId(null);
    if (!response.ok) {
      // 실패하면 화면의 값도 그대로 둔다. 서버와 화면이 갈리지 않는다.
      setError(typeof payload.message === "string" ? payload.message : WRITE_ERROR);
      return;
    }

    setRows((current) => current.map((row) => row.id === id
      ? {
        ...row,
        category: "category" in body ? body.category : row.category,
        categorySource: "category" in body ? "user" : row.categorySource,
        kind: "kind" in body ? body.kind : row.kind,
      }
      : row));
    // 총지출·카테고리 집계와 AI 요약 캐시 판정이 바뀐다. Server Component를 다시 태운다.
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm leading-relaxed text-up">{error}</p>}
      <TransactionTable
        transactions={rows}
        pendingId={pendingId}
        onCategoryChange={(id, category) => { void patch(id, { category }); }}
        onKindChange={(id, kind) => { void patch(id, { kind }); }}
      />
      <p className="text-sm leading-relaxed text-muted">
        카테고리를 고치면 가맹점 규칙으로 저장되어 다음 업로드부터 자동 적용됩니다.
      </p>
    </div>
  );
}
