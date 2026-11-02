import { route } from '@/lib/api/route'
import { getSubscriptionOverview } from '@/features/subscriptions/server'

/** Effective plan, status (active / grace / none), period, scheduled change, entitlements and usage. */
export const GET = route({
  auth: 'user',
  handler: async ({ profile }) => getSubscriptionOverview(profile),
})
