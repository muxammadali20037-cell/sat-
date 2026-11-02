import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { ExplainBody } from '@/features/ai-tutor/schemas'
import { tutorExplain } from '@/features/ai-tutor/service'

export const maxDuration = 60

/**
 * POST /api/ai/explain — explanation of a question the student has a SCORED answer for, grounded in
 * the verified key and explanation. Refused (409) while the question is in a running timed test.
 */
export const POST = route({
  auth: 'user',
  rateLimit: RATE_LIMITS.ai,
  body: ExplainBody,
  handler: async ({ user, profile, body, db, admin }) =>
    tutorExplain({ userId: user.id, profile, db, admin: admin() }, body),
})
