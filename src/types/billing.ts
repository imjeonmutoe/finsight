export type Plan = 'free' | 'pro'

export type Profile = {
  id: string
  email: string
  plan: Plan
  planExpiresAt: string | null
  polarCustomerId: string | null
  polarSubscriptionId: string | null
  planUpdatedAt: string
  createdAt: string
}
