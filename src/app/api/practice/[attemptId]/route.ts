import { route } from '@/lib/api/route'
import { notFoundError } from '@/lib/api/errors'
import { isUuid } from '@/features/practice/schemas'
import { loadPracticeSession } from '@/features/practice/server'

/** GET /api/practice/[attemptId] — safe session payload; reveals only for answered questions. */
export const GET = route({
  auth: 'user',
  handler: async ({ params, profile, admin }) => {
    const attemptId = params.attemptId
    if (!isUuid(attemptId)) throw notFoundError('Session')
    const session = await loadPracticeSession(admin(), profile, attemptId)
    if (!session) throw notFoundError('Session')
    return session
  },
})
