import type { RateLimitRule } from '@/lib/security/rate-limit'

/** Student lifecycle changes (cancel / resume / schedule) — generous for humans, blocks scripted churn. */
export const SUBSCRIPTION_CHANGE_LIMIT: RateLimitRule = { bucket: 'subscription-change', limit: 20, windowSec: 600 }
