/**
 * SAT MASTER Learning Intelligence v1 — a pure, rule-based engine (no I/O, unit-tested).
 *
 * It reads only the student's own scored answers and activity and returns a ranked list of
 * insights. Every insight carries the numbers it was derived from (`evidence`), so the UI can
 * show *why* it is recommended, and nothing is shown when the data is too thin to support it.
 * No statistic is invented: no thresholds are met → no insight.
 */
import { SECONDS_PER_QUESTION } from '@/features/practice/schemas'

export type SubjectCode = 'math' | 'reading_writing'
export type Difficulty = 'easy' | 'medium' | 'hard'

export type AnswerSignal = {
  skillId: string
  domainId: string
  subjectCode: SubjectCode
  difficulty: Difficulty
  isCorrect: boolean
  /** Seconds the student spent; 0 when not measured. */
  seconds: number
  answeredAt: string
}

export type EngineInput = {
  now: Date
  answers: AnswerSignal[]
  /** Dates (YYYY-MM-DD) with any study in the last 14 local days, including today. */
  activeDaysLast14: number
  /** True once the student has any recorded activity at all. */
  hasHistory: boolean
  skills: Map<string, { name: string; domainId: string }>
  domains: Map<string, { name: string; subjectCode: SubjectCode }>
  /** Latest internal estimate (total, 400–1600) and when it was made. */
  estimate: { low: number; high: number; at: string } | null
  targetScore: number | null
  mocks: { completed: number; lastCompletedAt: string | null; available: boolean }
  flashcardsDue: number
  questionsAvailable: boolean
  /** First uncompleted published lesson per skill. */
  lessonBySkill: Map<string, { id: string; title: string; minutes: number }>
}

export type InsightAction =
  | { kind: 'lesson'; href: string; minutes: number; title: string }
  | { kind: 'practice'; href: string }
  | { kind: 'timed_drill'; href: string }
  | { kind: 'mock_exam'; href: string }
  | { kind: 'diagnostic'; href: string }
  | { kind: 'flashcards'; href: string }
  | { kind: 'study_plan'; href: string }

export type Insight =
  | { kind: 'repeated_mistakes'; tone: 'focus'; evidence: { skillName: string; wrong: number; answered: number; days: number }; action: InsightAction }
  | {
      kind: 'fundamentals_first'
      tone: 'focus'
      evidence: { subject: SubjectCode; hardShare: number; hardAccuracy: number; basicsAccuracy: number; answered: number }
      action: InsightAction
    }
  | { kind: 'slow_pace'; tone: 'focus'; evidence: { subject: SubjectCode; medianSeconds: number; paceSeconds: number; answered: number }; action: InsightAction }
  | { kind: 'rushing'; tone: 'focus'; evidence: { subject: SubjectCode; medianSeconds: number; paceSeconds: number; accuracy: number; answered: number }; action: InsightAction }
  | { kind: 'weak_domain'; tone: 'focus'; evidence: { domainName: string; accuracy: number; answered: number }; action: InsightAction }
  | { kind: 'declined'; tone: 'focus'; evidence: { subject: SubjectCode; before: number; after: number; answered: number }; action: InsightAction }
  | { kind: 'improved'; tone: 'positive'; evidence: { subject: SubjectCode; before: number; after: number; answered: number }; action: null }
  | { kind: 'target_gap'; tone: 'focus'; evidence: { low: number; high: number; target: number; gap: number }; action: InsightAction }
  | { kind: 'on_track'; tone: 'positive'; evidence: { low: number; high: number; target: number }; action: null }
  | { kind: 'no_estimate'; tone: 'focus'; evidence: { target: number }; action: InsightAction }
  | { kind: 'mock_ready'; tone: 'focus'; evidence: { answeredSince: number; daysSince: number | null }; action: InsightAction }
  | { kind: 'flashcards_due'; tone: 'focus'; evidence: { due: number }; action: InsightAction }
  | { kind: 'consistency_low'; tone: 'focus'; evidence: { activeDays: number; days: number }; action: InsightAction }
  | { kind: 'consistency_strong'; tone: 'positive'; evidence: { activeDays: number; days: number }; action: null }

export type InsightKind = Insight['kind']

