import { route } from '@/lib/api/route'
import { cancelAtPeriodEnd } from '@/features/subscriptions/lifecycle'
import { getSubscriptionOverview } from '@/features/subscriptions/server'
import { SUBSCRIPTION_CHANGE_LIMIT } from '@/features/subscriptions/limits'

/** Stop renewing (cancel_at_period_end = true). Access continues until the period ends. */
export const POST = route({
  auth: 'user',
  rateLimit: SUBSCRIPTION_CHANGE_LIMIT,
  handler: async ({ profile }) => {
    await cancelAtPeriodEnd(profile)
    return getSubscriptionOverview(profile)
  },
})
