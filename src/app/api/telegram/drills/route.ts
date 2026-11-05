import { z } from 'zod'
import { route } from '@/lib/api/route'
import { ApiError } from '@/lib/api/errors'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { isTelegramConfigured } from '@/lib/telegram/bot'
import { startDrill } from '@/features/telegram/drills'

async function account(admin: ReturnType<Parameters<Parameters<typeof route>[0]['handler']>[0]['admin']>, userId: string) {
  const { data, error } = await admin.from('telegram_accounts').select('telegram_user_id').eq('user_id', userId).maybeSingle()
  if (error) throw error
  if (!data) throw new ApiError(409, 'CONFLICT', 'Connect Telegram first.')
  return data
}

/** PATCH /api/telegram/drills — `{ enabled }`: daily short drills in Telegram on or off. */
export const PATCH = route({
  auth: 'user',
  body: z.object({ enabled: z.boolean() }),
  rateLimit: RATE_LIMITS.vocab,
  handler: async ({ body, profile, admin }) => {
    const db = admin()
    await account(db, profile.id)
    const { error } = await db.from('telegram_accounts').update({ drills_enabled: body.enabled }).eq('user_id', profile.id)
    if (error) throw error
    return { enabled: body.enabled }
  },
})

/** POST /api/telegram/drills — send today's drill to the student's Telegram now. */
export const POST = route({
  auth: 'user',
  rateLimit: RATE_LIMITS.authLogin,
  handler: async ({ profile, admin }) => {
    if (!isTelegramConfigured()) throw new ApiError(503, 'SERVICE_NOT_CONFIGURED', 'The Telegram bot is not connected on this site.')
    const db = admin()
    const a = await account(db, profile.id)
    const status = await startDrill(db, { id: profile.id, locale: profile.locale === 'en' || profile.locale === 'ru' ? profile.locale : 'uz', timezone: profile.timezone || 'Asia/Tashkent', chatId: a.telegram_user_id })
    return { status }
  },
})
