import { route } from '@/lib/api/route'
import { resumeSubscription } from '@/features/subscriptions/lifecycle'
import { getSubscriptionOverview } from '@/features/subscriptions/server'
import { SUBSCRIPTION_CHANGE_LIMIT } from '@/features/subscriptions/limits'

/** Undo a cancellation before the period ends. */
export const POST = route({
  auth: 'user',
  rateLimit: SUBSCRIPTION_CHANGE_LIMIT,
  handler: async ({ profile }) => {
    await resumeSubscription(profile)
    return getSubscriptionOverview(profile)
  },
})
