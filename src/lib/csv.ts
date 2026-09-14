import { createHash } from "node:crypto";
import type { ParsedTransaction, TransactionKind } from "@/types/transaction";
import type { ColumnMapping, ImportContext } from "@/types/upload";
import { computeCandidateHash, computeDedupeHash } from "./dedupe";
import { normalizeMerchant } from "./merchant";
import { buildSanitizedMappingInput, sanitizeMerchantForLlm } from "./sanitize";

export function parseCsvRows(text: string): string[][] {
  const input = text.replace(/^\ufeff/, "");
  if (!input.trim()) return [];
  const invalid = () => new Error("CSV 형식이 올바르지 않습니다. 파일의 구분자와 따옴표를 확인해 주세요.");
  let json = false;
  if (/^[{[]/.test(input.trimStart())) {
    try {
      JSON.parse(input);
      json = true;
    } catch {
      // 대괄호로 시작하는 요약문도 CSV에 포함될 수 있습니다.
    }
  }
  if (json || input.trimStart().startsWith("<") || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input)) {
    throw invalid();
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;
  const finishRow = () => {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    row = [];
    cell = "";
    closedQuote = false;
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === undefined) break;
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        cell += character;
      }
    } else if (character === ",") {
      row.push(cell);
      cell = "";
      closedQuote = false;
    } else if (character === "\r" || character === "\n") {
      finishRow();
      if (character === "\r" && input[index + 1] === "\n") index += 1;
    } else if (closedQuote) {
      if (character !== " " && character !== "\t") throw invalid();
    } else if (character === '"') {
      if (cell !== "") throw invalid();
      quoted = true;
    } else {
      cell += character;
    }
  }
  if (quoted) throw invalid();
  finishRow();
  if (rows.length > 0 && !rows.some((values) => values.length > 1)) throw invalid();
  return rows;
}

export function detectHeaderRow(rows: string[][]): number {
  if (rows.length === 0) return 0;
  let bestIndex = -1;
  let bestScore = 1;
  let fallback = -1;
  for (const [index, row] of rows.entries()) {
    if (row.length < 2) continue;
    if (fallback < 0) fallback = index;
    const labels = new Set(buildSanitizedMappingInput(row, [], index).columns.map((column) => column.label));
    labels.delete("unknown");
    if (labels.size > bestScore) {
      bestScore = labels.size;
      bestIndex = index;
    }
  }
  if (bestIndex >= 0) return bestIndex;
  if (fallback >= 0) return fallback; // 의미가 불명확한 헤더는 다음 단계에서 수동 매핑합니다.
  throw new Error("CSV 헤더를 찾지 못했습니다. 파일의 컬럼 구분자를 확인해 주세요.");
}

export function parseAmount(raw: string): number {
  const invalid = () => new Error("금액 형식이 올바르지 않거나 허용 범위를 넘었습니다. 금액 컬럼을 확인해 주세요.");
  let value = raw.normalize("NFKC").replace(/\s/g, "");
  const parentheses = value.startsWith("(") && value.endsWith(")");
  if (parentheses) value = value.slice(1, -1);
  const match = value.match(/^([+-]?)₩?((?:\d+|\d{1,3}(?:,\d{3})+))(?:\.(\d+))?원?$/);
  const whole = match?.[2];
  if (whole === undefined || (parentheses && match?.[1] !== "")) throw invalid();
  // 소수 문자열의 첫 자리로 반올림합니다. 금액을 부동소수점으로 변환하지 않습니다.
  const firstDecimal = match?.[3]?.[0] ?? "0";
  const rounded = BigInt(whole.replace(/,/g, "")) + (firstDecimal >= "5" ? 1n : 0n);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid();
  const amount = Number(rounded);
  return parentheses || match?.[1] === "-" ? -amount : amount;
}

