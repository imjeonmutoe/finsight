"use client";

import { useState } from "react";
import { MAPPING_LABEL_TEXT, isSensitiveHeader } from "@/lib/mapping-labels";
import type { ConfirmRequest, DuplicateDecision } from "@/types/api";
import type { ColumnMapping, MappingLabel } from "@/types/upload";

// 이 값 아래면 상세를 펼쳐 시작합니다. 위면 "이대로 진행" 한 번으로 끝냅니다.
const CONFIDENT = 0.8;
const ASSIGNABLE: MappingLabel[] = ["date", "merchant", "amount", "deposit", "withdrawal",
  "krwEquivalent", "transactionKind", "transactionId", "billingMonth", "unknown"];

const PRIMARY = "rounded-md bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:bg-disabled focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const SECONDARY = "rounded-md border border-border-default px-4 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const FIELD = "rounded-md border border-border-default bg-bg px-3 py-2 text-sm text-text focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BADGE = "rounded-md border border-border-default bg-surface-2 px-3 py-1 text-xs font-medium text-muted";
const SEGMENT = "rounded-md border px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function initialLabels(mapping: ColumnMapping | null, columns: number): MappingLabel[] {
  const labels: MappingLabel[] = Array.from({ length: columns }, () => "unknown");
  for (const label of ASSIGNABLE) {
    if (label === "unknown" || !mapping) continue;
    const index = mapping[label];
    if (index !== undefined && index >= 0 && index < columns) labels[index] = label;
  }
  return labels;
}

function toMapping(labels: MappingLabel[], skipRows: number): ColumnMapping | null {
  const indexOf = (label: MappingLabel) => {
    const index = labels.indexOf(label);
    return index < 0 ? undefined : index;
  };
  const date = indexOf("date");
  const merchant = indexOf("merchant");
  const amount = indexOf("amount");
  const deposit = indexOf("deposit");
  const withdrawal = indexOf("withdrawal");
  const krwEquivalent = indexOf("krwEquivalent");
  if (date === undefined || merchant === undefined
    || [amount, deposit, withdrawal, krwEquivalent].every((index) => index === undefined)) {
    return null;
  }
  return {
    date, merchant, skipRows,
    ...(amount === undefined ? {} : { amount }),
    ...(deposit === undefined ? {} : { deposit }),
    ...(withdrawal === undefined ? {} : { withdrawal }),
    ...(krwEquivalent === undefined ? {} : { krwEquivalent }),
    ...(indexOf("transactionKind") === undefined ? {} : { transactionKind: indexOf("transactionKind") }),
    ...(indexOf("transactionId") === undefined ? {} : { transactionId: indexOf("transactionId") }),
    ...(indexOf("billingMonth") === undefined ? {} : { billingMonth: indexOf("billingMonth") }),
  };
}

type Decision = { action: "keep" | "duplicate"; transactionId?: string };

/**
 * 중복으로 정한 행마다 서로 다른 기존 거래를 물립니다. 후보 목록은 날짜·금액이 같은 거래를 모은
 * 것이라 여러 행이 똑같은 목록을 받습니다. 모두 첫 거래를 기본값으로 쓰면 서버가
 * INVALID_DECISION으로 되돌립니다 — 한 거래를 여러 행에 물리면 정상 거래가 사라지기 때문입니다.
 * 직접 고른 값을 먼저 확정한 뒤 나머지를 남은 거래로 채웁니다. 새 행이 기존 거래보다 많으면
 * 남는 행은 물릴 곳이 없어 undefined가 되고, 화면이 진행을 막습니다.
 */
function assignTargets(
  candidates: { dataRowIndex: number; transactionIds: string[] }[],
  decisions: Record<number, Decision>,
): Map<number, string | undefined> {
  const chosen = [...candidates]
    .sort((left, right) => left.dataRowIndex - right.dataRowIndex)
    .filter((candidate) => decisions[candidate.dataRowIndex]?.action === "duplicate");
  const taken = new Set<string>();
  const targets = new Map<number, string | undefined>();

  for (const candidate of chosen) {
    const picked = decisions[candidate.dataRowIndex]?.transactionId;
    if (picked === undefined) continue;
    // 같은 거래를 두 행에 직접 고르면 뒤엣것은 물릴 곳이 없습니다. 말없이 옮기지 않습니다.
    const free = !taken.has(picked);
    targets.set(candidate.dataRowIndex, free ? picked : undefined);
    if (free) taken.add(picked);
  }
  for (const candidate of chosen) {
    if (targets.has(candidate.dataRowIndex)) continue;
    const free = candidate.transactionIds.find((id) => !taken.has(id));
    targets.set(candidate.dataRowIndex, free);
    if (free !== undefined) taken.add(free);
  }
  return targets;
}

