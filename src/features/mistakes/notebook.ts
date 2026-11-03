/**
 * Mistake notebook rules (pure, unit-tested).
 *
 * A question is an OPEN mistake when the student's latest scored answer to it is wrong, and a
 * FIXED mistake when it was wrong at least once and the latest answer is right. Answering it
 * correctly later (in practice, a retry or a test) fixes it automatically; nothing is stored.
 */

export type ScoredAnswer = { question_id: string; attempt_id: string; is_correct: boolean; answered_at: string; kind: string }

export type MistakeSummary = {
  questionId: string
  timesWrong: number
  firstWrongAt: string
  lastWrongAt: string
  /** Attempt with the latest wrong answer: the review link opens its results. */
  lastWrongAttemptId: string
  lastWrongKind: string
}

export type NotebookSplit = { open: MistakeSummary[]; fixed: MistakeSummary[] }

export function splitMistakes(rows: ScoredAnswer[], locked: Set<string> = new Set()): NotebookSplit {
  const byQuestion = new Map<string, ScoredAnswer[]>()
  for (const r of rows) {
    const list = byQuestion.get(r.question_id)
    if (list) list.push(r)
    else byQuestion.set(r.question_id, [r])
  }
  const open: MistakeSummary[] = []
  const fixed: MistakeSummary[] = []
  for (const [questionId, list] of byQuestion) {
    if (locked.has(questionId)) continue
    list.sort((a, b) => a.answered_at.localeCompare(b.answered_at) || a.attempt_id.localeCompare(b.attempt_id))
    const wrong = list.filter((a) => !a.is_correct)
    if (wrong.length === 0) continue
    const lastWrong = wrong[wrong.length - 1]!
    const summary: MistakeSummary = {
      questionId,
      timesWrong: wrong.length,
      firstWrongAt: wrong[0]!.answered_at,
      lastWrongAt: lastWrong.answered_at,
      lastWrongAttemptId: lastWrong.attempt_id,
      lastWrongKind: lastWrong.kind,
    }
    if (list[list.length - 1]!.is_correct) fixed.push(summary)
    else open.push(summary)
  }
  const newestFirst = (a: MistakeSummary, b: MistakeSummary) => b.lastWrongAt.localeCompare(a.lastWrongAt)
  return { open: open.sort(newestFirst), fixed: fixed.sort(newestFirst) }
}

/**
 * Practice order for "practise my mistakes": questions missed more often first, then the ones
 * missed longest ago (they are the most likely to be forgotten).
 */
export function mistakePracticeOrder(open: MistakeSummary[]): string[] {
  return [...open]
    .sort((a, b) => b.timesWrong - a.timesWrong || a.lastWrongAt.localeCompare(b.lastWrongAt))
    .map((m) => m.questionId)
}