export function parseDate(raw: string): string {
  const value = raw.trim()
    .replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3")
    .replace(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/, "$1-$2-$3");
  const match = value.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (!match || year < 1 || days === undefined || day < 1 || day > days
    || Number(match[4] ?? 0) > 23 || Number(match[5] ?? 0) > 59 || Number(match[6] ?? 0) > 59) {
    throw new Error("날짜 형식이 올바르지 않습니다. 날짜 컬럼과 실제 달력 날짜를 확인해 주세요.");
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseAccountingMonth(raw: string): string {
  const value = raw.trim()
    .replace(/^(\d{4})(\d{2})$/, "$1-$2")
    .replace(/^(\d{4})년\s*(\d{1,2})월$/, "$1-$2");
  try {
    return parseDate(/^\d{4}[-./]\d{1,2}$/.test(value) ? `${value}-01` : value).slice(0, 7);
  } catch {
    throw new Error("카드 청구월을 확인해 주세요. 명세서의 청구월을 선택하거나 직접 입력해 주세요.");
  }
}

const kindDictionary: Record<string, TransactionKind> = {
  expense: "expense", 지출: "expense", 출금: "expense", 결제: "expense", 승인: "expense", 구매: "expense", 일시불: "expense", 할부: "expense",
  income: "income", 수입: "income", 입금: "income", 급여: "income", 급여입금: "income", 월급: "income",
  refund: "refund", 환불: "refund", 취소: "refund", 승인취소: "refund", 결제취소: "refund", 매출취소: "refund", 부분취소: "refund", 환급: "refund",
  transfer: "transfer", 이체: "transfer", 계좌이체: "transfer", 본인계좌이체: "transfer", 본인계좌간이체: "transfer", 카드대금: "transfer", 카드대금납부: "transfer",
};

function readCell(row: string[], index: number | undefined): string {
  if (index === undefined) return "";
  const value = row[index];
  if (value === undefined) throw new Error("선택한 컬럼이 없습니다. 매핑과 행의 컬럼 수를 확인해 주세요.");
  return value;
}

function safeReference(raw: string): string | null {
  const reference = raw.trim();
  if (!reference || reference.length > 200) return null;
  // 짧은 숫자 승인번호는 허용합니다. 길거나 구분자가 있는 개인정보 패턴은 보존하지 않습니다.
  if (!/^\d{1,9}$/.test(reference) && sanitizeMerchantForLlm(reference) !== reference) return null;
  return createHash("sha256").update(reference).digest("hex");
}

export function buildTransactions(
  rows: string[][], mapping: ColumnMapping, context: ImportContext,
): ParsedTransaction[] {
  if (rows.length === 0 || rows.every((row) => row.every((cell) => cell.trim() === ""))) return [];
  const headers = rows[mapping.skipRows];
  if (!Number.isSafeInteger(mapping.skipRows) || mapping.skipRows < 0 || headers === undefined) {
    throw new Error("헤더 매핑이 올바르지 않습니다. 상단 요약행 수를 확인해 주세요.");
  }
  for (const [field, index] of Object.entries(mapping)) {
    if (field === "skipRows" || index === undefined) continue;
    if (!Number.isSafeInteger(index) || index < 0 || index >= headers.length) {
      throw new Error("컬럼 매핑이 올바르지 않습니다. 선택한 컬럼 위치를 확인해 주세요.");
    }
    const name = headers[index]?.normalize("NFKC").toLowerCase().replace(/[\s_()-]/g, "") ?? "";
    if (["계좌번호", "카드번호", "accountnumber", "accountno", "cardnumber", "cardno", "iban"].some((label) => name.includes(label))) {
      throw new Error("계좌번호·카드번호는 거래 고유번호나 다른 필드로 매핑할 수 없습니다. 컬럼 선택을 확인해 주세요.");
    }
  }
  if ([mapping.amount, mapping.withdrawal, mapping.deposit, mapping.krwEquivalent].every((index) => index === undefined)) {
    throw new Error("금액 컬럼이 없습니다. 원화 금액 또는 입출금 컬럼을 선택해 주세요.");
  }
  if (mapping.transactionId !== undefined
    && buildSanitizedMappingInput(headers, [], mapping.skipRows).columns[mapping.transactionId]?.label !== "transactionId") {
    throw new Error("거래 고유번호 컬럼을 확인해 주세요. 계좌번호·카드번호나 용도가 불명확한 컬럼은 사용할 수 없습니다.");
  }

  const transactions: ParsedTransaction[] = [];
  const referenceScopes = new Set<string>();
  let uniqueReferences = true;
  for (let rowIndex = mapping.skipRows + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (row === undefined || row.every((value) => value.trim() === "")) continue;
    try {
      const rawDate = readCell(row, mapping.date);
      // 합계 표시는 날짜 위치에서만 인정합니다. 잘못된 거래 날짜를 요약행으로 숨기지 않습니다.
      if (["합계", "총합계", "소계", "총계"].includes(rawDate.trim())) continue;
      const occurredOn = parseDate(rawDate);
      const merchantRaw = readCell(row, mapping.merchant);
      if (!merchantRaw.trim()) throw new Error("가맹점이 비어 있습니다. 가맹점 컬럼을 확인해 주세요.");
      const withdrawal = readCell(row, mapping.withdrawal);
      const deposit = readCell(row, mapping.deposit);
      const converted = readCell(row, mapping.krwEquivalent);
      const rawAmount = converted.trim() ? converted
        : withdrawal.trim() ? withdrawal
        : deposit.trim() ? deposit
        : readCell(row, mapping.amount);
      const signedAmount = parseAmount(rawAmount);
      const kindValue = readCell(row, mapping.transactionKind).normalize("NFKC").toLowerCase().replace(/\s/g, "");
      const kind: TransactionKind = mapping.transactionKind !== undefined
        ? (Object.hasOwn(kindDictionary, kindValue) ? kindDictionary[kindValue] ?? "expense" : "expense")
        : withdrawal.trim() ? "expense"
        : deposit.trim() ? "income"
        : signedAmount < 0 || Object.is(signedAmount, -0) ? "refund" : "expense";
      const accountingMonth = context.sourceKind === "bank" ? occurredOn.slice(0, 7)
        : parseAccountingMonth(readCell(row, mapping.billingMonth).trim() || context.accountingMonth || "");
      const sourceTransactionKey = safeReference(readCell(row, mapping.transactionId));
      const transaction: ParsedTransaction = {
        sourceId: context.sourceId, occurredOn, accountingMonth, merchantRaw,
        merchantNorm: normalizeMerchant(merchantRaw), amountKrw: Math.abs(signedAmount), kind,
        sourceTransactionKey, dataRowIndex: transactions.length, dedupeHash: null, candidateHash: null,
      };
      if (sourceTransactionKey !== null) {
        const scope = JSON.stringify([context.sourceId, kind, accountingMonth, sourceTransactionKey]);
        if (referenceScopes.has(scope)) uniqueReferences = false;
        referenceScopes.add(scope);
      }
      transactions.push(transaction);
    } catch (error) {
      // 이 모듈의 오류는 고정 문구만 사용하며 원래 셀 값을 포함하지 않습니다.
      const message = error instanceof Error ? error.message : "매핑과 행의 형식을 확인해 주세요.";
      throw new Error(`${rowIndex + 1}행을 읽지 못했습니다. ${message}`);
    }
  }

  for (const transaction of transactions) {
    // 일부 번호가 충돌하면 그 컬럼 전체를 식별 근거에서 제외해 정상 행을 보존합니다.
    if (!uniqueReferences) transaction.sourceTransactionKey = null;
    transaction.dedupeHash = computeDedupeHash(transaction, context.fileHash);
    transaction.candidateHash = computeCandidateHash(transaction);
  }
  return transactions;
}
