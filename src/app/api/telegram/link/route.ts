import { z } from 'zod'
import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { linkTelegram, unlinkTelegram } from '@/features/telegram/server'

/** POST /api/telegram/link { initData } — connect the signed-in account to the Telegram user in the Mini App. */
export const POST = route({
  auth: 'user',
  body: z.object({ initData: z.string().min(1).max(8192) }),
  rateLimit: RATE_LIMITS.telegramAuth,
  handler: async ({ profile, body }) => linkTelegram(profile.id, body.initData),
})

/** DELETE /api/telegram/link — disconnect Telegram (not allowed for accounts created in Telegram). */
export const DELETE = route({
  auth: 'user',
  rateLimit: RATE_LIMITS.telegramAuth,
  handler: async ({ profile }) => unlinkTelegram(profile.id, profile.email),
})
