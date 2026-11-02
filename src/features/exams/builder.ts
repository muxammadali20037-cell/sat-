/**
 * Exam builder rules — PURE (no I/O), unit-tested in tests/unit/exam-builder.test.ts.
 * Used by the admin server actions: which modules an exam needs, publish validation, and the
 * auto-fill allocation by official domain weights and difficulty targets.
 */
import { DEFAULT_MODULE_SECONDS, FULL_LENGTH_COUNTS, SECTIONS, type ExamSection, type ModuleVariant } from './machine'

export type Difficulty = 'easy' | 'medium' | 'hard'
export type ModuleSpec = { section: ExamSection; moduleNumber: 1 | 2; variant: ModuleVariant; durationSeconds: number }

/** Modules created for a new exam: M1 standard; M2 easier + harder (adaptive) or standard. */
export function requiredModuleSpecs(isAdaptive: boolean, durations: Partial<Record<ExamSection, number>> = {}): ModuleSpec[] {
  const specs: ModuleSpec[] = []
  for (const section of SECTIONS) {
    const durationSeconds = durations[section] ?? DEFAULT_MODULE_SECONDS[section]
    specs.push({ section, moduleNumber: 1, variant: 'standard', durationSeconds })
    const variants: ModuleVariant[] = isAdaptive ? ['easier', 'harder'] : ['standard']
    for (const variant of variants) specs.push({ section, moduleNumber: 2, variant, durationSeconds })
  }
  return specs
}

export function moduleLabel(m: { section: ExamSection; moduleNumber: number; variant: ModuleVariant }): string {
  const section = m.section === 'math' ? 'Math' : 'Reading and Writing'
  return `${section} · Module ${m.moduleNumber}${m.variant === 'standard' ? '' : ` (${m.variant})`}`
}

// ---------------------------------------------------------------------------
// Publish validation
// ---------------------------------------------------------------------------

export type ValidationModule = {
  section: ExamSection
  moduleNumber: 1 | 2
  variant: ModuleVariant
  questions: Array<{ questionId: string; status: string; subjectCode: ExamSection | null }>
}

/** Returns human-readable problems; an empty list means the exam can be published. */
export function validateExamForPublish(exam: { isAdaptive: boolean; isFullLength: boolean }, modules: ValidationModule[]): string[] {
  const issues: string[] = []
  const required = requiredModuleSpecs(exam.isAdaptive)
  const seen = new Map<string, string>()

  for (const spec of required) {
    const mod = modules.find((m) => m.section === spec.section && m.moduleNumber === spec.moduleNumber && m.variant === spec.variant)
    const label = moduleLabel(spec)
    if (!mod) {
      issues.push(`${label} is missing.`)
      continue
    }
    const count = mod.questions.length
    if (count < 1) issues.push(`${label} has no questions.`)
    else if (exam.isFullLength && count !== FULL_LENGTH_COUNTS[spec.section]) {
      issues.push(`${label} has ${count} questions; a full-length exam needs exactly ${FULL_LENGTH_COUNTS[spec.section]}.`)
    }
    const unpublished = mod.questions.filter((q) => q.status !== 'published').length
    if (unpublished > 0) issues.push(`${label} includes ${unpublished} question${unpublished === 1 ? '' : 's'} that ${unpublished === 1 ? 'is' : 'are'} not published.`)
    const wrongSubject = mod.questions.filter((q) => q.subjectCode !== null && q.subjectCode !== spec.section).length
    if (wrongSubject > 0) issues.push(`${label} includes ${wrongSubject} question${wrongSubject === 1 ? '' : 's'} from the other subject.`)
    for (const q of mod.questions) {
      const other = seen.get(q.questionId)
      if (other && other !== label) issues.push(`A question appears in both ${other} and ${label}.`)
      seen.set(q.questionId, label)
    }
  }
  return [...new Set(issues)]
}

// ---------------------------------------------------------------------------
// Auto-fill allocation
// ---------------------------------------------------------------------------

/** Difficulty mix targets (shares sum to 1). M1 mixed; M2 easier easy/medium; M2 harder medium/hard. */
export function difficultyTargets(moduleNumber: 1 | 2, variant: ModuleVariant): Array<{ difficulty: Difficulty; share: number }> {
  if (moduleNumber === 2 && variant === 'easier') return [{ difficulty: 'easy', share: 0.5 }, { difficulty: 'medium', share: 0.5 }]
  if (moduleNumber === 2 && variant === 'harder') return [{ difficulty: 'medium', share: 0.5 }, { difficulty: 'hard', share: 0.5 }]
  return [{ difficulty: 'easy', share: 1 / 3 }, { difficulty: 'medium', share: 1 / 3 }, { difficulty: 'hard', share: 1 / 3 }]
}

/** Largest-remainder apportionment of `total` units by weight (ties → earlier key). Sum is exact. */
export function apportion<K extends string>(total: number, weights: Array<{ key: K; weight: number }>): Map<K, number> {
  const out = new Map<K, number>()
  const n = Math.max(0, Math.floor(total))
  const positive = weights.filter((w) => w.weight > 0)
  const sum = positive.reduce((s, w) => s + w.weight, 0)
  for (const w of weights) out.set(w.key, 0)
  if (n === 0 || sum <= 0) return out
  const exact = positive.map((w, index) => ({ key: w.key, index, raw: (n * w.weight) / sum }))
  let assigned = 0
  for (const e of exact) {
    const floor = Math.floor(e.raw)
    out.set(e.key, floor)
    assigned += floor
  }
  const byRemainder = [...exact].sort((a, b) => b.raw - Math.floor(b.raw) - (a.raw - Math.floor(a.raw)) || a.index - b.index)
  for (let i = 0; assigned < n; i = (i + 1) % byRemainder.length) {
    const e = byRemainder[i]!
    out.set(e.key, (out.get(e.key) ?? 0) + 1)
    assigned += 1
  }
  return out
}

