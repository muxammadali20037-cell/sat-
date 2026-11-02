import { route } from '@/lib/api/route'
import { notFoundError } from '@/lib/api/errors'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { FinishPracticeSchema } from '@/features/practice/schemas'
import { finishPractice, loadOwnedAttempt } from '@/features/practice/server'
import { buildAttemptReport } from '@/features/results/server'

/** POST /api/practice/finish — closes the attempt (idempotent) → summary with per-skill breakdown. */
export const POST = route({
  auth: 'user',
  body: FinishPracticeSchema,
  rateLimit: RATE_LIMITS.answer,
  handler: async ({ body, profile, admin }) => {
    const db = admin()
    await finishPractice(db, profile, body.attemptId)
    const attempt = await loadOwnedAttempt(db, profile.id, body.attemptId, 'practice')
    if (!attempt) throw notFoundError('Session')
    const report = await buildAttemptReport(db, profile, attempt)
    return {
      attemptId: attempt.id,
      status: attempt.status,
      summary: report.summary,
      skills: report.skills.map((s) => ({ skillId: s.skillId, skillName: s.skillName, correct: s.correct, total: s.total, accuracy: s.accuracy })),
      resultsUrl: `/dashboard/results/${attempt.id}`,
    }
  },
})
