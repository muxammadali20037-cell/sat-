/**
 * Pure aggregation helpers for dashboards and analytics (unit-tested). Inputs are rows from
 * `skill_performance` / `my_skill_performance` (scored answers only) and the taxonomy.
 */

export type SkillPerfRow = {
  subject_id: string
  domain_id: string
  skill_id: string
  answered: number
  correct: number
  last_answered_at: string | null
}

export type Tally = { answered: number; correct: number; accuracy: number | null }

type SubjectLike = { id: string; code: 'math' | 'reading_writing'; name: string; position: number }
type DomainLike = { id: string; subjectId: string; name: string; weightPercent: number; position: number }
type SkillLike = { id: string; domainId: string; name: string; position: number }

export type TaxonomyInput = {
  subjects: SubjectLike[]
  domains: DomainLike[]
  skills: SkillLike[]
}

export function tally(answered: number, correct: number): Tally {
  return { answered, correct, accuracy: answered > 0 ? correct / answered : null }
}

export function totals(rows: SkillPerfRow[]): Tally {
  let answered = 0
  let correct = 0
  for (const r of rows) {
    answered += r.answered
    correct += r.correct
  }
  return tally(answered, correct)
}

function rollup(rows: SkillPerfRow[], key: (r: SkillPerfRow) => string): Map<string, Tally> {
  const acc = new Map<string, { answered: number; correct: number }>()
  for (const r of rows) {
    const k = key(r)
    const cur = acc.get(k) ?? { answered: 0, correct: 0 }
    cur.answered += r.answered
    cur.correct += r.correct
    acc.set(k, cur)
  }
  return new Map([...acc].map(([k, v]) => [k, tally(v.answered, v.correct)]))
}

export const rollupByDomain = (rows: SkillPerfRow[]) => rollup(rows, (r) => r.domain_id)
export const rollupBySubject = (rows: SkillPerfRow[]) => rollup(rows, (r) => r.subject_id)

export type SkillStat = {
  skillId: string
  skillName: string
  domainId: string
  domainName: string
  subjectId: string
  subjectCode: 'math' | 'reading_writing'
  domainWeight: number
  domainPosition: number
  skillPosition: number
  answered: number
  correct: number
  accuracy: number | null
  lastAnsweredAt: string | null
}

/** Every skill in the framework with the student's tallies (accuracy null when unanswered). */
export function skillStats(rows: SkillPerfRow[], taxonomy: TaxonomyInput): SkillStat[] {
  const bySkill = new Map(rows.map((r) => [r.skill_id, r]))
  const domainById = new Map(taxonomy.domains.map((d) => [d.id, d]))
  const subjectById = new Map(taxonomy.subjects.map((s) => [s.id, s]))
  const out: SkillStat[] = []
  for (const skill of taxonomy.skills) {
    const domain = domainById.get(skill.domainId)
    const subject = domain ? subjectById.get(domain.subjectId) : undefined
    if (!domain || !subject) continue
    const row = bySkill.get(skill.id)
    const answered = row?.answered ?? 0
    const correct = row?.correct ?? 0
    out.push({
      skillId: skill.id,
      skillName: skill.name,
      domainId: domain.id,
      domainName: domain.name,
      subjectId: subject.id,
      subjectCode: subject.code,
      domainWeight: domain.weightPercent,
      domainPosition: subject.position * 100 + domain.position,
      skillPosition: skill.position,
      answered,
      correct,
      accuracy: answered > 0 ? correct / answered : null,
      lastAnsweredAt: row?.last_answered_at ?? null,
    })
  }
  return out
}

/** Weakest first: lowest accuracy, then heavier domain weight, then more evidence, then framework order. */
export function compareWeakest(a: SkillStat, b: SkillStat): number {
  const aa = a.accuracy ?? Number.POSITIVE_INFINITY
  const ba = b.accuracy ?? Number.POSITIVE_INFINITY
  if (aa !== ba) return aa - ba
  if (a.domainWeight !== b.domainWeight) return b.domainWeight - a.domainWeight
  if (a.answered !== b.answered) return b.answered - a.answered
  return a.domainPosition - b.domainPosition || a.skillPosition - b.skillPosition
}

