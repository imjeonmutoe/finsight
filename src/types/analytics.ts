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
