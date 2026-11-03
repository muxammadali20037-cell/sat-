import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { requireStudentReady } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict } from '@/lib/i18n/server'
import { practiceDict } from '@/lib/i18n/dictionaries/practice'
import { resultsDict } from '@/lib/i18n/dictionaries/results'
import { getTaxonomy } from '@/features/taxonomy/server'
import { isUuid } from '@/features/practice/schemas'
import { loadPracticeSession } from '@/features/practice/server'
import { PracticeRunner } from '@/components/practice/practice-runner'
import { createServerSupabase } from '@/lib/supabase/server'
import { guideSlugsBySkill } from '@/features/guides/server'
import { guidesDict } from '@/lib/i18n/dictionaries/guides'

export const metadata: Metadata = { title: 'Practice session' }

/** Seconds left on a timed drill (null when untimed). Rendered per request, so the clock is read here. */
function secondsUntil(deadlineAt: string | null): number | null {
  if (!deadlineAt) return null
  return Math.max(0, Math.floor((new Date(deadlineAt).getTime() - Date.now()) / 1000))
}

export default async function PracticeSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const profile = await requireStudentReady({ next: `/dashboard/practice/${id}` })
  const [t, tr] = await Promise.all([getDict(practiceDict), getDict(resultsDict)])
  const admin = createAdminSupabase()

  // Ownership is enforced inside (owner-filtered lookup); another student's id is a 404.
  const session = await loadPracticeSession(admin, profile, id)
  if (!session) notFound()
  if (session.attempt.status !== 'in_progress' || session.items.length === 0) redirect(`/dashboard/results/${id}`)

  const { attempt } = session
  const taxonomy = await getTaxonomy(admin)
  let title = ''
  if (attempt.practiceSetId) {
    const { data } = await admin.from('practice_sets').select('title').eq('id', attempt.practiceSetId).maybeSingle()
    title = data?.title ?? ''
  }
  if (!title && attempt.mode === 'custom') {
    title =
      (attempt.skillId && taxonomy.skillById.get(attempt.skillId)?.name) ||
      (attempt.domainId && taxonomy.domainById.get(attempt.domainId)?.name) ||
      (attempt.subjectId && t.subjects[taxonomy.subjectById.get(attempt.subjectId)?.code ?? 'math']) ||
      ''
  }
  if (!title) title = tr.practiceModes[attempt.mode as keyof typeof tr.practiceModes] ?? t.title
  const rawDifficulty = attempt.difficulty ? (t.difficulty[attempt.difficulty as keyof typeof t.difficulty] ?? null) : null
  // Set titles may already name the difficulty ("Algebra · Mixed"); don't repeat it.
  const difficultyLabel = rawDifficulty && !title.toLowerCase().includes(rawDifficulty.toLowerCase()) ? rawDifficulty : null

  const [guideSlugs, tg] = await Promise.all([
    guideSlugsBySkill(await createServerSupabase()).catch(() => ({}) as Record<string, string>),
    getDict(guidesDict),
  ])
  const firstOpen = session.items.findIndex((i) => !i.answered)
  const remainingSeconds = secondsUntil(attempt.deadlineAt)
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-12 sm:px-6 lg:px-8">
      <PracticeRunner
        attemptId={attempt.id}
        title={title}
        difficultyLabel={difficultyLabel}
        initialItems={session.items.map((i) => ({ position: i.position, question: i.question, reveal: i.reveal, bookmarked: i.bookmarked }))}
        initialIndex={firstOpen === -1 ? session.items.length - 1 : firstOpen}
        initialProgress={{ answeredCount: attempt.answeredCount, correctCount: attempt.correctCount }}
        guideSlugs={guideSlugs}
        guideLabel={tg.guideLink}
        remainingSeconds={remainingSeconds}
      />
    </div>
  )
}
