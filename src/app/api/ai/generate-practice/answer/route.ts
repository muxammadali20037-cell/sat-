import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { GenerateAnswerBody } from '@/features/ai-tutor/schemas'
import { answerGeneratedPractice } from '@/features/ai-tutor/service'

/** POST /api/ai/generate-practice/answer — owner only; first answer is final; reveals key + explanation. */
export const POST = route({
  auth: 'user',
  rateLimit: RATE_LIMITS.answer,
  body: GenerateAnswerBody,
  handler: async ({ user, body, admin }) => answerGeneratedPractice({ userId: user.id, admin: admin() }, body),
})
