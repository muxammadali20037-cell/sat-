/**
 * Pure course-catalog helpers shared by the courses pages, the lesson page (prev/next), the
 * dashboard and GET /api/courses. One canonical lesson order everywhere:
 * domain position → skill position → lesson position → title; lessons without a skill last.
 */

export type LessonKind = 'video' | 'text'

export type CatalogLesson = {
  id: string
  courseId: string
  skillId: string | null
  title: string
  description: string
  kind: LessonKind
  durationSeconds: number
  position: number
  isFreePreview: boolean
}

export type LessonProgressLite = {
  lessonId: string
  watchedSeconds: number
  lastPositionSeconds: number
  completed: boolean
  updatedAt: string
}

/** Minimal taxonomy shape (structurally compatible with features/taxonomy `Taxonomy`). */
export type TaxonomyLike = {
  domainById: Map<string, { id: string; name: string; position: number; subjectId: string; weightPercent?: number }>
  skillById: Map<string, { id: string; name: string; position: number; domainId: string }>
}

export function lessonKindFromProvider(provider: string): LessonKind {
  return provider === 'bunny' || provider === 'supabase' ? 'video' : 'text'
}

const LAST = Number.MAX_SAFE_INTEGER

function sortKey(lesson: CatalogLesson, taxonomy: TaxonomyLike): [number, number, number] {
  const skill = lesson.skillId ? taxonomy.skillById.get(lesson.skillId) : undefined
  const domain = skill ? taxonomy.domainById.get(skill.domainId) : undefined
  return [domain?.position ?? LAST, skill?.position ?? LAST, lesson.position]
}

export function orderLessons<T extends CatalogLesson>(lessons: T[], taxonomy: TaxonomyLike): T[] {
  return lessons
    .map((lesson) => ({ lesson, key: sortKey(lesson, taxonomy) }))
    .sort((a, b) => {
      for (let i = 0; i < 3; i++) {
        const d = a.key[i]! - b.key[i]!
        if (d !== 0) return d
      }
      return a.lesson.title.localeCompare(b.lesson.title) || a.lesson.id.localeCompare(b.lesson.id)
    })
    .map((x) => x.lesson)
}

export type SkillGroup<T> = { skill: { id: string; name: string } | null; lessons: T[] }
export type DomainGroup<T> = { domain: { id: string; name: string } | null; skills: SkillGroup<T>[] }

/** Lessons grouped domain → skill, in canonical order. Ungrouped lessons form a final `null` group. */
export function groupLessonsByDomainSkill<T extends CatalogLesson>(lessons: T[], taxonomy: TaxonomyLike): DomainGroup<T>[] {
  const groups: DomainGroup<T>[] = []
  for (const lesson of orderLessons(lessons, taxonomy)) {
    const skill = lesson.skillId ? taxonomy.skillById.get(lesson.skillId) : undefined
    const domain = skill ? taxonomy.domainById.get(skill.domainId) : undefined
    const domainId = domain?.id ?? null
    let dg = groups[groups.length - 1]
    if (!dg || (dg.domain?.id ?? null) !== domainId) {
      dg = { domain: domain ? { id: domain.id, name: domain.name } : null, skills: [] }
      groups.push(dg)
    }
    const skillId = skill?.id ?? null
    let sg = dg.skills[dg.skills.length - 1]
    if (!sg || (sg.skill?.id ?? null) !== skillId) {
      sg = { skill: skill ? { id: skill.id, name: skill.name } : null, lessons: [] }
      dg.skills.push(sg)
    }
    sg.lessons.push(lesson)
  }
  return groups
}

export type ProgressSummary = {
  total: number
  completed: number
  inProgress: number
  /** completed / total, or null when there are no lessons. */
  ratio: number | null
  totalDurationSeconds: number
}

export function summarizeProgress(lessons: CatalogLesson[], progress: Map<string, LessonProgressLite>): ProgressSummary {
  let completed = 0
  let inProgress = 0
  let totalDurationSeconds = 0
  for (const lesson of lessons) {
    totalDurationSeconds += lesson.durationSeconds
    const p = progress.get(lesson.id)
    if (p?.completed) completed++
    else if (p && (p.watchedSeconds > 0 || p.lastPositionSeconds > 0)) inProgress++
  }
  return {
    total: lessons.length,
    completed,
    inProgress,
    ratio: lessons.length > 0 ? completed / lessons.length : null,
    totalDurationSeconds,
  }
}

export function adjacentLessons<T extends { id: string }>(ordered: T[], id: string): { prev: T | null; next: T | null } {
  const i = ordered.findIndex((l) => l.id === id)
  if (i < 0) return { prev: null, next: null }
  return { prev: ordered[i - 1] ?? null, next: ordered[i + 1] ?? null }
}

/** First lesson (canonical order) that is not completed. */
export function firstIncompleteLesson<T extends CatalogLesson>(ordered: T[], progress: Map<string, LessonProgressLite>): T | null {
  return ordered.find((l) => !progress.get(l.id)?.completed) ?? null
}

/** URL slugs for subject course pages. */
export const SUBJECT_SLUGS = { math: 'math', reading_writing: 'reading-writing' } as const
export type SubjectSlug = (typeof SUBJECT_SLUGS)[keyof typeof SUBJECT_SLUGS]

export function subjectFromSlug(slug: string): 'math' | 'reading_writing' | null {
  if (slug === 'math') return 'math'
  if (slug === 'reading-writing') return 'reading_writing'
  return null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}
