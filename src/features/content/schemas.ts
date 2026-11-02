import { z } from 'zod'
import {
  CONTENT_STATUSES,
  COURSE_LEVELS,
  DOMAIN_CODE_RE,
  LIMITS,
  SKILL_CODE_RE,
  SLUG_RE,
  VIDEO_ASSET_ID_RE,
  VIDEO_PROVIDERS,
} from './constants'

/** Shared Zod schemas for curriculum editing (server actions + API routes). Pure. */

const name = z.string().trim().min(2, 'Use at least 2 characters.').max(120, 'Use at most 120 characters.')
const description = z.string().trim().max(2000, 'Use at most 2,000 characters.').default('')
const position = z.coerce.number('Enter a number.').int('Use a whole number.').min(0, 'Use 0 or more.').max(999, 'Use at most 999.').default(0)

export const SubjectUpdateSchema = z.object({ id: z.guid(), name, description, position })

export const DomainCreateSchema = z.object({
  subject_id: z.guid('Choose a subject.'),
  code: z.string().trim().regex(DOMAIN_CODE_RE, 'Use 2–64 lowercase letters, digits or underscores.'),
  name,
  description,
  weight_percent: z.coerce.number('Enter a number.').min(0, 'Use 0–100.').max(100, 'Use 0–100.'),
  position,
})
/** Codes are immutable after creation; the subject is fixed too (questions reference both). */
export const DomainUpdateSchema = DomainCreateSchema.omit({ code: true, subject_id: true }).extend({ id: z.guid() })

const objectives = z
  .array(z.string().trim().min(1).max(LIMITS.objective, `Each objective can be at most ${LIMITS.objective} characters.`))
  .max(LIMITS.learningObjectives, `At most ${LIMITS.learningObjectives} objectives.`)
  .default([])

export const SkillCreateSchema = z.object({
  domain_id: z.guid('Choose a domain.'),
  code: z.string().trim().regex(SKILL_CODE_RE, 'Use 2–80 lowercase letters, digits or underscores.'),
  name: z.string().trim().min(2, 'Use at least 2 characters.').max(200, 'Use at most 200 characters.'),
  description,
  learning_objectives: objectives,
  position,
})
/** A skill's domain is fixed once created (questions carry a composite FK to it). */
export const SkillUpdateSchema = SkillCreateSchema.omit({ code: true, domain_id: true }).extend({ id: z.guid() })

export const CourseInputSchema = z.object({
  subject_id: z.guid('Choose a subject.'),
  slug: z.string().trim().regex(SLUG_RE, 'Use lowercase letters, digits and single hyphens, e.g. "algebra-foundations".').max(120),
  title: z.string().trim().min(3, 'Use at least 3 characters.').max(160, 'Use at most 160 characters.'),
  description,
  level: z.enum(COURSE_LEVELS).default('all'),
  status: z.enum(CONTENT_STATUSES).default('draft'),
  position,
})

export const LessonInputSchema = z
  .object({
    course_id: z.guid('Choose a course.'),
    skill_id: z.union([z.guid(), z.literal('')]).default(''),
    slug: z.string().trim().regex(SLUG_RE, 'Use lowercase letters, digits and single hyphens, e.g. "solving-linear-equations".').max(120),
    title: z.string().trim().min(3, 'Use at least 3 characters.').max(LIMITS.lessonTitle, `Use at most ${LIMITS.lessonTitle} characters.`),
    description: z.string().trim().max(LIMITS.lessonDescription, `Use at most ${LIMITS.lessonDescription} characters.`).default(''),
    objectives: z
      .array(z.string().trim().min(1).max(LIMITS.objective, `Each objective can be at most ${LIMITS.objective} characters.`))
      .max(LIMITS.objectives, `At most ${LIMITS.objectives} objectives.`)
      .default([]),
    position,
    duration_minutes: z.coerce.number('Enter minutes.').min(0, 'Use 0 or more.').max(360, 'At most 360 minutes.').default(0),
    is_free_preview: z.boolean().default(false),
    body: z.string().max(LIMITS.lessonBody, `Lesson notes can be at most ${LIMITS.lessonBody.toLocaleString('en-US')} characters.`).default(''),
    video_provider: z.enum(VIDEO_PROVIDERS).default('none'),
    video_asset_id: z.string().trim().max(300).default(''),
  })
  .superRefine((v, ctx) => {
    if (v.video_provider !== 'none' && v.video_asset_id && !VIDEO_ASSET_ID_RE.test(v.video_asset_id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['video_asset_id'],
        message: 'Asset ids may only contain letters, digits, "/", "_", "." and "-".',
      })
    }
    if (v.video_asset_id.includes('..')) {
      ctx.addIssue({ code: 'custom', path: ['video_asset_id'], message: 'Invalid asset id.' })
    }
  })
export type LessonInput = z.output<typeof LessonInputSchema>
export type LessonInputRaw = z.input<typeof LessonInputSchema>

export const LessonResourceLinkSchema = z.object({
  lesson_id: z.guid(),
  title: z.string().trim().min(1, 'Give the resource a title.').max(LIMITS.resourceTitle),
  url: z
    .string()
    .trim()
    .url('Enter a full URL.')
    .refine((u) => u.startsWith('https://'), 'Links must start with https://.'),
})

export const SettingUpdateSchema = z.object({ id: z.guid(), input: z.string().max(20000) })

/** Lesson input → rows for lessons + lesson_contents. Duration is stored in seconds. */
export function lessonRows(input: LessonInput) {
  return {
    lesson: {
      course_id: input.course_id,
      skill_id: input.skill_id || null,
      slug: input.slug,
      title: input.title,
      description: input.description,
      objectives: input.objectives,
      position: input.position,
      duration_seconds: Math.round(input.duration_minutes * 60),
      is_free_preview: input.is_free_preview,
      video_provider: input.video_provider,
    },
    content: {
      body: input.body,
      video_asset_id: input.video_provider === 'none' ? null : input.video_asset_id || null,
    },
  }
}

/** "Linear Equations: Intro!" → "linear-equations-intro" */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}
