"use client";

import { useRef, useState } from "react";
import { MAX_CSV_ROWS, MAX_FILE_BYTES } from "@/lib/limits";
import type { Plan } from "@/types/billing";
import type { FinancialSource } from "@/types/upload";

const MEGABYTE = 1_000_000;
const rowFormat = new Intl.NumberFormat("ko-KR");
const SIZE_ERROR = `파일이 ${MAX_FILE_BYTES / MEGABYTE}MB를 넘습니다. 기간을 나눠 다시 올려 주세요.`;
const TYPE_ERROR = "CSV 파일만 올릴 수 있습니다. 명세서를 CSV로 내려받아 주세요.";

const PRIMARY = "rounded-md bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:bg-disabled focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const SECONDARY = "rounded-md border border-border-default px-4 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const FIELD = "rounded-md border border-border-default bg-bg px-3 py-2 text-sm text-text placeholder:text-disabled focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// 카드사 이름과 경로만 적습니다. 접힌 상태로 두는 것은 점진적 공개입니다(docs/UX_GUIDE.md 3.4).
const GUIDES = [
  "신한카드 · 마이신한 > 이용내역 조회 > 엑셀 내려받기",
  "삼성카드 · 이용대금명세서 > 상세내역 > 엑셀 내려받기",
  "국민은행 · 조회 > 입출금거래내역 > 파일 내려받기",
];

function resetDate(resetsAt: string): string {
  // KST 기준 날짜로 보여줍니다. 사용자의 달력과 한도 안내가 어긋나지 않게 합니다.
  const kst = new Date(Date.parse(resetsAt) + 9 * 60 * 60 * 1000);
  return [
    kst.getUTCFullYear(),
    String(kst.getUTCMonth() + 1).padStart(2, "0"),
    String(kst.getUTCDate()).padStart(2, "0"),
  ].join(".");
}

