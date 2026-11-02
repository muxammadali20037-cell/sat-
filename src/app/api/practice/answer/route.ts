import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { PracticeAnswerSchema } from '@/features/practice/schemas'
import { answerPractice } from '@/features/practice/server'

/** POST /api/practice/answer — scores one answer server-side → `{ isCorrect, reveal }`. First answer locks. */
export const POST = route({
  auth: 'user',
  body: PracticeAnswerSchema,
  rateLimit: RATE_LIMITS.answer,
  handler: async ({ body, profile, admin }) => answerPractice(admin(), profile, body),
})
