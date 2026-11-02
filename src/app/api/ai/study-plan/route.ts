import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { generateStudyPlan } from '@/features/study-plan/server'

export const maxDuration = 60

/**
 * POST /api/ai/study-plan — canonical study-plan generation. Requires the `study_plan` feature.
 * The deterministic planner builds every task; AI (when configured and within the daily limit)
 * only writes weekly objectives + rationale from the computed summary.
 */
export const POST = route({
  auth: 'user',
  rateLimit: RATE_LIMITS.ai,
  handler: async ({ profile, db, admin }) => generateStudyPlan({ profile, db, admin: admin() }),
})
