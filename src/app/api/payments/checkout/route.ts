import { z } from 'zod'
import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { PROVIDER_IDS } from '@/lib/payments/types'
import { startCheckout } from '@/features/payments/checkout'

const CheckoutSchema = z.object({
  planCode: z.string().regex(/^[a-z0-9_]{2,40}$/),
  provider: z.enum(PROVIDER_IDS),
  idempotencyKey: z.uuid(),
})

/** POST { planCode, provider, idempotencyKey } → { paymentId, redirectUrl } */
export const POST = route({
  auth: 'user',
  body: CheckoutSchema,
  rateLimit: RATE_LIMITS.checkout,
  handler: async ({ profile, body }) =>
    startCheckout({ profile, planCode: body.planCode, providerId: body.provider, idempotencyKey: body.idempotencyKey }),
})
