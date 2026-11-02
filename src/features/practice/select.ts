/**
 * Practice question selection — pure functions (unit-tested in tests/unit/practice-select.test.ts).
 * The server fetches candidate ids (published only, already filtered by subject/domain/skill and,
 * unless "mixed", difficulty) plus the student's answer history, and these functions decide.
 */

export type Difficulty = 'easy' | 'medium' | 'hard'
export type PracticeDifficulty = Difficulty | 'mixed'
export type Rng = () => number

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['easy', 'medium', 'hard']

export type Candidate = { id: string; difficulty: Difficulty }

/**
 * Answer history: question id → whether the student's MOST RECENT scored answer was correct.
 * Questions absent from the map have never been answered by the student.
 */
export type AnswerHistory = ReadonlyMap<string, boolean>

/** Tier 0 = never answered, 1 = last answer incorrect, 2 = last answer correct. */
export type Tier = 0 | 1 | 2

export function tierOf(questionId: string, history: AnswerHistory): Tier {
  const last = history.get(questionId)
  if (last === undefined) return 0
  return last ? 2 : 1
}

/** Fisher–Yates shuffle returning a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

function dedupe<T extends { id: string }>(items: readonly T[], exclude?: ReadonlySet<string>): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    if (seen.has(item.id) || exclude?.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

/** Never-seen first, then previously incorrect, then the rest; random order inside each tier. */
export function orderByTier<T extends { id: string }>(items: readonly T[], history: AnswerHistory, rng: Rng = Math.random): T[] {
  const tiers: [T[], T[], T[]] = [[], [], []]
  for (const item of shuffle(items, rng)) tiers[tierOf(item.id, history)].push(item)
  return [...tiers[0], ...tiers[1], ...tiers[2]]
}

/**
 * How many questions of each difficulty a mixed set gets: round-robin easy → medium → hard,
 * skipping a difficulty once its supply runs out, so the set is as even as the bank allows.
 */
export function mixedQuotas(available: Record<Difficulty, number>, count: number): Record<Difficulty, number> {
  const quota: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 }
  let assigned = 0
  let progressed = true
  while (assigned < count && progressed) {
    progressed = false
    for (const d of DIFFICULTY_ORDER) {
      if (assigned >= count) break
      if (quota[d] < available[d]) {
        quota[d]++
        assigned++
        progressed = true
      }
    }
  }
  return quota
}

export function selectPracticeQuestions(input: {
  candidates: readonly Candidate[]
  history: AnswerHistory
  count: number
  difficulty: PracticeDifficulty
  /** Ids that must never be selected (e.g. questions of an in-progress timed test). */
  exclude?: ReadonlySet<string>
  rng?: Rng
}): string[] {
  const rng = input.rng ?? Math.random
  const count = Math.max(0, Math.floor(input.count))
  if (count === 0) return []
  const pool = dedupe(input.candidates, input.exclude)

  if (input.difficulty !== 'mixed') {
    const only = pool.filter((c) => c.difficulty === input.difficulty)
    return orderByTier(only, input.history, rng)
      .slice(0, count)
      .map((c) => c.id)
  }

  const byDifficulty: Record<Difficulty, Candidate[]> = { easy: [], medium: [], hard: [] }
  for (const c of pool) byDifficulty[c.difficulty]?.push(c)
  const ordered: Record<Difficulty, Candidate[]> = {
    easy: orderByTier(byDifficulty.easy, input.history, rng),
    medium: orderByTier(byDifficulty.medium, input.history, rng),
    hard: orderByTier(byDifficulty.hard, input.history, rng),
  }
  const quota = mixedQuotas(
    { easy: ordered.easy.length, medium: ordered.medium.length, hard: ordered.hard.length },
    count,
  )
  // Interleave easy, medium, hard so the session alternates instead of ramping in blocks.
  const out: string[] = []
  const rounds = Math.max(quota.easy, quota.medium, quota.hard)
  for (let r = 0; r < rounds; r++) {
    for (const d of DIFFICULTY_ORDER) {
      if (r < quota[d]) out.push(ordered[d][r]!.id)
    }
  }
  return out
}

/**
 * "Retry incorrect": questions of a past attempt that were answered incorrectly or not answered,
 * in their original order. Correctness comes only from stored, server-scored answers.
 */
export function retryQuestionIds(
  questions: ReadonlyArray<{ questionId: string; position: number }>,
  answers: ReadonlyMap<string, boolean | null>,
): string[] {
  return questions
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((q) => answers.get(q.questionId) !== true)
    .map((q) => q.questionId)
    .filter((id, i, all) => all.indexOf(id) === i)
}

/** Build AnswerHistory from answers sorted newest first (the first occurrence wins). */
export function historyFromAnswers(rowsNewestFirst: ReadonlyArray<{ questionId: string; isCorrect: boolean | null }>): Map<string, boolean> {
  const map = new Map<string, boolean>()
  for (const row of rowsNewestFirst) {
    if (row.isCorrect === null) continue
    if (!map.has(row.questionId)) map.set(row.questionId, row.isCorrect)
  }
  return map
}
