import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { ModuleActionSchema } from '@/features/exams/schemas'
import { submitModule } from '@/features/exams/service'

/** POST /api/exams/submit — submit the current module → next module (adaptive), break, or results. */
export const POST = route({
  auth: 'user',
  body: ModuleActionSchema,
  rateLimit: RATE_LIMITS.examAction,
  handler: async ({ body, profile, admin }) =>
    submitModule({ admin: admin(), userId: profile.id, timeZone: profile.timezone, ...body }),
})
