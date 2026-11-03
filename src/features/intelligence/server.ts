import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { fetchAllPages } from '@/features/practice/queries'
import { cardKey, allDecks } from '@/features/flashcards/content'
import type { AnswerSignal, Difficulty, SubjectCode } from './engine'

/** Answers older than this are not read (keeps the query bounded; trends use ≤ 30 days anyway). */
export const SIGNAL_LOOKBACK_DAYS = 180

type Row = {
  is_correct: boolean | null
  time_spent_seconds: number
  answered_at: string | null
  question_id: string
  questions: unknown
}

/**
 * The student's own scored answers with the skill, domain, subject and difficulty of each
 * question. Service role, always filtered by the authorized user's id; questions of a running
 * timed test (`locked`) are left out so nothing about them leaks before it is submitted.
 */
export async function loadAnswerSignals(
  admin: Db,
  userId: string,
  subjectCodeById: Map<string, SubjectCode>,
  locked: Set<string>,
  now = new Date(),
): Promise<AnswerSignal[]> {
  const since = new Date(now.getTime() - SIGNAL_LOOKBACK_DAYS * 86_400_000).toISOString()
  const rows = await fetchAllPages<Row>(
    (from, to) =>
      admin
        .from('attempt_answers')
        .select('is_correct, time_spent_seconds, answered_at, question_id, questions!inner(skill_id, domain_id, subject_id, difficulty)')
        .eq('user_id', userId)
        .not('is_correct', 'is', null)
        .gte('answered_at', since)
        .order('answered_at')
        .order('id')
        .range(from, to),
    { max: 20_000 },
  )
  const out: AnswerSignal[] = []
  for (const r of rows) {
    if (!r.answered_at || locked.has(r.question_id)) continue
    const q = r.questions as { skill_id: string; domain_id: string; subject_id: string; difficulty: Difficulty }
    const subjectCode = subjectCodeById.get(q.subject_id)
    if (!subjectCode) continue
    out.push({
      skillId: q.skill_id,
      domainId: q.domain_id,
      subjectCode,
      difficulty: q.difficulty,
      isCorrect: r.is_correct === true,
      seconds: r.time_spent_seconds,
      answeredAt: r.answered_at,
    })
  }
  return out
}

/** Flashcards the student has started whose review is due now (cards still in the repo only). */
export async function countFlashcardsDue(db: Db, userId: string, now = new Date()): Promise<number> {
  const { data, error } = await db.from('flashcard_reviews').select('card_key').eq('user_id', userId).lte('due_at', now.toISOString())
  if (error) throw error
  const known = new Set(allDecks().flatMap((d) => d.cards.map((c) => cardKey(d.id, c.id))))
  return (data ?? []).filter((r) => known.has(r.card_key)).length
}
