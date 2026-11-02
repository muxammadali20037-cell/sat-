/**
 * Mock exam state machine — PURE functions (no I/O), unit-tested in tests/unit/exam-machine.test.ts.
 * The DB service (service.ts) loads rows, asks these helpers what to do, and persists the result.
 * Authoritative spec: docs/SYSTEM_ARCHITECTURE.md §9.
 */
import { estimateSectionScore, routeSecondModule, type ModuleRoute } from '@/lib/scoring'
import { SAT_STRUCTURE } from '@/config/site'

export type ExamSection = 'reading_writing' | 'math'
export type ModuleVariant = 'standard' | 'easier' | 'harder'
export type AttemptModuleStatus = 'ready' | 'in_progress' | 'submitted' | 'expired'
export type ExamPhase = 'ready_to_begin' | 'in_module' | 'break' | 'completed'
export type AttemptStatus = 'in_progress' | 'completed' | 'expired' | 'abandoned'

export const SECTIONS: readonly ExamSection[] = ['reading_writing', 'math']

export type ModuleSlot = { sequence: 1 | 2 | 3 | 4; section: ExamSection; moduleNumber: 1 | 2 }

/** Fixed order of a Digital SAT attempt: RW M1 → RW M2 → (break) → Math M1 → Math M2. */
export const MODULE_PLAN: readonly ModuleSlot[] = [
  { sequence: 1, section: 'reading_writing', moduleNumber: 1 },
  { sequence: 2, section: 'reading_writing', moduleNumber: 2 },
  { sequence: 3, section: 'math', moduleNumber: 1 },
  { sequence: 4, section: 'math', moduleNumber: 2 },
]

/** Questions per module in a full-length exam (27 RW, 22 Math). */
export const FULL_LENGTH_COUNTS: Record<ExamSection, number> = {
  reading_writing: SAT_STRUCTURE.reading_writing.perModule,
  math: SAT_STRUCTURE.math.perModule,
}

/** Default module durations (32 min RW, 35 min Math). */
export const DEFAULT_MODULE_SECONDS: Record<ExamSection, number> = {
  reading_writing: SAT_STRUCTURE.reading_writing.moduleMinutes * 60,
  math: SAT_STRUCTURE.math.moduleMinutes * 60,
}

export const DEFAULT_ANSWER_GRACE_SECONDS = 5

export type ModuleRuntime = {
  id: string
  sequence: number
  section: ExamSection
  moduleNumber: 1 | 2
  variant: ModuleVariant
  status: AttemptModuleStatus
  durationSeconds: number
  startedAt: string | null
  deadlineAt: string | null
  submittedAt: string | null
  totalQuestions: number
  /** NULL until the module is finalized (scored). */
  correctCount: number | null
}

export type ExamRules = { isAdaptive: boolean; routingThreshold: number; breakSeconds: number }

export const isFinalStatus = (status: AttemptModuleStatus): boolean => status === 'submitted' || status === 'expired'

const ms = (iso: string) => Date.parse(iso)