export function UploadFilePicker({ sources, plan, limitReached, resetsAt, busy, error, onUpload, onCreateSource }: {
  sources: FinancialSource[];
  plan: Plan;
  limitReached: boolean;
  resetsAt: string | null;
  busy: boolean;
  error: string | null;
  onUpload: (sourceId: string, file: File) => void;
  onCreateSource: (label: string, kind: "card" | "bank") => void;
}) {
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"card" | "bank">("card");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 클라이언트 검증은 안내일 뿐입니다. 같은 상한을 서버가 실제 bytes로 다시 검사합니다.
  function accept(next: File | undefined) {
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".csv")) {
      setFile(null);
      setLocalError(TYPE_ERROR);
      return;
    }
    if (next.size > MAX_FILE_BYTES) {
      setFile(null);
      setLocalError(SIZE_ERROR);
      return;
    }
    setLocalError(null);
    setFile(next);
  }

  const message = error ?? localError;
  const ready = file !== null && sourceId !== "" && !limitReached;

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-md border border-border-default bg-surface p-5">
        <div className="space-y-3">
          <label htmlFor="upload-source" className="block text-xs font-medium text-muted">카드 · 계좌 별칭</label>
          {sources.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted">
              등록한 카드·계좌가 없습니다. 별칭을 먼저 추가해 주세요.
            </p>
          ) : (
            <select
              id="upload-source" value={sourceId} disabled={limitReached}
              onChange={(event) => setSourceId(event.target.value)}
              className={`w-full ${FIELD} disabled:text-disabled`}
            >
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label} · {source.kind === "card" ? "카드" : "은행"}
                </option>
              ))}
            </select>
          )}
          <p className="text-sm leading-relaxed text-muted">
            한 파일은 한 카드·계좌의 내역이어야 합니다. 섞여 있으면 파일을 나눠 올려 주세요.
          </p>
        </div>

        {adding ? (
          <div data-testid="new-source-form" className="space-y-3 rounded-md border border-border-default bg-bg p-4">
            <div className="space-y-3">
              <label htmlFor="new-source-label" className="block text-xs font-medium text-muted">별칭</label>
              <input
                id="new-source-label" value={label} onChange={(event) => setLabel(event.target.value)}
                placeholder="신한카드 (생활)" className={`w-full ${FIELD}`}
              />
            </div>
            <div className="space-y-3">
              <label htmlFor="new-source-kind" className="block text-xs font-medium text-muted">종류</label>
              <select
                id="new-source-kind" value={kind} className={`w-full ${FIELD}`}
                onChange={(event) => setKind(event.target.value === "bank" ? "bank" : "card")}
              >
                <option value="card">카드</option>
                <option value="bank">은행</option>
              </select>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              카드번호·계좌번호는 저장하지 않습니다. 구분할 수 있는 이름만 적어 주세요.
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className={SECONDARY} onClick={() => onCreateSource(label.trim(), kind)}>
                추가하기
              </button>
              <button type="button" className={SECONDARY} onClick={() => setAdding(false)}>취소</button>
            </div>
          </div>
        ) : (
          <button type="button" className={SECONDARY} onClick={() => setAdding(true)}>새 별칭 추가</button>
        )}

        <div
          data-testid="upload-dropzone"
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!limitReached) accept(event.dataTransfer.files[0]);
          }}
          className={`space-y-3 rounded-md border border-dashed p-8 text-center ${
            dragging ? "border-accent bg-surface-2" : "border-border-default bg-bg"}`}
        >
          <p className="text-sm text-text">CSV 파일을 여기에 놓기</p>
          <p data-testid="upload-limits" className="text-sm leading-relaxed text-muted">
            <span className="font-mono tabular-nums">파일당 {MAX_FILE_BYTES / MEGABYTE}MB</span>
            {" · "}
            <span className="font-mono tabular-nums">{rowFormat.format(MAX_CSV_ROWS)}행까지</span>
          </p>
          <p className="text-sm leading-relaxed text-muted">EUC-KR · UTF-8 인코딩을 자동으로 감지합니다.</p>
          <label htmlFor="upload-file" className={`inline-block cursor-pointer ${SECONDARY}`}>파일 선택</label>
          <input
            ref={inputRef} id="upload-file" type="file" accept=".csv,text/csv"
            aria-label="CSV 파일 선택" disabled={limitReached} className="sr-only"
            onChange={(event) => accept(event.target.files?.[0])}
          />
          {file && <p className="text-sm text-text">{file.name}</p>}
        </div>

        {message && (
          <p role="alert" className="text-sm leading-relaxed text-up">{message}</p>
        )}

        {limitReached ? (
          <p data-testid="upload-limit-notice" className="text-sm leading-relaxed text-muted">
            이번 달 무료 업로드를 이미 사용했습니다.
            {resetsAt ? ` ${resetDate(resetsAt)}에 초기화됩니다.` : " 다음 달 1일에 초기화됩니다."}
            {" "}기존 데이터 열람·수정·재분류는 계속 가능합니다.
            여러 달치를 한 파일로 합쳐 올리면 1회로 계산됩니다.
          </p>
        ) : plan === "free" ? (
          <p className="text-sm leading-relaxed text-muted">
            Free는 KST 캘린더 월 기준 1회입니다. 매핑 추론이 실패한 업로드와 동일 파일 재업로드는 횟수를 소비하지 않습니다.
            여러 달치를 한 파일로 합쳐 올리면 1회로 계산됩니다.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-muted">원본은 Storage에 보관되며 언제든 다시 파싱할 수 있습니다.</p>
        )}

        {ready && (
          <button
            type="button" disabled={busy} className={PRIMARY}
            onClick={() => { if (file) onUpload(sourceId, file); }}
          >
            {busy ? "올리는 중입니다" : "이 파일 올리기"}
          </button>
        )}
      </section>

      <details className="rounded-md border border-border-default bg-surface p-5">
        <summary className="cursor-pointer text-sm text-text">카드사·은행에서 CSV 내려받는 곳</summary>
        <ul className="mt-3 space-y-3">
          {GUIDES.map((guide) => (
            <li key={guide} className="text-sm leading-relaxed text-text-body">{guide}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