export type PoolQuestion = { id: string; domainId: string; skillId: string; difficulty: Difficulty }
export type AutoFillInput = {
  /** Total questions the module should hold after filling. */
  targetCount: number
  domains: Array<{ id: string; weightPercent: number; position: number }>
  moduleNumber: 1 | 2
  variant: ModuleVariant
  section: ExamSection
  /** Questions already in the module (kept). */
  existing: PoolQuestion[]
  /** Published candidates of the module's subject NOT used anywhere in this exam. */
  pool: PoolQuestion[]
  random?: () => number
}
export type AutoFillResult = {
  /** New question ids to append, in exam order. */
  selected: string[]
  /** How many could not be filled because the bank ran out. */
  shortfall: number
  allocation: Array<{ domainId: string; target: number; filled: number }>
}

const DIFFICULTY_RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 }

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** Pick `count` items spreading across skills (round-robin over shuffled skill buckets). */
function pickSpread(candidates: PoolQuestion[], count: number, random: () => number): PoolQuestion[] {
  if (count <= 0) return []
  const bySkill = new Map<string, PoolQuestion[]>()
  for (const q of shuffle(candidates, random)) bySkill.set(q.skillId, [...(bySkill.get(q.skillId) ?? []), q])
  const buckets = shuffle([...bySkill.values()], random)
  const out: PoolQuestion[] = []
  while (out.length < count && buckets.some((b) => b.length > 0)) {
    for (const b of buckets) {
      const q = b.shift()
      if (q) out.push(q)
      if (out.length >= count) break
    }
  }
  return out
}

/**
 * Allocates questions by official domain weight (largest remainder), then by the module's
 * difficulty targets within each domain. Shortages fall back to other target difficulties in the
 * same domain, then any difficulty in the same domain, then other domains. Never returns a
 * question twice and never one from `existing`.
 */
export function allocateAutoFill(input: AutoFillInput): AutoFillResult {
  const random = input.random ?? Math.random
  const domains = [...input.domains].sort((a, b) => a.position - b.position)
  const totalTarget = Math.max(input.targetCount, input.existing.length)
  const domainTargets = apportion(totalTarget, domains.map((d) => ({ key: d.id, weight: d.weightPercent })))
  const targets = difficultyTargets(input.moduleNumber, input.variant)
  const used = new Set(input.existing.map((q) => q.id))
  const available = input.pool.filter((q) => !used.has(q.id))
  const take = (filter: (q: PoolQuestion) => boolean, count: number): PoolQuestion[] => {
    const picked = pickSpread(available.filter((q) => !used.has(q.id) && filter(q)), count, random)
    for (const q of picked) used.add(q.id)
    return picked
  }

  const selected: PoolQuestion[] = []
  const allocation: AutoFillResult['allocation'] = []
  let carry = 0

  for (const d of domains) {
    const target = domainTargets.get(d.id) ?? 0
    const have = input.existing.filter((q) => q.domainId === d.id)
    const need = Math.max(0, target - have.length)
    const haveByDifficulty = new Map<Difficulty, number>()
    for (const q of have) haveByDifficulty.set(q.difficulty, (haveByDifficulty.get(q.difficulty) ?? 0) + 1)
    const diffTargets = apportion(target, targets.map((t) => ({ key: t.difficulty, weight: t.share })))
    const picked: PoolQuestion[] = []
    for (const t of targets) {
      const want = Math.max(0, (diffTargets.get(t.difficulty) ?? 0) - (haveByDifficulty.get(t.difficulty) ?? 0))
      picked.push(...take((q) => q.domainId === d.id && q.difficulty === t.difficulty, Math.min(want, need - picked.length)))
    }
    const allowed = new Set(targets.map((t) => t.difficulty))
    if (picked.length < need) picked.push(...take((q) => q.domainId === d.id && allowed.has(q.difficulty), need - picked.length))
    if (picked.length < need) picked.push(...take((q) => q.domainId === d.id, need - picked.length))
    carry += need - picked.length
    selected.push(...picked)
    allocation.push({ domainId: d.id, target, filled: have.length + picked.length })
  }

  // Redistribute any shortfall to other domains (target difficulties first).
  if (carry > 0) {
    const allowed = new Set(targets.map((t) => t.difficulty))
    const extra = take((q) => allowed.has(q.difficulty), carry)
    carry -= extra.length
    if (carry > 0) {
      const any = take(() => true, carry)
      extra.push(...any)
      carry -= any.length
    }
    for (const q of extra) {
      const row = allocation.find((a) => a.domainId === q.domainId)
      if (row) row.filled += 1
    }
    selected.push(...extra)
  }

  const position = new Map(domains.map((d) => [d.id, d.position]))
  // Digital SAT ordering: RW groups by domain then difficulty; Math rises in difficulty.
  selected.sort((a, b) => {
    const pa = position.get(a.domainId) ?? 0
    const pb = position.get(b.domainId) ?? 0
    const da = DIFFICULTY_RANK[a.difficulty]
    const db = DIFFICULTY_RANK[b.difficulty]
    return input.section === 'reading_writing' ? pa - pb || da - db : da - db || pa - pb
  })

  return { selected: selected.map((q) => q.id), shortfall: carry, allocation }
}
