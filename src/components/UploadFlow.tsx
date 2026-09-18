"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClassifyProgress } from "./ClassifyProgress";
import { MappingReview } from "./MappingReview";
import { UploadFilePicker } from "./UploadFilePicker";
import { UploadSummary } from "./UploadSummary";
import type { ClassifyResponse, ConfirmRequest, ConfirmResponse, MappingResponse } from "@/types/api";
import type { Plan } from "@/types/billing";
import type { FinancialSource } from "@/types/upload";

const STEPS = ["파일 선택", "매핑 확인", "분류 진행률", "결과 요약"];
const NETWORK_ERROR = "요청을 보내지 못했습니다. 연결을 확인하고 다시 시도해 주세요.";
const NO_PROGRESS = "더 이상 자동으로 분류되지 않습니다. 대시보드에서 직접 카테고리를 고를 수 있습니다.";
const REVIEW_NOTICE = "비슷한 거래를 찾았습니다. 아래에서 추가·중복을 정한 뒤 다시 진행해 주세요.";

const PRIMARY = "rounded-md bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

type Candidate = { dataRowIndex: number; transactionIds: string[] };
type Resume = {
  mapping: MappingResponse;
  filename: string;
  sourceKind: "card" | "bank";
  encoding: "utf-8" | "euc-kr";
};

