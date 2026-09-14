export type FinancialSource = { id: string; label: string; kind: 'card' | 'bank' }
export type MappingLabel = 'date' | 'merchant' | 'amount' | 'deposit' | 'withdrawal'
  | 'krwEquivalent' | 'transactionKind' | 'transactionId' | 'billingMonth' | 'unknown'
export type SanitizedMappingInput = {
  columns: { index: number; label: MappingLabel;
    valueTypes: ('date' | 'number' | 'text' | 'empty' | 'mixed')[] }[]
  headerRowIndex: number
}
export type ColumnMapping = {
  date: number              // 0-based 컬럼 인덱스. 원본 헤더를 LLM에 보내지 않는다
  merchant: number
  amount?: number           // 단일 원화 금액 컬럼
  deposit?: number          // 은행 입금 컬럼 (amount 대신)
  withdrawal?: number       // 은행 출금 컬럼
  krwEquivalent?: number    // 해외결제 원화환산 컬럼
  transactionKind?: number
  transactionId?: number    // 거래 고유번호. 계좌/카드번호를 선택할 수 없다
  billingMonth?: number
  skipRows: number          // 상단 요약행 수
}
export type ImportContext = {
  sourceId: string; sourceKind: 'card' | 'bank'; fileHash: string
  accountingMonth?: string  // 카드 청구월 'YYYY-MM'; 은행은 거래월
}
export type UploadStatus = 'pending' | 'mapped' | 'parsed' | 'failed'
