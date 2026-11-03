import { z } from 'zod'
import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { startTelegramLogin } from '@/features/telegram/login'

const Body = z.object({
  intent: z.enum(['sign_in', 'link']).default('sign_in'),
  next: z.string().max(300).optional(),
})

/** POST /api/telegram/login — start website sign-in (or connecting Telegram) → { id, code, link, expiresAt } */
export const POST = route({
  auth: 'public',
  body: Body,
  rateLimit: RATE_LIMITS.telegramAuth,
  handler: async ({ body, user, request }) =>
    startTelegramLogin({ intent: body.intent, userId: user?.id ?? null, next: body.next ?? null, userAgent: request.headers.get('user-agent') ?? '' }),
})
