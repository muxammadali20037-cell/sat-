import { describe, expect, it } from 'vitest'
import {
  averageTimeBySubject,
  compareWeakest,
  dailySeries,
  pickRecommendedSkills,
  practiceHref,
  rollupByDomain,
  rollupBySubject,
  skillStats,
  totals,
  weakestSkills,
  type SkillPerfRow,
} from '@/features/analytics/aggregate'
import {
  adjacentLessons,
  firstIncompleteLesson,
  groupLessonsByDomainSkill,
  orderLessons,
  subjectFromSlug,
  summarizeProgress,
  type CatalogLesson,
  type LessonProgressLite,
} from '@/features/courses/catalog'

const taxonomy = {
  subjects: [
    { id: 'S-M', code: 'math' as const, name: 'Math', position: 1 },
    { id: 'S-RW', code: 'reading_writing' as const, name: 'Reading and Writing', position: 2 },
  ],
  domains: [
    { id: 'D-ALG', subjectId: 'S-M', name: 'Algebra', weightPercent: 35, position: 1 },
    { id: 'D-GEO', subjectId: 'S-M', name: 'Geometry', weightPercent: 15, position: 4 },
    { id: 'D-CS', subjectId: 'S-RW', name: 'Craft and Structure', weightPercent: 28, position: 1 },
  ],
  skills: [
    { id: 'K-LIN', domainId: 'D-ALG', name: 'Linear equations', position: 1 },
    { id: 'K-SYS', domainId: 'D-ALG', name: 'Systems', position: 2 },
    { id: 'K-CIR', domainId: 'D-GEO', name: 'Circles', position: 4 },
    { id: 'K-WIC', domainId: 'D-CS', name: 'Words in context', position: 1 },
  ],
}
const taxonomyMaps = {
  domainById: new Map(taxonomy.domains.map((d) => [d.id, d])),
  skillById: new Map(taxonomy.skills.map((s) => [s.id, s])),
}

const row = (skill: string, domain: string, subject: string, answered: number, correct: number): SkillPerfRow => ({
  subject_id: subject,
  domain_id: domain,
  skill_id: skill,
  answered,
  correct,
  last_answered_at: '2026-11-01T10:00:00Z',
})

const perf: SkillPerfRow[] = [
  row('K-LIN', 'D-ALG', 'S-M', 10, 9),
  row('K-SYS', 'D-ALG', 'S-M', 4, 1),
  row('K-CIR', 'D-GEO', 'S-M', 4, 1),
]

describe('rollups', () => {
  it('totals and rolls up by domain and subject', () => {
    expect(totals(perf)).toEqual({ answered: 18, correct: 11, accuracy: 11 / 18 })
    expect(rollupByDomain(perf).get('D-ALG')).toEqual({ answered: 14, correct: 10, accuracy: 10 / 14 })
    expect(rollupBySubject(perf).get('S-M')?.answered).toBe(18)
    expect(rollupBySubject(perf).get('S-RW')).toBeUndefined()
    expect(totals([])).toEqual({ answered: 0, correct: 0, accuracy: null })
  })
})

describe('skill stats and weakest selection', () => {
  const stats = skillStats(perf, taxonomy)

  it('lists every skill; unanswered skills have null accuracy', () => {
    expect(stats).toHaveLength(4)
    expect(stats.find((s) => s.skillId === 'K-WIC')).toMatchObject({ answered: 0, accuracy: null, subjectCode: 'reading_writing' })
  })

  it('weakest first; ties broken by the heavier domain', () => {
    const weakest = weakestSkills(stats, 3)
    // Systems (Algebra 35%) and Circles (Geometry 15%) both 25% → Systems first.
    expect(weakest.map((s) => s.skillId)).toEqual(['K-SYS', 'K-CIR', 'K-LIN'])
  })

  it('ignores unanswered skills when choosing the weakest', () => {
    expect(weakestSkills(stats, 10).some((s) => s.answered === 0)).toBe(false)
    expect([...stats].sort(compareWeakest).at(-1)?.answered).toBe(0)
  })
})

