import type { Category } from './category'

// kind는 매핑에서 결정론적으로 도출된다 (ADR-013). null 상태가 없다
export type TransactionKind = 'expense' | 'income' | 'refund' | 'transfer'
export type ParsedTransaction = {
  sourceId: string
  occurredOn: string        // 'YYYY-MM-DD'
  accountingMonth: string   // 'YYYY-MM'; DB 저장 시 월 첫날 date로 변환
  merchantRaw: string
  merchantNorm: string
  amountKrw: number         // 원 단위 정수, 항상 0 이상
  kind: TransactionKind
  sourceTransactionKey: string | null
  dataRowIndex: number
  dedupeHash: string | null // 유형·청구월 확정 후 최종 계산
  candidateHash: string | null
}

export type CategorySource = 'ai' | 'rule' | 'user'

export type Transaction = Omit<ParsedTransaction, 'kind' | 'dedupeHash' | 'candidateHash'> & {
  kind: TransactionKind
  dedupeHash: string
  candidateHash: string
  id: string
  userId: string
  uploadId: string
  category: Category | null
  categorySource: CategorySource | null
}
