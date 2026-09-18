import type { ColumnMapping, UploadStatus } from './upload'

export type MappingResponse  = {
  uploadId: string; sourceId: string; status: UploadStatus; reused: boolean
  mapping: ColumnMapping | null; confidence: number; preview: string[][]; totalRows: number
  // 추론이 실패해 mapping이 null일 때 수동 매핑 화면이 쓸 헤더 행 위치다.
  headerRowIndex: number
}
export type DuplicateDecision = {
  dataRowIndex: number; action: 'keep' | 'duplicate'; transactionId?: string
}
export type ConfirmRequest = {
  mapping: ColumnMapping; encoding: 'utf-8' | 'euc-kr'
  accountingMonth?: string
  duplicateDecisions: DuplicateDecision[]
}
export type ImportReviewResponse = {
  code: 'IMPORT_REVIEW_REQUIRED'
  duplicateCandidates: { dataRowIndex: number; transactionIds: string[] }[]
}
export type ConfirmResponse  = { inserted: number; duplicates: number; unclassified: number }
export type ClassifyResponse = { classified: number; remaining: number }
