"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { UploadStatus } from "@/types/upload";

const SECONDARY = "rounded-md border border-border-default px-4 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const DESTRUCTIVE = "rounded-md border border-up px-4 py-2 text-sm text-up hover:bg-up/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:border-border-default disabled:text-disabled disabled:hover:bg-transparent";

const COUNT_ERROR = "함께 삭제될 거래 건수를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.";
const DELETE_ERROR = "업로드를 지우지 못했습니다. 잠시 후 다시 시도해 주세요.";
const STALE_NOTE = "처리가 중단되었습니다. 같은 파일을 다시 올리면 이어서 진행합니다.";

export type UploadHistoryItem = {
  id: string;
  filename: string;
  sourceLabel: string;
  createdAt: string;
  status: UploadStatus;
  insertedCount: number;
  duplicateCount: number;
  errorMessage: string | null;
};

/** 업로드 일시는 사용자의 달력과 같아야 하므로 KST로 보여줍니다. */
function kstParts(iso: string): { date: string; time: string } {
  const kst = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${kst.getUTCFullYear()}.${pad(kst.getUTCMonth() + 1)}.${pad(kst.getUTCDate())}`,
    time: `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`,
  };
}

type View = { label: string; note: string | null; resumable: boolean; retryable: boolean; deletable: boolean };

/**
 * pending이 요청 제한시간을 넘겨 남아 있으면 요청이 죽은 것으로 보고 실패로 보여줍니다.
 * 행을 실제로 고쳐 쓰지는 않습니다 — 목록을 여는 것만으로 DB를 바꾸지 않기 위해서고,
 * 같은 파일을 다시 올리면 `POST /api/uploads`가 그 행을 그대로 재사용합니다.
 */
function viewOf(item: UploadHistoryItem, staleBefore: string): View {
  if (item.status === "pending") {
    return Date.parse(item.createdAt) < Date.parse(staleBefore)
      ? { label: "실패", note: STALE_NOTE, resumable: false, retryable: true, deletable: true }
      : { label: "처리 중", note: "파일을 읽고 매핑을 추론하는 중입니다.", resumable: false, retryable: false, deletable: false };
  }
  if (item.status === "mapped") {
    return {
      label: "미완료", note: "매핑 확인이 남았습니다. 거래는 아직 저장되지 않았습니다.",
      resumable: true, retryable: false, deletable: true,
    };
  }
  if (item.status === "failed") {
    return { label: "실패", note: item.errorMessage, resumable: false, retryable: true, deletable: true };
  }
  return { label: "완료", note: null, resumable: false, retryable: false, deletable: true };
}

export function UploadHistory({ uploads, staleBefore }: {
  uploads: UploadHistoryItem[];
  staleBefore: string;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openDialog(id: string) {
    setTarget(id);
    setCount(null);
    setBusy(false);
    setError(null);
    // 건수는 서버가 실제로 센 값만 씁니다. 저장 시점 스냅샷(inserted_count)은 추정치입니다.
    let response: Response;
    try {
      response = await fetch(`/api/uploads/${id}`, { method: "GET" });
    } catch {
      setError(COUNT_ERROR);
      return;
    }
    if (!response.ok) {
      setError(COUNT_ERROR);
      return;
    }
    const body = await response.json().catch(() => ({})) as { transactionCount?: unknown };
    if (typeof body.transactionCount !== "number") {
      setError(COUNT_ERROR);
      return;
    }
    setCount(body.transactionCount);
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    let response: Response;
    try {
      response = await fetch(`/api/uploads/${id}`, { method: "DELETE" });
    } catch {
      setBusy(false);
      setError(DELETE_ERROR);
      return;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: unknown };
      setBusy(false);
      setError(typeof body.message === "string" ? body.message : DELETE_ERROR);
      return;
    }
    setBusy(false);
    setTarget(null);
    router.refresh();
  }

  if (uploads.length === 0) {
    return (
      <div className="space-y-4 rounded-md border border-border-default bg-surface p-5">
        <p className="text-sm leading-relaxed text-muted">아직 올린 명세서가 없습니다.</p>
        <Link href="/dashboard/upload" className={SECONDARY}>명세서 올리기</Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border-default rounded-md border border-border-default bg-surface">
      {uploads.map((item) => {
        const view = viewOf(item, staleBefore);
        const when = kstParts(item.createdAt);
        const open = target === item.id;

        return (
          <li key={item.id} data-testid="upload-row" className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-text">{item.sourceLabel}</p>
                <p className="text-sm leading-relaxed text-text-body">{item.filename}</p>
                <time dateTime={item.createdAt} className="block font-mono text-xs tabular-nums text-muted">
                  <span className="whitespace-nowrap">{when.date}</span>{" "}
                  <span className="whitespace-nowrap">{when.time}</span>
                </time>
              </div>
              <div className="space-y-1 sm:text-right">
                {/* 상태를 색만으로 전하지 않습니다. 라벨 글자가 항상 함께 있습니다. */}
                <p className={`text-sm ${view.label === "실패" ? "text-up" : "text-muted"}`}>{view.label}</p>
                <p className="font-mono text-sm whitespace-nowrap tabular-nums text-text">
                  {item.insertedCount}건 추가 · {item.duplicateCount}건 중복
                </p>
              </div>
            </div>

            {view.note && <p className="text-sm leading-relaxed text-muted">{view.note}</p>}

            <div className="flex flex-wrap gap-3">
              {view.resumable && (
                <Link href={`/dashboard/upload?resume=${item.id}`} className={SECONDARY}>이어서 진행</Link>
              )}
              {view.retryable && <Link href="/dashboard/upload" className={SECONDARY}>다시 올리기</Link>}
              {view.deletable && !open && (
                <button type="button" className={DESTRUCTIVE} onClick={() => { void openDialog(item.id); }}>
                  삭제
                </button>
              )}
            </div>

            {open && (
              // 브라우저 confirm을 쓰지 않습니다. 스타일을 맞출 수 없고 자동화 도구를 멈춰 세웁니다.
              <div
                role="dialog" aria-labelledby={`delete-${item.id}`}
                className="space-y-3 rounded-md border border-up bg-bg p-5"
              >
                <h3 id={`delete-${item.id}`} className="text-sm font-medium leading-snug text-text">
                  이 업로드를 지울까요?
                </h3>
                {/* ADR-008: CASCADE를 유지하는 조건이 이 고지다. 건수를 생략하지 않는다. */}
                <p className="text-sm leading-relaxed text-text-body">
                  {count === null
                    ? "함께 삭제될 거래 건수를 세는 중입니다."
                    : `이 업로드에서 가져온 거래 ${count}건이 함께 삭제됩니다.`}
                </p>
                <p className="text-sm leading-relaxed text-text-body">
                  다른 파일에도 있던 거래라면 그 파일을 다시 올려야 복구됩니다.
                </p>
                {error && <p role="alert" className="text-sm leading-relaxed text-up">{error}</p>}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button" className={DESTRUCTIVE} disabled={count === null || busy}
                    onClick={() => { void remove(item.id); }}
                  >
                    삭제합니다
                  </button>
                  <button type="button" className={SECONDARY} onClick={() => setTarget(null)}>취소</button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
