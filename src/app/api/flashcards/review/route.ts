import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { recordReview, ReviewSchema } from '@/features/flashcards/server'

/** POST /api/flashcards/review — `{ cardKey, grade, seconds }` → `{ dueAt, intervalDays }` */
export const POST = route({
  auth: 'user',
  body: ReviewSchema,
  rateLimit: RATE_LIMITS.flashcards,
  handler: async ({ body, profile, admin }) => recordReview(admin(), profile, body),
})
