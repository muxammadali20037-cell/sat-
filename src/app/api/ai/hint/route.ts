import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { HintBody } from '@/features/ai-tutor/schemas'
import { tutorHint } from '@/features/ai-tutor/service'

export const maxDuration = 60

/**
 * POST /api/ai/hint — progressive hints (levels 1–3) for a question met in practice. The answer key
 * is never sent to the model; final_answer and steps are stripped server-side.
 */
export const POST = route({
  auth: 'user',
  rateLimit: RATE_LIMITS.ai,
  body: HintBody,
  handler: async ({ user, profile, body, db, admin }) =>
    tutorHint({ userId: user.id, profile, db, admin: admin() }, body),
})
