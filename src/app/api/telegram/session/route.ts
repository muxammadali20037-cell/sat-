import { z } from 'zod'
import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { signInWithTelegram } from '@/features/telegram/server'

const Body = z.object({
  initData: z.string().min(1).max(8192),
  /** true = create a new account from the Telegram profile when none is connected yet */
  create: z.boolean().default(false),
})

/**
 * POST /api/telegram/session — signs the Mini App in with Telegram's signed launch data.
 * → { status: 'signed_in', isNew, next } | { status: 'unlinked', firstName }
 */
export const POST = route({
  auth: 'public',
  body: Body,
  rateLimit: RATE_LIMITS.telegramAuth,
  handler: async ({ body }) => signInWithTelegram(body.initData, body.create),
})
