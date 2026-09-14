import type { MappingLabel, SanitizedMappingInput } from "@/types/upload";

// 은행·카드사 이름과 무관한 공통 의미 사전입니다. 부분 일치로 개인정보 헤더를 추측하지 않습니다.
const labels: { label: MappingLabel; names: string[] }[] = [
  { label: "date", names: ["날짜", "일자", "거래일", "거래일자", "거래일시", "이용일", "이용일자", "이용일시", "승인일", "승인일자", "승인일시", "결제일자", "date", "transactiondate"] },
  { label: "merchant", names: ["가맹점", "가맹점명", "이용가맹점", "이용가맹점명", "사용처", "이용처", "거래처", "거래내용", "적요", "내용", "merchant", "description"] },
  { label: "amount", names: ["금액", "이용금액", "사용금액", "거래금액", "결제금액", "청구금액", "회차청구액", "원화금액", "금액원", "이용금액원", "청구금액원", "amount"] },
  { label: "deposit", names: ["입금", "입금액", "입금금액", "맡기신금액", "받으신금액", "deposit"] },
  { label: "withdrawal", names: ["출금", "출금액", "출금금액", "찾으신금액", "보내신금액", "withdrawal"] },
  { label: "krwEquivalent", names: ["원화환산", "원화환산액", "원화환산금액", "원화환산금액원", "원화청구금액", "krwequivalent"] },
  { label: "transactionKind", names: ["거래구분", "거래유형", "이용구분", "입출금구분", "승인취소구분", "transactionkind", "type"] },
  { label: "transactionId", names: ["승인번호", "거래번호", "거래고유번호", "거래참조번호", "참조번호", "transactionid", "referenceid"] },
  { label: "billingMonth", names: ["청구월", "청구년월", "청구년월일", "청구연월", "결제월", "billingmonth"] },
];

function valueType(raw: string): SanitizedMappingInput["columns"][number]["valueTypes"][number] {
  const value = raw.trim();
  if (!value) return "empty";
  if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(value)
    || /^\d{4}년\s*\d{1,2}월\s*\d{1,2}일$/.test(value)
    || /^(?:19|20)\d{6}$/.test(value)) return "date";
  if (/^\(?[+-]?₩?\s*(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?\s*원?\)?$/.test(value)) return "number";
  return "text";
}

export function buildSanitizedMappingInput(
  headers: string[], sampleRows: string[][], headerRowIndex: number,
): SanitizedMappingInput {
  return {
    headerRowIndex,
    columns: headers.map((header, index) => {
      const name = header.normalize("NFKC").toLowerCase().replace(/[\s_()]/g, "");
      return {
        index,
        label: labels.find(({ names }) => names.includes(name))?.label ?? "unknown",
        valueTypes: [...new Set(sampleRows.slice(0, 20).map((row) => valueType(row[index] ?? "")))],
      };
    }),
  };
}

export function sanitizeMerchantForLlm(raw: string): string {
  const masked = raw.normalize("NFKC").replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu, "[가림]")
    // 연속·공백·하이픈·괄호 구분과 이미 일부 가려진 계좌/카드/전화번호를 함께 처리합니다.
    .replace(/\+?\d[\d\s().*xX●•-]{5,}\d/g, (candidate) => {
      const digits = candidate.replace(/[^\d*xX●•]/g, "");
      return digits.length >= 7 ? "[가림]" : candidate;
    });
  return Array.from(masked).slice(0, 200).join("");
}
