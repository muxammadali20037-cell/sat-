import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { QuestionContextInput } from '@/lib/ai/prompts'
import { SUBJECT_LABELS, type SafeQuestion } from '@/types/questions'
import type { AttemptKind, QuestionFact } from './gating'

export type StudentAnswer = {
  selectedOptionId: string | null
  responseText: string | null
  isCorrect: boolean | null
  answeredAt: string | null
}

export type QuestionFacts = {
  facts: QuestionFact[]
  /** Most recent scored answer (is_correct not null), if any. */
  latestScored: StudentAnswer | null
}

type FactRow = {
  attempts: { user_id: string; kind: string; status: string } | { user_id: string; kind: string; status: string }[] | null
  attempt_answers: StudentAnswerRow | StudentAnswerRow[] | null
}
type StudentAnswerRow = { selected_option_id: string | null; response_text: string | null; is_correct: boolean | null; answered_at: string | null }

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

/**
 * Every attempt of THIS student that contains the question (service role, filtered by user id),
 * with the student's answer if any. Feeds the pure gating decisions.
 */
export async function loadQuestionFacts(admin: Db, userId: string, questionId: string): Promise<QuestionFacts> {
  const { data, error } = await admin
    .from('attempt_questions')
    .select('id, attempts!inner(user_id, kind, status), attempt_answers(selected_option_id, response_text, is_correct, answered_at)')
    .eq('question_id', questionId)
    .eq('attempts.user_id', userId)
    .limit(200)
  if (error) throw error

  const facts: QuestionFact[] = []
  let latestScored: StudentAnswer | null = null
  for (const row of (data ?? []) as unknown as FactRow[]) {
    const attempt = one(row.attempts)
    if (!attempt || attempt.user_id !== userId) continue
    const answer = one(row.attempt_answers)
    const answered = Boolean(answer && (answer.selected_option_id || answer.response_text))
    facts.push({
      attemptKind: attempt.kind as AttemptKind,
      attemptStatus: attempt.status,
      answered,
      isCorrect: answer?.is_correct ?? null,
    })
    if (answer && answer.is_correct !== null) {
      if (!latestScored || (answer.answered_at ?? '') > (latestScored.answeredAt ?? '')) {
        latestScored = {
          selectedOptionId: answer.selected_option_id,
          responseText: answer.response_text,
          isCorrect: answer.is_correct,
          answeredAt: answer.answered_at,
        }
      }
    }
  }
  return { facts, latestScored }
}

export function toQuestionContextInput(q: SafeQuestion): QuestionContextInput {
  return {
    subject: SUBJECT_LABELS[q.subjectCode],
    domain: q.domainName,
    skill: q.skillName,
    difficulty: q.difficulty,
    questionType: q.questionType,
    passage: q.passage,
    stem: q.stem,
    imageAlt: q.imageAlt,
    hasImage: Boolean(q.imageUrl),
    options: q.options.map((o) => ({ label: o.label, content: o.content })),
  }
}