function currentKstMonth(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function messageOf(body: Record<string, unknown>, fallback: string): string {
  return typeof body.message === "string" ? body.message : fallback;
}

export function UploadFlow({ sources, plan, limitReached, resetsAt, monthsHeld, resume = null }: {
  sources: FinancialSource[];
  plan: Plan;
  limitReached: boolean;
  resetsAt: string | null;
  monthsHeld: number;
  // 매핑 확인에서 이탈한 업로드를 이어서 진행합니다. 원본은 Storage에 있으므로
  // 파일을 다시 고르게 하지 않고 2단계부터 시작합니다.
  resume?: Resume | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(resume ? 2 : 1);
  const [list, setList] = useState(sources);
  const [listVersion, setListVersion] = useState(0);
  const [blocked, setBlocked] = useState(limitReached);
  const [resets, setResets] = useState(resetsAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mapped, setMapped] = useState<MappingResponse | null>(resume?.mapping ?? null);
  const [filename, setFilename] = useState(resume?.filename ?? "");
  const [sourceKind, setSourceKind] = useState<"card" | "bank">(resume?.sourceKind ?? "card");
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const [confirmed, setConfirmed] = useState<ConfirmResponse | null>(null);
  const [classified, setClassified] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [classifying, setClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);

  async function createSource(label: string, kind: "card" | "bank") {
    if (label === "") {
      setError("별칭을 입력해 주세요.");
      return;
    }
    setError(null);
    let response: Response;
    try {
      response = await fetch("/api/sources", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, kind }),
      });
    } catch {
      setError(NETWORK_ERROR);
      return;
    }
    const body = await readJson(response);
    if (!response.ok) {
      setError(messageOf(body, "카드·계좌를 추가하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      return;
    }
    const source = body.source as FinancialSource | undefined;
    if (!source) return;
    // 새로 만든 별칭이 바로 선택되도록 목록 앞에 두고 선택 화면을 다시 세웁니다.
    setList((current) => [source, ...current.filter((existing) => existing.id !== source.id)]);
    setListVersion((version) => version + 1);
    router.refresh();
  }

  async function upload(sourceId: string, file: File) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("sourceId", sourceId);
    form.set("file", file);
    let response: Response;
    try {
      response = await fetch("/api/uploads", { method: "POST", body: form });
    } catch {
      setBusy(false);
      setError(NETWORK_ERROR);
      return;
    }
    const body = await readJson(response);
    setBusy(false);
    if (response.status === 403 && body.code === "UPLOAD_LIMIT_REACHED") {
      // 한도 도달은 실패가 아닙니다. 에러색이 아닌 안내로 1단계에 남깁니다.
      setBlocked(true);
      setResets(typeof body.resetsAt === "string" ? body.resetsAt : null);
      return;
    }
    // 추론만 실패한 것입니다. 원본은 보관돼 있으니 1단계에 가두지 않고 직접 고르게 합니다.
    const manual = response.status === 502 && body.code === "MAPPING_FAILED";
    if (!response.ok && !manual) {
      setError(messageOf(body, "파일을 올리지 못했습니다. 잠시 후 다시 시도해 주세요."));
      return;
    }
    setMapped(body as unknown as MappingResponse);
    setFilename(file.name);
    setSourceKind(list.find((source) => source.id === sourceId)?.kind ?? "card");
    setCandidates([]);
    setError(manual ? messageOf(body, "") : null);
    setStep(2);
  }

  async function classifyAll(total: number, alreadyDone: number) {
    setClassifying(true);
    setClassifyError(null);
    let done = alreadyDone;
    // 첫 응답부터 무진척을 판정할 수 있게 시작 시점의 미분류 수를 기준으로 둡니다.
    let previous = total;
    for (;;) {
      let response: Response;
      try {
        response = await fetch("/api/transactions/classify", { method: "POST" });
      } catch {
        setClassifyError(NETWORK_ERROR);
        break;
      }
      const body = await readJson(response);
      const progressed = typeof body.classified === "number" ? body.classified : 0;
      const left = typeof body.remaining === "number" ? body.remaining : 0;
      done += progressed;
      setClassified(done);
      setRemaining(left);
      if (!response.ok) {
        // 오류에서는 자동으로 반복하지 않습니다. 재시도는 사용자가 누릅니다.
        setClassifyError(messageOf(body, "분류를 마치지 못했습니다. 잠시 후 다시 시도해 주세요."));
        break;
      }
      if (left === 0) break;
      // 진척이 없고 남은 수도 줄지 않으면 멈춥니다. 유일한 무한 루프 방어선입니다.
      if (progressed === 0 && left >= previous) {
        setClassifyError(NO_PROGRESS);
        break;
      }
      previous = left;
    }
    setClassifying(false);
    router.refresh();
  }

  async function confirm(request: ConfirmRequest) {
    if (!mapped) return;
    setBusy(true);
    setError(null);
    let response: Response;
    try {
      response = await fetch(`/api/uploads/${mapped.uploadId}/confirm`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request),
      });
    } catch {
      setBusy(false);
      setError(NETWORK_ERROR);
      return;
    }
    const body = await readJson(response);
    setBusy(false);
    if (response.status === 409 && body.code === "IMPORT_REVIEW_REQUIRED") {
      // 같은 화면에서 해결합니다. 확인을 마치면 다시 승인합니다.
      setCandidates((body.duplicateCandidates ?? []) as Candidate[]);
      setError(REVIEW_NOTICE);
      return;
    }
    if (!response.ok) {
      setError(messageOf(body, "거래를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      return;
    }
    const result = body as unknown as ConfirmResponse;
    setConfirmed(result);
    setClassified(0);
    setRemaining(result.unclassified);
    setStep(3);
    router.refresh();
    if (result.unclassified > 0) await classifyAll(result.unclassified, 0);
  }

  function restart() {
    setStep(1);
    setMapped(null);
    setConfirmed(null);
    setCandidates([]);
    setClassified(0);
    setRemaining(0);
    setClassifyError(null);
    setError(null);
  }

  return (
    <div className="space-y-10">
      <ol data-testid="upload-steps" className="flex flex-wrap gap-3">
        {STEPS.map((label, index) => {
          const position = index + 1;
          return (
            <li
              key={label}
              aria-current={position === step ? "step" : undefined}
              className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                position === step ? "border-text bg-surface-2 text-text"
                  : position < step ? "border-border-default text-muted" : "border-border-default text-disabled"}`}
            >
              <span className="font-mono text-xs tabular-nums">{position}</span>{" "}
              {label}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <UploadFilePicker
          key={listVersion} sources={list} plan={plan} limitReached={blocked} resetsAt={resets}
          busy={busy} error={error} onUpload={upload} onCreateSource={createSource}
        />
      )}

      {step === 2 && mapped && (
        <MappingReview
          mapping={mapped.mapping} confidence={mapped.confidence} preview={mapped.preview} totalRows={mapped.totalRows} headerRowIndex={mapped.headerRowIndex}
          encoding={resume?.encoding ?? "utf-8"} filename={filename}
          sourceKind={sourceKind} reused={mapped.reused}
          accountingMonth={sourceKind === "card" && mapped.mapping?.billingMonth === undefined ? currentKstMonth() : ""}
          duplicateCandidates={candidates} busy={busy} error={error}
          onConfirm={confirm} onBack={restart}
        />
      )}

      {step === 3 && confirmed && (
        <div className="space-y-4">
          <ClassifyProgress
            inserted={confirmed.inserted} duplicates={confirmed.duplicates}
            total={confirmed.unclassified} classified={classified} remaining={remaining}
            error={classifyError}
            onRetry={() => { void classifyAll(confirmed.unclassified, classified); }}
          />
          {!classifying && (
            <button type="button" className={PRIMARY} onClick={() => setStep(4)}>결과 보기</button>
          )}
        </div>
      )}

      {step === 4 && confirmed && (
        <UploadSummary
          inserted={confirmed.inserted} duplicates={confirmed.duplicates}
          classified={classified} unclassified={remaining} monthsHeld={monthsHeld}
          onRestart={restart}
        />
      )}
    </div>
  );
}
