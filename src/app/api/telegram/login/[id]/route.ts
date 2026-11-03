import { z } from 'zod'
import { route } from '@/lib/api/route'
import { ApiError } from '@/lib/api/errors'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { pollTelegramLogin } from '@/features/telegram/login'

/** GET /api/telegram/login/:id — status of a sign-in request started in this browser; signs in once approved. */
export const GET = route({
  auth: 'public',
  rateLimit: RATE_LIMITS.telegramPoll,
  handler: async ({ params }) => {
    if (!z.guid().safeParse(params.id).success) throw new ApiError(404, 'NOT_FOUND', 'This sign-in request was not found.')
    return pollTelegramLogin(params.id!)
  },
})