/** Framework order: subject → domain → skill. */
export function compareFramework(a: SkillStat, b: SkillStat): number {
  return a.domainPosition - b.domainPosition || a.skillPosition - b.skillPosition
}

/** Answered skills, weakest first. */
export function weakestSkills(stats: SkillStat[], limit: number): SkillStat[] {
  return stats.filter((s) => s.answered > 0).sort(compareWeakest).slice(0, limit)
}

export type Recommendation = SkillStat & { reason: 'weak' | 'unpracticed' | 'review' }

/** Accuracy at or above this is not called "weak" (the Advanced band starts at 80%). */
export const WEAK_ACCURACY_BELOW = 0.8

/**
 * Up to `limit` skills to practise next:
 *   1. answered skills below 80% accuracy, weakest first ("weak");
 *   2. then skills never answered in the student's preferred subjects, heaviest domains first
 *      ("unpracticed");
 *   3. then the remaining answered skills, weakest first ("review").
 */
export function pickRecommendedSkills(
  stats: SkillStat[],
  preferredSubjects: Array<'math' | 'reading_writing'>,
  limit = 3,
): Recommendation[] {
  const picked: Recommendation[] = []
  const used = new Set<string>()
  const take = (list: SkillStat[], reason: Recommendation['reason']) => {
    for (const s of list) {
      if (picked.length >= limit) return
      if (used.has(s.skillId)) continue
      used.add(s.skillId)
      picked.push({ ...s, reason })
    }
  }
  const answered = stats.filter((s) => s.answered > 0).sort(compareWeakest)
  take(
    answered.filter((s) => (s.accuracy ?? 1) < WEAK_ACCURACY_BELOW),
    'weak',
  )
  const preferred = preferredSubjects.length > 0 ? new Set(preferredSubjects) : new Set(['math', 'reading_writing'])
  take(
    stats
      .filter((s) => s.answered === 0 && preferred.has(s.subjectCode))
      .sort((a, b) => b.domainWeight - a.domainWeight || compareFramework(a, b)),
    'unpracticed',
  )
  take(answered, 'review')
  return picked
}

/** Practice link per the cross-feature URL contract. */
export function practiceHref(s: { subjectCode: string; domainId: string; skillId: string }): string {
  const q = new URLSearchParams({ subject: s.subjectCode, domain: s.domainId, skill: s.skillId })
  return `/dashboard/practice?${q.toString()}`
}

export type DailyActivityRow = {
  activity_date: string
  study_seconds: number
  questions_answered: number
  correct_answers: number
}

export type DailyPoint = {
  date: string
  studySeconds: number
  questions: number
  correct: number
  /** null on days without answers (a gap, not a zero). */
  accuracy: number | null
}

/** One point per calendar day from `startDate` to `endDate` inclusive (YYYY-MM-DD), zero-filled. */
export function dailySeries(rows: DailyActivityRow[], startDate: string, endDate: string): DailyPoint[] {
  const byDate = new Map(rows.map((r) => [r.activity_date, r]))
  const out: DailyPoint[] = []
  const end = new Date(`${endDate}T00:00:00Z`).getTime()
  for (let t = new Date(`${startDate}T00:00:00Z`).getTime(); t <= end; t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10)
    const r = byDate.get(date)
    const questions = r?.questions_answered ?? 0
    const correct = Math.min(questions, r?.correct_answers ?? 0)
    out.push({
      date,
      studySeconds: r?.study_seconds ?? 0,
      questions,
      correct,
      accuracy: questions > 0 ? correct / questions : null,
    })
  }
  return out
}

/** Average seconds per answered question, per subject id. */
export function averageTimeBySubject(rows: Array<{ subjectId: string; seconds: number }>): Map<string, { count: number; avgSeconds: number }> {
  const acc = new Map<string, { count: number; total: number }>()
  for (const r of rows) {
    if (!Number.isFinite(r.seconds) || r.seconds <= 0) continue
    const cur = acc.get(r.subjectId) ?? { count: 0, total: 0 }
    cur.count++
    cur.total += r.seconds
    acc.set(r.subjectId, cur)
  }
  return new Map([...acc].map(([k, v]) => [k, { count: v.count, avgSeconds: v.total / v.count }]))
}
