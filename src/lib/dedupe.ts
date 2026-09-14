import { createHash } from "node:crypto";
import type { ParsedTransaction } from "@/types/transaction";

export function computeFileHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function computeDedupeHash(t: ParsedTransaction, fileHash: string): string {
  const identity = t.sourceTransactionKey === null
    ? ["row-v1", t.sourceId, fileHash, t.dataRowIndex]
    : ["id-v1", t.sourceId, t.sourceTransactionKey, t.kind, t.accountingMonth];
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

// 후보 일치는 사용자 확인의 근거일 뿐 확정 중복이 아닙니다.
export function computeCandidateHash(t: ParsedTransaction): string {
  return createHash("sha256").update(JSON.stringify([
    t.sourceId, t.occurredOn, t.amountKrw, t.merchantRaw, t.kind, t.accountingMonth,
  ])).digest("hex");
}
