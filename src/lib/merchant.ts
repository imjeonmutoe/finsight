export function normalizeMerchant(raw: string): string {
  return raw.normalize("NFKC").toLowerCase()
    .replace(/\(주\)|주식회사/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}
