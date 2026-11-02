import { route } from '@/lib/api/route'
import { notFoundError } from '@/lib/api/errors'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { FinishDiagnosticSchema } from '@/features/diagnostic/schemas'
import { finalizeDiagnostic, loadDiagnosticResults } from '@/features/diagnostic/server'

/** POST /api/diagnostic/finish — idempotent finalization → per-domain results. */
export const POST = route({
  auth: 'user',
  body: FinishDiagnosticSchema,
  rateLimit: RATE_LIMITS.answer,
  handler: async ({ body, profile, admin }) => {
    const db = admin()
    const attempt = await finalizeDiagnostic(db, profile, body.attemptId)
    if (!attempt) throw notFoundError('Diagnostic')
    const domains = await loadDiagnosticResults(db, profile.id, attempt.id)
    return {
      attemptId: attempt.id,
      status: attempt.status,
      totalQuestions: attempt.total_questions,
      answeredCount: attempt.answered_count,
      correctCount: attempt.correct_count,
      domains,
      resultsUrl: `/dashboard/results/${attempt.id}`,
    }
  },
})
