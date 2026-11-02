import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { StartDiagnosticSchema } from '@/features/diagnostic/schemas'
import { startDiagnostic } from '@/features/diagnostic/server'

/** POST /api/diagnostic/start — `{ diagnosticTestId }` → resumes the in-progress attempt or composes a new one. */
export const POST = route({
  auth: 'user',
  body: StartDiagnosticSchema,
  rateLimit: RATE_LIMITS.start,
  handler: async ({ body, profile, admin }) => startDiagnostic(admin(), profile, body.diagnosticTestId),
})
