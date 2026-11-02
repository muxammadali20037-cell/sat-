import { route } from '@/lib/api/route'
import { cancelScheduledChange } from '@/features/subscriptions/lifecycle'
import { getSubscriptionOverview } from '@/features/subscriptions/server'
import { SUBSCRIPTION_CHANGE_LIMIT } from '@/features/subscriptions/limits'

/** Drop a scheduled downgrade and keep the current plan. */
export const POST = route({
  auth: 'user',
  rateLimit: SUBSCRIPTION_CHANGE_LIMIT,
  handler: async ({ profile }) => {
    await cancelScheduledChange(profile)
    return getSubscriptionOverview(profile)
  },
})
