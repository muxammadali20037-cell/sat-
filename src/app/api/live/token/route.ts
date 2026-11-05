import { z } from 'zod'
import { route } from '@/lib/api/route'
import { ApiError } from '@/lib/api/errors'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { issueLiveToken, liveConfig, recordJoin, resolveLiveAccess } from '@/features/live/server'
import { effectivePlan } from '@/features/classroom/plan-server'

/**
 * POST /api/live/token — `{ sessionId }` → `{ url, token, role }` for the lesson's LiveKit room.
 * 503 SERVICE_NOT_CONFIGURED without LiveKit keys; 404 unless the caller is the group's staff or a
 * current student of the group; 409 outside the joining window or for a cancelled lesson.
 */
export const POST = route({
  auth: 'user',
  body: z.object({ sessionId: z.guid() }),
  rateLimit: RATE_LIMITS.liveToken,
  handler: async ({ body, profile, admin }) => {
    const cfg = liveConfig()
    if (!cfg) throw new ApiError(503, 'SERVICE_NOT_CONFIGURED', 'Live lessons are not configured for this deployment.')
    const db = admin()
    const access = await resolveLiveAccess(db, profile.id, body.sessionId)
    if (!access.ok) {
      if (access.reason === 'cancelled') throw new ApiError(409, 'CONFLICT', 'This lesson was cancelled.', { reason: 'cancelled' })
      throw new ApiError(404, 'NOT_FOUND', 'Lesson not found.')
    }
    const { plan } = await effectivePlan(db, access.session.workspaceId)
    if (plan && !plan.liveLessons) throw new ApiError(403, 'FORBIDDEN', 'In-app live lessons are not included in this workspace’s plan.', { reason: 'plan' })
    if (access.window !== 'open') throw new ApiError(409, 'CONFLICT', 'This lesson is not open right now.', { reason: access.window })
    const token = await issueLiveToken(cfg, { userId: profile.id, name: profile.fullName || 'SAT MASTER', role: access.role, sessionId: access.session.id })
    await recordJoin(db, access.session.workspaceId, access.session.id, profile.id)
    return { url: cfg.url, token, role: access.role }
  },
})
