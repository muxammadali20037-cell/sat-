import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { requireStudentReady } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict } from '@/lib/i18n/server'
import { diagnosticDict } from '@/lib/i18n/dictionaries/diagnostic'
import { isUuid } from '@/features/practice/schemas'
import { loadOwnedAttempt } from '@/features/practice/server'
import { finalizeDiagnostic, getGraceSeconds, isPastDeadline, loadDiagnosticState } from '@/features/diagnostic/server'
import { DiagnosticRunner } from '@/components/diagnostic/diagnostic-runner'

export const metadata: Metadata = { title: 'Diagnostic' }

export default async function DiagnosticRunnerPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  if (!isUuid(attemptId)) notFound()
  const profile = await requireStudentReady({ next: `/dashboard/diagnostic/${attemptId}` })
  const t = await getDict(diagnosticDict)
  const admin = createAdminSupabase()

  const attempt = await loadOwnedAttempt(admin, profile.id, attemptId, 'diagnostic')
  if (!attempt) notFound()
  if (attempt.status === 'in_progress' && isPastDeadline(attempt, await getGraceSeconds(admin))) {
    await finalizeDiagnostic(admin, profile, attempt.id)
    redirect(`/dashboard/results/${attempt.id}`)
  }
  if (attempt.status !== 'in_progress') redirect(`/dashboard/results/${attempt.id}`)

  // No answer keys and no correctness in this payload (loadDiagnosticState never selects them).
  const state = await loadDiagnosticState(admin, profile, attempt)
  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-4 px-4 pb-12 sm:px-6 lg:px-8">
      <DiagnosticRunner
        attemptId={state.attempt.id}
        title={state.attempt.title || t.title}
        initialItems={state.items.map((i) => ({
          question: i.question,
          selectedOptionId: i.selectedOptionId,
          responseText: i.responseText,
          markedForReview: i.markedForReview,
        }))}
        deadlineAt={state.attempt.deadlineAt}
        serverNow={state.serverNow}
      />
      <p className="text-center text-xs text-muted-foreground">{t.disclaimer}</p>
    </div>
  )
}
