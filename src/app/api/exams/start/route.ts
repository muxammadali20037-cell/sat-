import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { StartExamSchema } from '@/features/exams/schemas'
import { startExam } from '@/features/exams/service'

/** POST /api/exams/start — resume the in-progress attempt for this exam or start a new one (plan-limited). */
export const POST = route({
  auth: 'user',
  body: StartExamSchema,
  rateLimit: RATE_LIMITS.examAction,
  handler: async ({ body, profile, admin }) =>
    startExam({ admin: admin(), userId: profile.id, timeZone: profile.timezone, mockExamId: body.mockExamId }),
})
