import type { MappingLabel } from "@/types/upload";

// 매핑 확인 화면과 파서가 함께 쓰는 순수 문구·판정입니다. 브라우저 번들에 들어가므로
// node 전용 모듈을 불러오지 않습니다.
export const MAPPING_LABEL_TEXT: Record<MappingLabel, string> = {
  date: "날짜",
  merchant: "가맹점",
  amount: "금액",
  deposit: "입금",
  withdrawal: "출금",
  krwEquivalent: "원화환산",
  transactionKind: "거래 유형",
  transactionId: "거래 고유번호",
  billingMonth: "청구월",
  unknown: "(사용 안 함)",
};

const SENSITIVE_NAMES = [
  "계좌번호", "카드번호", "accountnumber", "accountno", "cardnumber", "cardno", "iban",
];

/** 계좌·카드번호 컬럼은 어떤 필드로도 매핑하지 않고 화면에 `(제거됨)`으로 표시합니다. */
export function isSensitiveHeader(header: string): boolean {
  const name = header.normalize("NFKC").toLowerCase().replace(/[\s_()-]/g, "");
  return SENSITIVE_NAMES.some((sensitive) => name.includes(sensitive));
}