export function sortModules<T extends { sequence: number }>(modules: readonly T[]): T[] {
  return [...modules].sort((a, b) => a.sequence - b.sequence)
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** True when an in-progress module is past its deadline plus the network grace (lazy expiry). */
export function isPastGrace(module: Pick<ModuleRuntime, 'status' | 'deadlineAt'>, now: Date, graceSeconds: number): boolean {
  if (module.status !== 'in_progress' || !module.deadlineAt) return false
  return now.getTime() > ms(module.deadlineAt) + Math.max(0, graceSeconds) * 1000
}

export function modulesToExpire(modules: readonly ModuleRuntime[], now: Date, graceSeconds: number): ModuleRuntime[] {
  return modules.filter((m) => isPastGrace(m, now, graceSeconds))
}

export type AnswerGate = { ok: true } | { ok: false; code: 'MODULE_NOT_ACTIVE' | 'TIME_EXPIRED' }

/** May an answer be written for a question of `module` right now? */
export function answerGate(module: Pick<ModuleRuntime, 'status' | 'deadlineAt'> | undefined, now: Date, graceSeconds: number): AnswerGate {
  if (!module) return { ok: false, code: 'MODULE_NOT_ACTIVE' }
  if (isFinalStatus(module.status)) return { ok: false, code: 'TIME_EXPIRED' }
  if (module.status !== 'in_progress') return { ok: false, code: 'MODULE_NOT_ACTIVE' }
  if (isPastGrace(module, now, graceSeconds)) return { ok: false, code: 'TIME_EXPIRED' }
  return { ok: true }
}

/** Timestamp recorded as a module's submission time: never later than its deadline. */
export function submissionTime(module: Pick<ModuleRuntime, 'deadlineAt'>, reason: 'submitted' | 'expired', now: Date): string {
  const deadline = module.deadlineAt ? ms(module.deadlineAt) : now.getTime()
  if (reason === 'expired') return new Date(deadline).toISOString()
  return new Date(Math.min(now.getTime(), deadline)).toISOString()
}

/** Seconds of a module actually used (for study time). */
export function moduleSecondsUsed(module: Pick<ModuleRuntime, 'startedAt' | 'submittedAt' | 'deadlineAt' | 'durationSeconds'>): number {
  if (!module.startedAt) return 0
  const end = module.submittedAt ?? module.deadlineAt
  if (!end) return 0
  const used = Math.round((ms(end) - ms(module.startedAt)) / 1000)
  return Math.min(module.durationSeconds, Math.max(0, used))
}

export function deadlineFrom(start: Date, durationSeconds: number): Date {
  return new Date(start.getTime() + durationSeconds * 1000)
}

// ---------------------------------------------------------------------------
// Routing and progression
// ---------------------------------------------------------------------------

/** Variant of module 2: `standard` for non-adaptive exams, else SAT MASTER's threshold rule. */
export function secondModuleVariant(isAdaptive: boolean, module1Correct: number, module1Total: number, threshold: number): ModuleVariant {
  if (!isAdaptive) return 'standard'
  return routeSecondModule(module1Correct, module1Total, threshold)
}

export type NextStep =
  | { kind: 'wait' }
  | { kind: 'done' }
  | { kind: 'score_module'; moduleId: string }
  | { kind: 'create_module'; slot: ModuleSlot; variant: ModuleVariant }
  | { kind: 'finalize_attempt' }

/**
 * What must happen next for an attempt to make progress. Idempotent: the service applies the
 * step and asks again until it gets `wait` or `done`. This also repairs partial failures
 * (e.g. a module that was finalized but whose successor was never created).
 */
export function nextStep(attemptStatus: AttemptStatus, modules: readonly ModuleRuntime[], rules: Pick<ExamRules, 'isAdaptive' | 'routingThreshold'>): NextStep {
  if (attemptStatus !== 'in_progress') return { kind: 'done' }
  const sorted = sortModules(modules)
  if (sorted.length === 0) return { kind: 'create_module', slot: MODULE_PLAN[0]!, variant: 'standard' }
  if (sorted.some((m) => m.status === 'in_progress' || m.status === 'ready')) return { kind: 'wait' }
  const unscored = sorted.find((m) => m.correctCount === null)
  if (unscored) return { kind: 'score_module', moduleId: unscored.id }
  const last = sorted[sorted.length - 1]!
  if (last.sequence >= MODULE_PLAN.length) return { kind: 'finalize_attempt' }
  const slot = MODULE_PLAN[last.sequence]!
  if (slot.moduleNumber === 2) {
    const variant = secondModuleVariant(rules.isAdaptive, last.correctCount ?? 0, last.totalQuestions, rules.routingThreshold)
    return { kind: 'create_module', slot, variant }
  }
  return { kind: 'create_module', slot, variant: 'standard' }
}

export type DerivedPhase = {
  phase: ExamPhase
  current: ModuleRuntime | null
  next: ModuleRuntime | null
  /** End of the optional break (RW M2 submission + break seconds), when a break applies. */
  breakEndsAt: string | null
  /** Module 2 follows module 1 immediately (no screen in between). */
  autoBegin: boolean
}

export function derivePhase(attemptStatus: AttemptStatus, modules: readonly ModuleRuntime[], rules: Pick<ExamRules, 'breakSeconds'>, now: Date): DerivedPhase {
  const none = { current: null, next: null, breakEndsAt: null, autoBegin: false }
  if (attemptStatus !== 'in_progress') return { phase: 'completed', ...none }
  const sorted = sortModules(modules)
  const current = sorted.find((m) => m.status === 'in_progress') ?? null
  if (current) return { phase: 'in_module', ...none, current }
  const next = sorted.find((m) => m.status === 'ready') ?? null
  if (!next) return { phase: 'ready_to_begin', ...none }
  if (next.moduleNumber === 2) return { phase: 'ready_to_begin', ...none, next, autoBegin: true }
  const previous = sorted.find((m) => m.sequence === next.sequence - 1)
  if (previous?.submittedAt && rules.breakSeconds > 0) {
    const breakEndsAt = new Date(ms(previous.submittedAt) + rules.breakSeconds * 1000)
    if (now < breakEndsAt) return { phase: 'break', ...none, next, breakEndsAt: breakEndsAt.toISOString() }
  }
  return { phase: 'ready_to_begin', ...none, next }
}

// ---------------------------------------------------------------------------
// Results (unofficial estimate — docs/SYSTEM_ARCHITECTURE.md §9)
// ---------------------------------------------------------------------------

export type Range = { point: number; low: number; high: number }
export type SectionResult = {
  section: ExamSection
  route: ModuleRoute
  module1: { correct: number; total: number }
  module2: { correct: number; total: number }
  estimate: Range
}

export type AttemptResults = {
  sections: Partial<Record<ExamSection, SectionResult>>
  total: Range | null
  correct: number
  totalQuestions: number
  secondsUsed: number
}

export function computeResults(modules: readonly ModuleRuntime[]): AttemptResults {
  const sections: Partial<Record<ExamSection, SectionResult>> = {}
  for (const section of SECTIONS) {
    const m1 = modules.find((m) => m.section === section && m.moduleNumber === 1)
    const m2 = modules.find((m) => m.section === section && m.moduleNumber === 2)
    if (!m1 || !m2) continue
    const route: ModuleRoute = m2.variant
    const module1 = { correct: m1.correctCount ?? 0, total: m1.totalQuestions }
    const module2 = { correct: m2.correctCount ?? 0, total: m2.totalQuestions }
    sections[section] = { section, route, module1, module2, estimate: estimateSectionScore({ route, module1, module2 }) }
  }
  const rw = sections.reading_writing
  const math = sections.math
  const total =
    rw && math
      ? { point: rw.estimate.point + math.estimate.point, low: rw.estimate.low + math.estimate.low, high: rw.estimate.high + math.estimate.high }
      : null
  return {
    sections,
    total,
    correct: modules.reduce((s, m) => s + (m.correctCount ?? 0), 0),
    totalQuestions: modules.reduce((s, m) => s + m.totalQuestions, 0),
    secondsUsed: modules.reduce((s, m) => s + moduleSecondsUsed(m), 0),
  }
}

/** Human labels need section numbers: RW is section 1, Math section 2. */
export const sectionNumber = (section: ExamSection): 1 | 2 => (section === 'reading_writing' ? 1 : 2)
