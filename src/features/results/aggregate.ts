/**
 * Result aggregation — pure (unit-tested in tests/unit/results-aggregate.test.ts).
 * Inputs are server-scored rows; nothing here trusts client-reported correctness.
 */
import { levelFromAccuracy, type LevelBand } from '@/lib/scoring'

export type ScoredItem = {
  questionId: string
  skillId: string
  skillName: string
  domainId: string
  domainName: string
  /** Taxonomy position used for stable ordering (subject → domain → skill). */
  order: number
  answered: boolean
  /** Server-scored correctness; null = not scored (unanswered or not finalized). */
  isCorrect: boolean | null
  timeSpentSeconds: number
}

export type SkillStat = {
  skillId: string
  skillName: string
  domainId: string
  domainName: string
  order: number
  /** Questions counted for accuracy (answered only, or every assigned question). */
  total: number
  answered: number
  correct: number
  accuracy: number | null
}

export type DomainStat = {
  domainId: string
  domainName: string
  order: number
  total: number
  answered: number
  correct: number
  accuracy: number | null
  level: LevelBand | null
}

/**
 * `answered`: practice — only answered questions count (unanswered ones were simply skipped).
 * `assigned`: diagnostic — every assigned question counts; unanswered = incorrect.
 */
export type CountMode = 'answered' | 'assigned'

const counts = (item: ScoredItem, mode: CountMode) => ({
  total: mode === 'assigned' || item.answered ? 1 : 0,
  answered: item.answered ? 1 : 0,
  correct: item.isCorrect === true ? 1 : 0,
})

export function skillBreakdown(items: readonly ScoredItem[], mode: CountMode): SkillStat[] {
  const map = new Map<string, SkillStat>()
  for (const item of items) {
    const c = counts(item, mode)
    const s = map.get(item.skillId) ?? {
      skillId: item.skillId,
      skillName: item.skillName,
      domainId: item.domainId,
      domainName: item.domainName,
      order: item.order,
      total: 0,
      answered: 0,
      correct: 0,
      accuracy: null,
    }
    s.total += c.total
    s.answered += c.answered
    s.correct += c.correct
    s.order = Math.min(s.order, item.order)
    map.set(item.skillId, s)
  }
  return [...map.values()]
    .filter((s) => s.total > 0)
    .map((s) => ({ ...s, accuracy: s.total > 0 ? s.correct / s.total : null }))
    .sort((a, b) => a.order - b.order || a.skillName.localeCompare(b.skillName))
}

export function domainBreakdown(items: readonly ScoredItem[], mode: CountMode): DomainStat[] {
  const map = new Map<string, DomainStat>()
  for (const item of items) {
    const c = counts(item, mode)
    const d = map.get(item.domainId) ?? {
      domainId: item.domainId,
      domainName: item.domainName,
      order: item.order,
      total: 0,
      answered: 0,
      correct: 0,
      accuracy: null,
      level: null,
    }
    d.total += c.total
    d.answered += c.answered
    d.correct += c.correct
    d.order = Math.min(d.order, item.order)
    map.set(item.domainId, d)
  }
  return [...map.values()]
    .filter((d) => d.total > 0)
    .map((d) => {
      const accuracy = d.total > 0 ? d.correct / d.total : null
      return { ...d, accuracy, level: accuracy === null ? null : levelFromAccuracy(accuracy) }
    })
    .sort((a, b) => a.order - b.order)
}

/**
 * Weakest skills: lowest accuracy among skills with at least one counted question and at least
 * one miss; ties broken by the domain's official weight (heavier first), then by volume.
 */
export function weakestSkills(stats: readonly SkillStat[], domainWeight: ReadonlyMap<string, number>, limit = 3): SkillStat[] {
  return stats
    .filter((s) => s.total > 0 && s.accuracy !== null && s.accuracy < 1)
    .slice()
    .sort(
      (a, b) =>
        (a.accuracy ?? 0) - (b.accuracy ?? 0) ||
        (domainWeight.get(b.domainId) ?? 0) - (domainWeight.get(a.domainId) ?? 0) ||
        b.total - a.total ||
        a.order - b.order,
    )
    .slice(0, Math.max(0, limit))
}

export type AttemptSummary = {
  total: number
  answered: number
  correct: number
  incorrect: number
  unanswered: number
  accuracy: number | null
  timeSpentSeconds: number
}

/** Accuracy is correct/answered for practice and correct/assigned for diagnostics. */
export function summarize(items: readonly ScoredItem[], mode: CountMode): AttemptSummary {
  const total = items.length
  const answered = items.filter((i) => i.answered).length
  const correct = items.filter((i) => i.isCorrect === true).length
  const denominator = mode === 'assigned' ? total : answered
  return {
    total,
    answered,
    correct,
    incorrect: answered - correct,
    unanswered: total - answered,
    accuracy: denominator > 0 ? correct / denominator : null,
    timeSpentSeconds: items.reduce((sum, i) => sum + Math.max(0, i.timeSpentSeconds), 0),
  }
}

/** Recompute attempt counters from stored answers (never incremented in place). */
export function countersFromAnswers(rows: ReadonlyArray<{ isCorrect: boolean | null; timeSpentSeconds: number; answered: boolean }>) {
  let answered = 0
  let correct = 0
  let time = 0
  for (const r of rows) {
    if (r.answered) answered++
    if (r.isCorrect === true) correct++
    time += Math.max(0, r.timeSpentSeconds)
  }
  return { answeredCount: answered, correctCount: correct, timeSpentSeconds: time }
}
