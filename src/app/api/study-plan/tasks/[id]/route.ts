import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { TaskStatusBody } from '@/features/study-plan/schemas'
import { assertValidTaskId, updateTaskStatus } from '@/features/study-plan/server'

/** PATCH /api/study-plan/tasks/[id] — owner only: mark a task completed, skipped or pending again. */
export const PATCH = route({
  auth: 'user',
  rateLimit: RATE_LIMITS.progress,
  body: TaskStatusBody,
  handler: async ({ user, params, body, admin }) =>
    updateTaskStatus(admin(), user.id, assertValidTaskId(params.id), body.status),
})
