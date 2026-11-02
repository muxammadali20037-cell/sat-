import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { DeleteBookmarkQuery, ToggleBookmarkSchema } from '@/features/bookmarks/schemas'
import { deleteBookmark, toggleBookmark } from '@/features/bookmarks/server'

/** POST /api/bookmarks — `{ questionId } | { lessonId }` toggles the bookmark. */
export const POST = route({
  auth: 'user',
  body: ToggleBookmarkSchema,
  rateLimit: RATE_LIMITS.answer,
  handler: async ({ body, profile, admin }) => toggleBookmark(admin(), profile.id, body),
})

/** DELETE /api/bookmarks?id=… — removes one of the student's own bookmarks. */
export const DELETE = route({
  auth: 'user',
  query: DeleteBookmarkQuery,
  rateLimit: RATE_LIMITS.answer,
  handler: async ({ query, profile, admin }) => deleteBookmark(admin(), profile.id, query.id),
})