export type IntelligenceResult = {
  /** The single highest-priority insight that has an action. */
  next: Insight | null
  /** Everything else worth showing, highest priority first. */
  insights: Insight[]
  /** Scored answers the engine looked at (all time). */
  answered: number
  /** Fewer than this many answers → the UI explains what is needed instead of guessing. */
  enoughData: boolean
}

// ---------------------------------------------------------------------------
// Thresholds (exported for tests and for the "how this works" note)
// ---------------------------------------------------------------------------
export const MIN_ANSWERS = 10
export const REPEAT_WINDOW_DAYS = 14
export const REPEAT_MIN_WRONG = 3
export const REPEAT_MAX_ACCURACY = 0.6
export const WEAK_DOMAIN_MIN_ANSWERS = 10
export const WEAK_DOMAIN_MAX_ACCURACY = 0.6
export const RECENT_WINDOW_DAYS = 30
export const PACE_MIN_TIMED_ANSWERS = 10
export const SLOW_FACTOR = 1.25
export const RUSH_FACTOR = 0.5
export const RUSH_MAX_ACCURACY = 0.5
export const HARD_MIN_ANSWERS = 10
export const HARD_MIN_SHARE = 0.4
export const BASICS_MIN_ANSWERS = 8
export const BASICS_MAX_ACCURACY = 0.7
export const HARD_MAX_ACCURACY = 0.4
export const TREND_MIN_ANSWERS = 10
export const TREND_MIN_CHANGE = 0.1
export const CONSISTENCY_DAYS = 14
export const CONSISTENCY_LOW = 4
export const CONSISTENCY_STRONG = 10
export const MOCK_FIRST_MIN_ANSWERS = 100
export const MOCK_REPEAT_MIN_DAYS = 21
export const MOCK_REPEAT_MIN_ANSWERS = 60
export const FLASHCARDS_MIN_DUE = 5
/** Time per answer above this is treated as "left the tab open", not working time. */
export const MAX_COUNTED_SECONDS = 600

const PRIORITY: Record<InsightKind, number> = {
  repeated_mistakes: 100,
  fundamentals_first: 90,
  declined: 85,
  slow_pace: 80,
  rushing: 80,
  weak_domain: 70,
  no_estimate: 65,
  target_gap: 60,
  mock_ready: 55,
  flashcards_due: 50,
  consistency_low: 45,
  improved: 30,
  on_track: 25,
  consistency_strong: 20,
}

const DAY_MS = 86_400_000

