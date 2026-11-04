import { z } from 'zod'
import { route } from '@/lib/api/route'
import { ApiError } from '@/lib/api/errors'
import { resolveLiveAccess } from '@/features/live/server'
import { loadStaffPolls, loadStudentPolls } from '@/features/classroom/poll-server'

/**
 * GET /api/polls?sessionId= — the lesson's polls for the live room, shaped by role: staff get counts
 * and who answered what; students get nothing that reveals results or the quiz key while open.
 */
export const GET = route({
  auth: 'user',
  query: z.object({ sessionId: z.guid() }),
  handler: async ({ query, profile, admin }) => {
    const db = admin()
    const access = await resolveLiveAccess(db, profile.id, query.sessionId)
    if (!access.ok) throw new ApiError(404, 'NOT_FOUND', 'Lesson not found.')
    const s = access.session
    if (access.role === 'staff') return { role: 'staff' as const, polls: await loadStaffPolls(db, s.groupId, { sessionId: s.id }) }
    return { role: 'student' as const, polls: await loadStudentPolls(db, profile.id, [s.groupId], { sessionId: s.id }) }
  },
})