export function MappingReview({
  mapping, confidence, preview, totalRows, headerRowIndex, encoding, filename, sourceKind, reused,
  accountingMonth, duplicateCandidates, busy, error, onConfirm, onBack,
}: {
  mapping: ColumnMapping | null;
  confidence: number;
  preview: string[][];
  totalRows: number;
  headerRowIndex: number;
  encoding: "utf-8" | "euc-kr";
  filename: string;
  sourceKind: "card" | "bank";
  reused: boolean;
  accountingMonth: string;
  duplicateCandidates: { dataRowIndex: number; transactionIds: string[] }[];
  busy: boolean;
  error: string | null;
  onConfirm: (request: ConfirmRequest) => void;
  onBack: () => void;
}) {
  // 추론이 실패하면 서버가 찾아둔 헤더 행을 쓴다. 0으로 되돌리면 제목 행이 컬럼 이름이 된다.
  const skipRows = mapping?.skipRows ?? headerRowIndex;
  const headers = preview[skipRows] ?? [];
  const [labels, setLabels] = useState(() => initialLabels(mapping, headers.length));
  const [chosenEncoding, setChosenEncoding] = useState(encoding);
  const [month, setMonth] = useState(accountingMonth);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [open, setOpen] = useState(mapping === null || confidence < CONFIDENT);

  function assign(index: number, label: MappingLabel) {
    setLabels((current) => current.map((existing, position) => {
      if (position === index) return label;
      // 한 필드는 한 컬럼만 가리킵니다. 같은 라벨을 쓰던 컬럼은 사용 안 함으로 비웁니다.
      return label !== "unknown" && existing === label ? "unknown" : existing;
    }));
  }

  const nextMapping = toMapping(labels, skipRows);
  const needsMonth = sourceKind === "card" && nextMapping?.billingMonth === undefined && month === "";
  const undecided = duplicateCandidates.filter((candidate) => decisions[candidate.dataRowIndex] === undefined);
  const targets = assignTargets(duplicateCandidates, decisions);
  const unassigned = duplicateCandidates.filter((candidate) =>
    decisions[candidate.dataRowIndex]?.action === "duplicate" && targets.get(candidate.dataRowIndex) === undefined);
  const ready = nextMapping !== null && !needsMonth && undecided.length === 0 && unassigned.length === 0;

  function confirm() {
    if (!nextMapping) return;
    const duplicateDecisions: DuplicateDecision[] = [...duplicateCandidates]
      .sort((left, right) => left.dataRowIndex - right.dataRowIndex)
      .flatMap<DuplicateDecision>((candidate) => {
        const decision = decisions[candidate.dataRowIndex];
        if (!decision) return [];
        if (decision.action === "keep") return [{ dataRowIndex: candidate.dataRowIndex, action: "keep" as const }];
        return [{
          dataRowIndex: candidate.dataRowIndex, action: "duplicate" as const,
          transactionId: targets.get(candidate.dataRowIndex) ?? "",
        }];
      });
    onConfirm({
      mapping: nextMapping, encoding: chosenEncoding, duplicateDecisions,
      ...(sourceKind === "card" ? { accountingMonth: month } : {}),
    });
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-md border border-border-default bg-surface p-5">
        <div className="flex flex-wrap gap-3">
          <span className={BADGE}>{chosenEncoding === "euc-kr" ? "EUC-KR 감지" : "UTF-8 감지"}</span>
          <span className={BADGE}>{filename}</span>
          {sourceKind === "card" && month !== "" && <span className={BADGE}>청구월 {month}</span>}
        </div>
        <p className="text-sm leading-relaxed text-muted">
          인코딩을 감지하고 첫 20행의 컬럼 의미·형식만으로 매핑을 추론합니다. 원본 값은 추론에 사용하지 않습니다.
        </p>
        {reused && (
          <p className="text-sm leading-relaxed text-muted">
            이미 올린 파일입니다. 저장된 매핑을 그대로 재사용하며 이번 업로드는 한 달 횟수를 소비하지 않았습니다.
          </p>
        )}
        {mapping === null || confidence < CONFIDENT ? (
          <p className="text-sm leading-relaxed text-text-body">
            컬럼 의미를 확신하지 못했습니다. 아래 매핑을 확인해 주세요.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-text-body">
            아래 미리보기의 가맹점명이 한글로 보이면 그대로 진행해 주세요.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-md border border-border-default bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-medium text-muted">원본 미리보기</h2>
          {/* 제목·헤더 행이 미리보기를 거의 채우면 나머지가 안 들어간 것으로 읽힙니다. */}
          <p className="text-sm text-muted">총 {totalRows}행 중 처음 {preview.length}행</p>
        </div>
        <div className="overflow-x-auto rounded-md border border-border-default">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">원본 미리보기</caption>
            <tbody>
              {preview.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border-default last:border-b-0">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={`px-3 py-3 whitespace-nowrap ${rowIndex === skipRows ? "bg-surface-2 text-xs font-medium text-muted" : "text-text-body"}`}
                    >
                      {isSensitiveHeader(headers[cellIndex] ?? "") && rowIndex !== skipRows ? "(제거됨)" : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {duplicateCandidates.length > 0 && (
        <section className="space-y-3 rounded-md border border-border-default bg-surface p-5">
          <h2 className="text-sm font-medium text-muted">확인이 필요한 항목</h2>
          <p className="text-sm leading-relaxed text-text-body">
            확인이 필요한 거래가 {duplicateCandidates.length}건 있습니다. 전부 정한 뒤 진행할 수 있습니다.
          </p>
          {/* 같은 파일을 다시 올리면 수백 행이 전부 후보가 됩니다. 하나씩 누르게 두지 않습니다. */}
          {duplicateCandidates.length > 1 && (
            <div className="flex flex-wrap gap-3">
              {([["duplicate", "전부 기존 거래와 중복"], ["keep", "전부 별도 거래로 추가"]] as const).map(([action, text]) => (
                <button
                  key={action} type="button" className={SECONDARY}
                  onClick={() => setDecisions((current) => Object.fromEntries(duplicateCandidates.map((candidate) => {
                    const existing = current[candidate.dataRowIndex];
                    // 같은 쪽으로 일괄 지정할 때는 직접 고른 기존 거래를 지우지 않습니다.
                    return [candidate.dataRowIndex, existing?.action === action ? existing : { action }];
                  })))}
                >
                  {text}
                </button>
              ))}
            </div>
          )}
          {/* 행이 수백 개일 수 있습니다. 막힌 행이 몇 건인지와 그리로 가는 길이 함께 있어야 합니다. */}
          {unassigned[0] !== undefined && (
            <p className="text-sm leading-relaxed text-up">
              기존 거래가 모자라 정하지 못한 행이 {unassigned.length}건 있습니다.{" "}
              <a href={`#duplicate-row-${unassigned[0].dataRowIndex}`} className="underline">첫 행으로 가기</a>
            </p>
          )}
          <ul className="space-y-3">
            {duplicateCandidates.map((candidate) => {
              const decision = decisions[candidate.dataRowIndex];
              return (
                <li
                  key={candidate.dataRowIndex}
                  id={`duplicate-row-${candidate.dataRowIndex}`}
                  data-testid={`duplicate-${candidate.dataRowIndex}`}
                  className="space-y-3 rounded-md border border-border-default bg-bg p-4"
                >
                  {/* 행 번호만 보여줍니다. 거래 내용과 내부 해시는 화면에 올리지 않습니다. */}
                  <p className="font-mono text-sm tabular-nums text-text">{candidate.dataRowIndex + 1}번째 거래 행</p>
                  <p className="text-sm leading-relaxed text-muted">기존 거래와 날짜·금액이 같습니다. 중복인가요?</p>
                  <div className="flex flex-wrap gap-3">
                    {([["keep", "별도 거래로 추가"], ["duplicate", "기존 거래와 중복"]] as const).map(([action, text]) => (
                      <button
                        key={action} type="button"
                        onClick={() => setDecisions((current) => ({
                          ...current, [candidate.dataRowIndex]: { action },
                        }))}
                        className={`${SEGMENT} ${decision?.action === action
                          ? "border-text bg-surface-2 text-text" : "border-border-default text-muted hover:bg-surface-2"}`}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                  {decision?.action === "duplicate" && targets.get(candidate.dataRowIndex) === undefined && (
                    <p className="text-sm leading-relaxed text-up">
                      물릴 기존 거래가 남지 않았습니다. 다른 거래를 고르거나 별도 거래로 추가해 주세요.
                    </p>
                  )}
                  {decision?.action === "duplicate" && candidate.transactionIds.length > 1 && (
                    <div className="space-y-3">
                      <label htmlFor={`duplicate-target-${candidate.dataRowIndex}`} className="block text-xs font-medium text-muted">
                        중복으로 볼 기존 거래
                      </label>
                      <select
                        id={`duplicate-target-${candidate.dataRowIndex}`} className={`w-full ${FIELD}`}
                        value={targets.get(candidate.dataRowIndex) ?? ""}
                        onChange={(event) => setDecisions((current) => ({
                          ...current,
                          [candidate.dataRowIndex]: { action: "duplicate", transactionId: event.target.value },
                        }))}
                      >
                        {targets.get(candidate.dataRowIndex) === undefined && (
                          <option value="" disabled>고를 수 있는 거래 없음</option>
                        )}
                        {candidate.transactionIds.map((id, position) => (
                          <option key={id} value={id}>기존 거래 {position + 1}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <details
        open={open} onToggle={(event) => setOpen(event.currentTarget.open)}
        className="space-y-3 rounded-md border border-border-default bg-surface p-5"
      >
        <summary className="cursor-pointer text-sm text-text">컬럼 매핑 직접 고치기</summary>
        <div className="mt-3 space-y-4">
          <div className="overflow-x-auto rounded-md border border-border-default">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">컬럼 매핑</caption>
              <thead className="bg-surface-2 text-xs font-medium text-muted">
                <tr>
                  <th scope="col" className="px-3 py-3 font-medium">원본 컬럼</th>
                  <th scope="col" className="px-3 py-3 font-medium">매핑 대상</th>
                  <th scope="col" className="px-3 py-3 font-medium">사용 여부</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((header, index) => {
                  const masked = isSensitiveHeader(header);
                  const label = labels[index] ?? "unknown";
                  return (
                    <tr key={index} className="border-b border-border-default last:border-b-0">
                      <td className={`px-3 py-3 ${masked || label === "unknown" ? "text-muted" : "text-text"}`}>{header}</td>
                      <td className="px-3 py-3">
                        {masked ? (
                          <span className="text-muted">(제거됨)</span>
                        ) : (
                          <select
                            aria-label={`${header} 매핑 대상`} value={label} className={FIELD}
                            onChange={(event) => assign(index, event.target.value as MappingLabel)}
                          >
                            {ASSIGNABLE.map((option) => (
                              <option key={option} value={option}>{MAPPING_LABEL_TEXT[option]}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-3 text-muted">
                        {masked ? "모델에 보내지 않습니다" : label === "unknown" ? "사용 안 함" : "사용"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3">
            <label htmlFor="mapping-encoding" className="block text-xs font-medium text-muted">인코딩</label>
            <select
              id="mapping-encoding" value={chosenEncoding} className={FIELD}
              onChange={(event) => setChosenEncoding(event.target.value === "euc-kr" ? "euc-kr" : "utf-8")}
            >
              <option value="utf-8">UTF-8</option>
              <option value="euc-kr">EUC-KR</option>
            </select>
          </div>

          {sourceKind === "card" && (
            <div className="space-y-3">
              <label htmlFor="mapping-month" className="block text-xs font-medium text-muted">카드 청구월</label>
              <input
                id="mapping-month" type="month" value={month} className={FIELD}
                onChange={(event) => setMonth(event.target.value)}
              />
            </div>
          )}
        </div>
      </details>

      {error && <p role="alert" className="text-sm leading-relaxed text-up">{error}</p>}
      {nextMapping === null && (
        <p className="text-sm leading-relaxed text-text-body">날짜·가맹점과 금액 컬럼을 골라 주세요.</p>
      )}
      {needsMonth && (
        <p className="text-sm leading-relaxed text-text-body">
          청구월 컬럼이 없습니다. 명세서의 청구월을 입력해 주세요.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy || !ready} className={PRIMARY} onClick={confirm}>
          {busy ? "저장하는 중입니다" : "이대로 진행"}
        </button>
        <button type="button" className={SECONDARY} onClick={onBack}>뒤로</button>
      </div>
    </div>
  );
}