function practiceUrl(params: Record<string, string>): string {
  return `/dashboard/practice?${new URLSearchParams(params).toString()}`
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

const accuracyOf = (xs: AnswerSignal[]) => (xs.length ? xs.filter((a) => a.isCorrect).length / xs.length : 0)
const round2 = (n: number) => Math.round(n * 100) / 100

export function analyze(input: EngineInput): IntelligenceResult {
  const now = input.now.getTime()
  const within = (a: AnswerSignal, days: number) => now - Date.parse(a.answeredAt) <= days * DAY_MS
  const answers = input.answers
  const out: Insight[] = []
  const subjects: SubjectCode[] = ['math', 'reading_writing']

  // 1. Repeated mistakes in one skill (recent window) ----------------------------------------
  const recentBySkill = new Map<string, AnswerSignal[]>()
  for (const a of answers) {
    if (!within(a, REPEAT_WINDOW_DAYS)) continue
    const list = recentBySkill.get(a.skillId) ?? []
    list.push(a)
    recentBySkill.set(a.skillId, list)
  }
  const repeated = [...recentBySkill.entries()]
    .map(([skillId, xs]) => ({ skillId, xs, wrong: xs.filter((a) => !a.isCorrect).length, acc: accuracyOf(xs) }))
    .filter((r) => r.wrong >= REPEAT_MIN_WRONG && r.acc < REPEAT_MAX_ACCURACY && input.skills.has(r.skillId))
    .sort((a, b) => b.wrong - a.wrong || a.acc - b.acc || a.skillId.localeCompare(b.skillId))
  const flaggedDomains = new Set<string>()
  for (const r of repeated.slice(0, 2)) {
    const skill = input.skills.get(r.skillId)!
    const subject = r.xs[0].subjectCode
    flaggedDomains.add(skill.domainId)
    const lesson = input.lessonBySkill.get(r.skillId)
    out.push({
      kind: 'repeated_mistakes',
      tone: 'focus',
      evidence: { skillName: skill.name, wrong: r.wrong, answered: r.xs.length, days: REPEAT_WINDOW_DAYS },
      action: lesson
        ? { kind: 'lesson', href: `/dashboard/lesson/${lesson.id}`, minutes: lesson.minutes, title: lesson.title }
        : { kind: 'practice', href: practiceUrl({ subject, domain: skill.domainId, skill: r.skillId }) },
    })
  }

  const recent = answers.filter((a) => within(a, RECENT_WINDOW_DAYS))
  for (const subject of subjects) {
    const xs = recent.filter((a) => a.subjectCode === subject)

    // 2. Hard questions before the basics are solid ------------------------------------------
    const hard = xs.filter((a) => a.difficulty === 'hard')
    const basics = xs.filter((a) => a.difficulty !== 'hard')
    const hardShare = xs.length ? hard.length / xs.length : 0
    const hardAcc = accuracyOf(hard)
    const basicsAcc = accuracyOf(basics)
    if (
      hard.length >= HARD_MIN_ANSWERS &&
      hardShare >= HARD_MIN_SHARE &&
      ((basics.length >= BASICS_MIN_ANSWERS && basicsAcc < BASICS_MAX_ACCURACY) || hardAcc < HARD_MAX_ACCURACY)
    ) {
      out.push({
        kind: 'fundamentals_first',
        tone: 'focus',
        evidence: { subject, hardShare: round2(hardShare), hardAccuracy: round2(hardAcc), basicsAccuracy: round2(basicsAcc), answered: xs.length },
        action: { kind: 'practice', href: practiceUrl({ subject, difficulty: 'medium' }) },
      })
    }

    // 3. Pacing against the Digital SAT (median, measured answers only) ------------------------
    const timed = xs.filter((a) => a.seconds > 0).map((a) => Math.min(a.seconds, MAX_COUNTED_SECONDS))
    if (timed.length >= PACE_MIN_TIMED_ANSWERS) {
      const med = median(timed)
      const pace = SECONDS_PER_QUESTION[subject]
      const acc = accuracyOf(xs.filter((a) => a.seconds > 0))
      if (med > pace * SLOW_FACTOR) {
        out.push({
          kind: 'slow_pace',
          tone: 'focus',
          evidence: { subject, medianSeconds: med, paceSeconds: pace, answered: timed.length },
          action: { kind: 'timed_drill', href: practiceUrl({ subject, timed: '1' }) },
        })
      } else if (med < pace * RUSH_FACTOR && acc < RUSH_MAX_ACCURACY) {
        out.push({
          kind: 'rushing',
          tone: 'focus',
          evidence: { subject, medianSeconds: med, paceSeconds: pace, accuracy: round2(acc), answered: timed.length },
          action: { kind: 'practice', href: practiceUrl({ subject }) },
        })
      }
    }

    // 4. Week-over-week change ---------------------------------------------------------------
    const thisWeek = xs.filter((a) => within(a, 7))
    const lastWeek = xs.filter((a) => !within(a, 7) && within(a, 14))
    if (thisWeek.length >= TREND_MIN_ANSWERS && lastWeek.length >= TREND_MIN_ANSWERS) {
      const before = round2(accuracyOf(lastWeek))
      const after = round2(accuracyOf(thisWeek))
      const evidence = { subject, before, after, answered: thisWeek.length + lastWeek.length }
      if (after - before >= TREND_MIN_CHANGE) out.push({ kind: 'improved', tone: 'positive', evidence, action: null })
      else if (before - after >= TREND_MIN_CHANGE)
        out.push({ kind: 'declined', tone: 'focus', evidence, action: { kind: 'practice', href: practiceUrl({ subject }) } })
    }
  }

  // 5. Weakest domain (all time), skipping domains already flagged above -----------------------
  const byDomain = new Map<string, AnswerSignal[]>()
  for (const a of answers) {
    const list = byDomain.get(a.domainId) ?? []
    list.push(a)
    byDomain.set(a.domainId, list)
  }
  const weak = [...byDomain.entries()]
    .filter(([id, xs]) => input.domains.has(id) && !flaggedDomains.has(id) && xs.length >= WEAK_DOMAIN_MIN_ANSWERS)
    .map(([id, xs]) => ({ id, xs, acc: accuracyOf(xs) }))
    .filter((d) => d.acc < WEAK_DOMAIN_MAX_ACCURACY)
    .sort((a, b) => a.acc - b.acc || b.xs.length - a.xs.length)[0]
  if (weak) {
    const d = input.domains.get(weak.id)!
    out.push({
      kind: 'weak_domain',
      tone: 'focus',
      evidence: { domainName: d.name, accuracy: round2(weak.acc), answered: weak.xs.length },
      action: { kind: 'practice', href: practiceUrl({ subject: d.subjectCode, domain: weak.id }) },
    })
  }

  // 6. Target score vs the latest internal estimate --------------------------------------------
  if (input.targetScore) {
    if (input.estimate) {
      const { low, high } = input.estimate
      if (low >= input.targetScore) {
        out.push({ kind: 'on_track', tone: 'positive', evidence: { low, high, target: input.targetScore }, action: null })
      } else {
        out.push({
          kind: 'target_gap',
          tone: 'focus',
          evidence: { low, high, target: input.targetScore, gap: input.targetScore - Math.round((low + high) / 2) },
          action: { kind: 'study_plan', href: '/dashboard/study-plan' },
        })
      }
    } else if (input.questionsAvailable) {
      out.push({ kind: 'no_estimate', tone: 'focus', evidence: { target: input.targetScore }, action: { kind: 'diagnostic', href: '/dashboard/diagnostic' } })
    }
  }

  // 7. Mock exam readiness ---------------------------------------------------------------------
  if (input.mocks.available) {
    const last = input.mocks.lastCompletedAt ? Date.parse(input.mocks.lastCompletedAt) : null
    const since = last === null ? answers.length : answers.filter((a) => Date.parse(a.answeredAt) > last).length
    const daysSince = last === null ? null : Math.floor((now - last) / DAY_MS)
    const ready =
      last === null ? input.mocks.completed === 0 && since >= MOCK_FIRST_MIN_ANSWERS : daysSince! >= MOCK_REPEAT_MIN_DAYS && since >= MOCK_REPEAT_MIN_ANSWERS
    if (ready) out.push({ kind: 'mock_ready', tone: 'focus', evidence: { answeredSince: since, daysSince }, action: { kind: 'mock_exam', href: '/dashboard/mock-exams' } })
  }

  // 8. Flashcards due --------------------------------------------------------------------------
  if (input.flashcardsDue >= FLASHCARDS_MIN_DUE) {
    out.push({ kind: 'flashcards_due', tone: 'focus', evidence: { due: input.flashcardsDue }, action: { kind: 'flashcards', href: '/dashboard/flashcards' } })
  }

  // 9. Consistency over the last two weeks -----------------------------------------------------
  if (input.hasHistory) {
    const evidence = { activeDays: input.activeDaysLast14, days: CONSISTENCY_DAYS }
    if (input.activeDaysLast14 <= CONSISTENCY_LOW) {
      out.push({ kind: 'consistency_low', tone: 'focus', evidence, action: { kind: 'study_plan', href: '/dashboard/study-plan' } })
    } else if (input.activeDaysLast14 >= CONSISTENCY_STRONG) {
      out.push({ kind: 'consistency_strong', tone: 'positive', evidence, action: null })
    }
  }

  const ranked = out.map((insight, i) => ({ insight, i })).sort((a, b) => PRIORITY[b.insight.kind] - PRIORITY[a.insight.kind] || a.i - b.i).map((x) => x.insight)
  // A recommendation needs evidence: with fewer than MIN_ANSWERS scored answers, answer-based
  // insights are not trusted, so only non-answer ones (estimate, flashcards, habit) remain.
  const enoughData = answers.length >= MIN_ANSWERS
  const ANSWER_BASED = new Set<InsightKind>(['repeated_mistakes', 'fundamentals_first', 'slow_pace', 'rushing', 'weak_domain', 'declined', 'improved'])
  const kept = enoughData ? ranked : ranked.filter((x) => !ANSWER_BASED.has(x.kind))
  const nextIdx = kept.findIndex((x) => x.action !== null)
  return {
    next: nextIdx >= 0 ? kept[nextIdx] : null,
    insights: kept.filter((_, i) => i !== nextIdx),
    answered: answers.length,
    enoughData,
  }
}
