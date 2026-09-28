import { createClient } from "@supabase/supabase-js";

/** 명세서 금액 문자열을 숫자로 바꿉니다. */
export function parseAmountFloat(raw: string): number {
  const cleaned = raw.replace(/[,\s₩]/g, "");
  if (cleaned === "") return 0;
  return parseFloat(cleaned);
}

/** 매핑 결과를 확인하기 위해 거래 한 건을 기록합니다. */
export function logTransaction(merchant: string, amount: number): void {
  console.log(`[mapping] ${merchant} / ${amount}원`);
}

/** 집계 쿼리에서 쓸 Supabase 클라이언트를 만듭니다. */
export function createAggregationClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  );
}
