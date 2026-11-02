import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { DiagnosticAnswerSchema } from '@/features/diagnostic/schemas'
import { saveDiagnosticAnswer } from '@/features/diagnostic/server'

/**
 * POST /api/diagnostic/answer — save/overwrite an answer or review flag. No feedback is returned;
 * rejected with 409 TIME_EXPIRED after the deadline + grace (the attempt is then finalized).
 */
export const POST = route({
  auth: 'user',
  body: DiagnosticAnswerSchema,
  rateLimit: RATE_LIMITS.answer,
  handler: async ({ body, profile, admin }) => saveDiagnosticAnswer(admin(), profile, body),
})
