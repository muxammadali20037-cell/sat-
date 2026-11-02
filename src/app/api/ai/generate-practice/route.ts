import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { GenerateBody } from '@/features/ai-tutor/schemas'
import { generatePractice } from '@/features/ai-tutor/service'

// Draft + independent verification, retried once: up to four model calls.
export const maxDuration = 120

/** POST /api/ai/generate-practice — original practice question, accepted only after an independent solve agrees. */
export const POST = route({
  auth: 'user',
  rateLimit: RATE_LIMITS.ai,
  body: GenerateBody,
  handler: async ({ user, profile, body, db, admin }) =>
    generatePractice({ userId: user.id, profile, db, admin: admin() }, body),
})
