import { z } from 'zod'
import { route } from '@/lib/api/route'
import { scheduleDowngrade } from '@/features/subscriptions/lifecycle'
import { getSubscriptionOverview } from '@/features/subscriptions/server'
import { SUBSCRIPTION_CHANGE_LIMIT } from '@/features/subscriptions/limits'

/** POST { planCode } — a cheaper paid plan becomes what the next renewal buys. Nothing is charged now. */
export const POST = route({
  auth: 'user',
  body: z.object({ planCode: z.string().regex(/^[a-z0-9_]{2,40}$/) }),
  rateLimit: SUBSCRIPTION_CHANGE_LIMIT,
  handler: async ({ profile, body }) => {
    await scheduleDowngrade(profile, body.planCode)
    return getSubscriptionOverview(profile)
  },
})
