import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { StartPracticeSchema } from '@/features/practice/schemas'
import { startPractice } from '@/features/practice/server'

/** POST /api/practice/start — `{ mode: custom|set|retry|bookmarks, … }` → `{ attemptId, totalQuestions }` */
export const POST = route({
  auth: 'user',
  body: StartPracticeSchema,
  rateLimit: RATE_LIMITS.start,
  handler: async ({ body, profile, admin }) => startPractice(admin(), profile, body),
})
