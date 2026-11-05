import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { deleteWord, SaveWordSchema, saveWord, UpdateWordSchema, updateWordTranslation, WordQuerySchema } from '@/features/vocab/server'

/** POST /api/vocab/words — save a word to "My words" (the server decides the base form). */
export const POST = route({
  auth: 'user',
  body: SaveWordSchema,
  rateLimit: RATE_LIMITS.vocab,
  handler: async ({ body, profile, admin }) => saveWord(admin(), profile, body),
})

/** PATCH /api/vocab/words — change the student's own translation. */
export const PATCH = route({
  auth: 'user',
  body: UpdateWordSchema,
  rateLimit: RATE_LIMITS.vocab,
  handler: async ({ body, profile, admin }) => updateWordTranslation(admin(), profile, body),
})

/** DELETE /api/vocab/words?word= — remove a word and its review history. */
export const DELETE = route({
  auth: 'user',
  query: WordQuerySchema,
  rateLimit: RATE_LIMITS.vocab,
  handler: async ({ query, profile, admin }) => deleteWord(admin(), profile, query.word),
})
