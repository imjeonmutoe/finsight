import type { Category } from './category'

export type MonthlySummary = {
  month: string                                   // 'YYYY-MM'
  totalKrw: number                                 // 지출-환불, 수입/이체 제외
  byCategory: { category: Category | null; amountKrw: number; count: number }[]
}
export type Subscription = {
  merchantNorm: string; displayName: string
  monthlyKrw: number; occurrences: number
  lastChargedOn: string; amountIncreased: boolean
}
export type Outlier = {
  transactionId: string; merchantRaw: string
  amountKrw: number; category: Category; medianKrw: number
}

// 숫자는 호출자가 코드로 집계한다. evidence는 해당 월 집계의 근거 UUID만 담는다.
// Free는 summary/evidence만, Pro는 선택적으로 추이·탐지 결과까지 사용한다.
export type InsightInput = {
  summary: MonthlySummary
  evidence: { category: Category | null; transactionIds: string[] }[]
  trends?: MonthlySummary[]
  subscriptions?: Subscription[]
  outliers?: Outlier[]
}
