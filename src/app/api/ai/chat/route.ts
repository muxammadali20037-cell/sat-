import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { ChatBody } from '@/features/ai-tutor/schemas'
import { tutorChat } from '@/features/ai-tutor/service'

export const maxDuration = 60

/** POST /api/ai/chat — SAT concept Q&A (no question context). Creates the session on the first message. */
export const POST = route({
  auth: 'user',
  rateLimit: RATE_LIMITS.ai,
  body: ChatBody,
  handler: async ({ user, profile, body, db, admin }) =>
    tutorChat({ userId: user.id, profile, db, admin: admin() }, body),
})
