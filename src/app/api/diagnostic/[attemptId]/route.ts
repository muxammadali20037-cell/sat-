import { route } from '@/lib/api/route'
import { notFoundError } from '@/lib/api/errors'
import { isUuid } from '@/features/practice/schemas'
import { loadOwnedAttempt } from '@/features/practice/server'
import { finalizeDiagnostic, getGraceSeconds, isPastDeadline, loadDiagnosticState } from '@/features/diagnostic/server'

/**
 * GET /api/diagnostic/[attemptId] — runner state: safe questions, saved answers, `serverNow`,
 * `deadlineAt`. Never includes correctness. Expired attempts are finalized lazily here.
 */
export const GET = route({
  auth: 'user',
  handler: async ({ params, profile, admin }) => {
    if (!isUuid(params.attemptId)) throw notFoundError('Diagnostic')
    const db = admin()
    let attempt = await loadOwnedAttempt(db, profile.id, params.attemptId, 'diagnostic')
    if (!attempt) throw notFoundError('Diagnostic')
    if (attempt.status === 'in_progress' && isPastDeadline(attempt, await getGraceSeconds(db))) {
      attempt = (await finalizeDiagnostic(db, profile, attempt.id)) ?? attempt
    }
    if (attempt.status !== 'in_progress') {
      return { status: attempt.status, attemptId: attempt.id, resultsUrl: `/dashboard/results/${attempt.id}` }
    }
    return { ...(await loadDiagnosticState(db, profile, attempt)), resultsUrl: `/dashboard/results/${attempt.id}` }
  },
})