describe('pickRecommendedSkills', () => {
  const stats = skillStats(perf, taxonomy)

  it('recommends weak skills first, then unpractised skills in preferred subjects', () => {
    const picks = pickRecommendedSkills(stats, ['math', 'reading_writing'], 3)
    expect(picks.map((p) => [p.skillId, p.reason])).toEqual([
      ['K-SYS', 'weak'],
      ['K-CIR', 'weak'],
      ['K-WIC', 'unpracticed'],
    ])
  })

  it('does not recommend unpractised skills outside the preferred subjects', () => {
    const picks = pickRecommendedSkills(stats, ['math'], 3)
    expect(picks.map((p) => p.skillId)).toEqual(['K-SYS', 'K-CIR', 'K-LIN'])
    expect(picks[2]!.reason).toBe('review')
  })

  it('for a new student, picks unpractised skills from the heaviest domains', () => {
    const fresh = skillStats([], taxonomy)
    const picks = pickRecommendedSkills(fresh, ['math'], 2)
    expect(picks.map((p) => p.skillId)).toEqual(['K-LIN', 'K-SYS'])
    expect(picks.every((p) => p.reason === 'unpracticed')).toBe(true)
  })

  it('builds the practice URL contract', () => {
    expect(practiceHref({ subjectCode: 'math', domainId: 'D-ALG', skillId: 'K-SYS' })).toBe('/dashboard/practice?subject=math&domain=D-ALG&skill=K-SYS')
  })
})

describe('dailySeries and time per question', () => {
  it('zero-fills missing days and leaves accuracy null without answers', () => {
    const series = dailySeries(
      [
        { activity_date: '2026-10-30', study_seconds: 600, questions_answered: 10, correct_answers: 7 },
        { activity_date: '2026-11-01', study_seconds: 120, questions_answered: 0, correct_answers: 0 },
      ],
      '2026-10-30',
      '2026-11-02',
    )
    expect(series.map((d) => d.date)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(series[0]).toMatchObject({ accuracy: 0.7, studySeconds: 600 })
    expect(series[1]).toMatchObject({ accuracy: null, studySeconds: 0, questions: 0 })
    expect(series[2]!.accuracy).toBeNull()
  })

  it('crosses month boundaries', () => {
    expect(dailySeries([], '2026-02-27', '2026-03-02')).toHaveLength(4)
  })

  it('averages seconds per subject and ignores non-positive times', () => {
    const avg = averageTimeBySubject([
      { subjectId: 'S-M', seconds: 60 },
      { subjectId: 'S-M', seconds: 120 },
      { subjectId: 'S-M', seconds: 0 },
      { subjectId: 'S-RW', seconds: 70 },
    ])
    expect(avg.get('S-M')).toEqual({ count: 2, avgSeconds: 90 })
    expect(avg.get('S-RW')).toEqual({ count: 1, avgSeconds: 70 })
  })
})

describe('course catalog helpers', () => {
  const lesson = (id: string, skillId: string | null, position: number): CatalogLesson => ({
    id,
    courseId: 'C1',
    skillId,
    title: `Lesson ${id}`,
    description: '',
    kind: 'video',
    durationSeconds: 600,
    position,
    isFreePreview: false,
  })
  const lessons = [lesson('g1', 'K-CIR', 1), lesson('x1', null, 0), lesson('s2', 'K-SYS', 2), lesson('l1', 'K-LIN', 5), lesson('s1', 'K-SYS', 1)]

  it('orders by domain → skill → lesson position, unassigned last', () => {
    expect(orderLessons(lessons, taxonomyMaps).map((l) => l.id)).toEqual(['l1', 's1', 's2', 'g1', 'x1'])
  })

  it('groups lessons by domain then skill', () => {
    const groups = groupLessonsByDomainSkill(lessons, taxonomyMaps)
    expect(groups.map((g) => g.domain?.name ?? null)).toEqual(['Algebra', 'Geometry', null])
    expect(groups[0]!.skills.map((s) => [s.skill?.name, s.lessons.map((l) => l.id)])).toEqual([
      ['Linear equations', ['l1']],
      ['Systems', ['s1', 's2']],
    ])
  })

  it('summarizes progress and finds the next lesson and neighbours', () => {
    const progress = new Map<string, LessonProgressLite>([
      ['l1', { lessonId: 'l1', watchedSeconds: 600, lastPositionSeconds: 590, completed: true, updatedAt: '2026-11-01T00:00:00Z' }],
      ['s1', { lessonId: 's1', watchedSeconds: 30, lastPositionSeconds: 40, completed: false, updatedAt: '2026-11-02T00:00:00Z' }],
    ])
    const ordered = orderLessons(lessons, taxonomyMaps)
    expect(summarizeProgress(ordered, progress)).toEqual({ total: 5, completed: 1, inProgress: 1, ratio: 0.2, totalDurationSeconds: 3000 })
    expect(firstIncompleteLesson(ordered, progress)?.id).toBe('s1')
    expect(adjacentLessons(ordered, 's1')).toEqual({ prev: ordered[0], next: ordered[2] })
    expect(adjacentLessons(ordered, 'missing')).toEqual({ prev: null, next: null })
    expect(summarizeProgress([], progress).ratio).toBeNull()
  })

  it('maps subject slugs', () => {
    expect(subjectFromSlug('math')).toBe('math')
    expect(subjectFromSlug('reading-writing')).toBe('reading_writing')
    expect(subjectFromSlug('reading_writing')).toBeNull()
  })
})
