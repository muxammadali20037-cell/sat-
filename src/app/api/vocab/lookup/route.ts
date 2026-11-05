import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { lookupWord, WordQuerySchema } from '@/features/vocab/server'

/** GET /api/vocab/lookup?word= — translation and meaning from SAT MASTER's dictionary, and whether it is saved. */
export const GET = route({
  auth: 'user',
  query: WordQuerySchema,
  rateLimit: RATE_LIMITS.vocab,
  handler: async ({ query, profile, db }) => lookupWord(db, profile.id, query.word, profile.locale),
})
