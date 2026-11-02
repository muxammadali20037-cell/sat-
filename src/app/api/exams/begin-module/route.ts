import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { ModuleActionSchema } from '@/features/exams/schemas'
import { beginModule } from '@/features/exams/service'

/** POST /api/exams/begin-module — starts the timer of the given ready module (idempotent). */
export const POST = route({
  auth: 'user',
  body: ModuleActionSchema,
  rateLimit: RATE_LIMITS.examAction,
  handler: async ({ body, profile, admin }) =>
    beginModule({ admin: admin(), userId: profile.id, timeZone: profile.timezone, ...body }),
})
