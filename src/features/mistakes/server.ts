import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { richTextExcerpt } from '@/lib/rich-text/tokenize'
import { getTaxonomy } from '@/features/taxonomy/server'
import { fetchAllPages, lockedQuestionIds } from '@/features/practice/queries'
import { resultHref } from '@/features/dashboard/logic'
import type { SubjectCode } from '@/types/questions'
import { splitMistakes, type MistakeSummary, type ScoredAnswer } from './notebook'

export type NotebookItem = MistakeSummary & {
  excerpt: string
  subjectCode: SubjectCode | null
  skillId: string | null
  skillName: string | null
  difficulty: string | null
  /** Unpublished questions stay listed (the history is real) but cannot be practised again. */
  published: boolean
  reviewHref: string
}

export type Notebook = { open: NotebookItem[]; fixedCount: number }

const CHUNK = 150

/** Every scored answer of this student, oldest first (service role, filtered by the authorized id). */
export async function loadScoredAnswers(admin: Db, userId: string): Promise<ScoredAnswer[]> {
  const rows = await fetchAllPages<{ question_id: string; attempt_id: string; is_correct: boolean | null; answered_at: string | null; attempts: unknown }>(
    (from, to) =>
      admin
        .from('attempt_answers')
        .select('question_id, attempt_id, is_correct, answered_at, attempts!inner(kind)')
        .eq('user_id', userId)
        .not('is_correct', 'is', null)
        .not('answered_at', 'is', null)
        .order('answered_at')
        .order('id')
        .range(from, to),
    { max: 20_000 },
  )
  return rows.map((r) => ({
    question_id: r.question_id,
    attempt_id: r.attempt_id,
    is_correct: r.is_correct === true,
    answered_at: r.answered_at as string,
    kind: (r.attempts as { kind: string }).kind,
  }))
}

/** Open mistakes with question details, and how many were fixed. Questions of a running timed test are hidden. */
export async function loadNotebook(admin: Db, userId: string): Promise<Notebook> {
  const [answers, locked, taxonomy] = await Promise.all([loadScoredAnswers(admin, userId), lockedQuestionIds(admin, userId), getTaxonomy(admin)])
  const { open, fixed } = splitMistakes(answers, locked)
  const ids = open.map((m) => m.questionId)
  const meta = new Map<string, { stem: string; subject_id: string; skill_id: string; difficulty: string; status: string }>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await admin
      .from('questions')
      .select('id, stem, subject_id, skill_id, difficulty, status')
      .in('id', ids.slice(i, i + CHUNK))
    if (error) throw error
    for (const q of data ?? []) meta.set(q.id, q)
  }
  const items: NotebookItem[] = open.flatMap((m) => {
    const q = meta.get(m.questionId)
    if (!q) return []
    return [
      {
        ...m,
        excerpt: richTextExcerpt(q.stem, 140),
        subjectCode: taxonomy.subjectById.get(q.subject_id)?.code ?? null,
        skillId: q.skill_id,
        skillName: taxonomy.skillById.get(q.skill_id)?.name ?? null,
        difficulty: q.difficulty,
        published: q.status === 'published',
        reviewHref: resultHref(m.lastWrongKind, m.lastWrongAttemptId),
      },
    ]
  })
  return { open: items, fixedCount: fixed.length }
}
