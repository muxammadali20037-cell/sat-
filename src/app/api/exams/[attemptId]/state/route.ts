import { route } from '@/lib/api/route'
import { ApiError } from '@/lib/api/errors'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { AttemptParamsSchema } from '@/features/exams/schemas'
import { getExamState } from '@/features/exams/service'

/** GET /api/exams/[attemptId]/state — server-authoritative state (lazy expiry applied first). */
export const GET = route({
  auth: 'user',
  rateLimit: RATE_LIMITS.examState,
  handler: async ({ params, profile, admin }) => {
    const parsed = AttemptParamsSchema.safeParse(params)
    if (!parsed.success) throw new ApiError(404, 'NOT_FOUND', 'Exam attempt not found.')
    return getExamState({ admin: admin(), userId: profile.id, timeZone: profile.timezone, attemptId: parsed.data.attemptId })
  },
})
