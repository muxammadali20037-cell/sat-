import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { SaveAnswerSchema } from '@/features/exams/schemas'
import { saveAnswer } from '@/features/exams/service'

/** POST /api/exams/answer — save an answer / mark for review (409 TIME_EXPIRED after deadline + grace). */
export const POST = route({
  auth: 'user',
  body: SaveAnswerSchema,
  rateLimit: RATE_LIMITS.examAnswer,
  handler: async ({ body, profile, admin }) =>
    saveAnswer({ admin: admin(), userId: profile.id, timeZone: profile.timezone, input: body }),
})
