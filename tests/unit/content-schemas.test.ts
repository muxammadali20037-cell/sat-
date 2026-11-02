import { describe, expect, it } from 'vitest'
import { QuestionInputSchema, buildQuestionPayload, emptyQuestionInput, sprAnswerError } from '@/features/content/question-schema'
import { CourseInputSchema, DomainCreateSchema, LessonInputSchema, LessonResourceLinkSchema, SkillCreateSchema, lessonRows, slugify } from '@/features/content/schemas'
import { LESSON_FILE_PATH_RE, QUESTION_IMAGE_PATH_RE, checkUploadFile } from '@/features/content/constants'
import { issuesToFieldErrors, summarizeFieldErrors } from '@/features/content/form-errors'

const S = '11111111-1111-4111-8111-111111111111'
const D = '22222222-2222-4222-8222-222222222222'
const K = '33333333-3333-4333-8333-333333333333'

function mc(overrides: Record<string, unknown> = {}) {
  return {
    ...emptyQuestionInput({ subject_id: S, domain_id: D, skill_id: K }),
    stem: 'If $3x + 7 = 22$, what is $x$?',
    options: [
      { label: 'A', content: '3' },
      { label: 'B', content: '5' },
      { label: 'C', content: '7' },
      { label: 'D', content: '15' },
    ],
    correct_option: 'B',
    explanation_en: 'Subtract 7, then divide by 3.',
    ...overrides,
  }
}

function fieldErrors(input: unknown) {
  const r = QuestionInputSchema.safeParse(input)
  return r.success ? {} : issuesToFieldErrors(r.error.issues)
}

describe('question schema', () => {
  it('accepts a complete multiple-choice question', () => {
    expect(QuestionInputSchema.safeParse(mc()).success).toBe(true)
  })

  it('requires taxonomy, stem and English explanation', () => {
    const errors = fieldErrors(mc({ subject_id: '', skill_id: 'x', stem: ' ', explanation_en: '' }))
    expect(Object.keys(errors)).toEqual(expect.arrayContaining(['subject_id', 'skill_id', 'stem', 'explanation_en']))
  })

  it('requires four labelled, distinct options and one correct letter', () => {
    expect(fieldErrors(mc({ options: [{ label: 'A', content: 'x' }] })).options?.[0]).toMatch(/exactly 4 options/)
    expect(fieldErrors(mc({ correct_option: null })).correct_option?.[0]).toMatch(/exactly one/)
    expect(fieldErrors(mc({ options: mc().options.map((o, i) => (i === 2 ? { ...o, content: '' } : o)) }))['options.2.content']?.[0]).toBe('Write option C.')
    expect(fieldErrors(mc({ options: mc().options.map((o) => ({ ...o, content: 'same' })) })).options?.[0]).toMatch(/same text/)
    expect(fieldErrors(mc({ options: [...mc().options].reverse() }))['options.0.label']?.[0]).toMatch(/labelled A/)
  })

  it('validates SPR answers with the scoring parser', () => {
    const base = mc({ question_type: 'student_produced_response', options: [], correct_option: null })
    expect(fieldErrors({ ...base, spr_answers: [] }).spr_answers?.[0]).toMatch(/at least one/)
    expect(fieldErrors({ ...base, spr_answers: ['5', '3 1/2'] })['spr_answers.1']?.[0]).toMatch(/Mixed numbers/)
    expect(fieldErrors({ ...base, spr_answers: ['5', '5.0', '5'] })['spr_answers.2']?.[0]).toMatch(/listed twice/)
    expect(QuestionInputSchema.safeParse({ ...base, spr_answers: ['5', '5.0', '10/2'] }).success).toBe(true)
    expect(sprAnswerError('.75')).toBeNull()
    expect(sprAnswerError('1,000')).toMatch(/Use a number/)
  })

  it('checks stimulus requirements and image alt text', () => {
    expect(fieldErrors(mc({ stimulus_type: 'passage', passage: '' })).passage?.[0]).toMatch(/passage text/)
    expect(fieldErrors(mc({ stimulus_type: 'image' })).image_path?.[0]).toMatch(/Upload an image/)
    expect(fieldErrors(mc({ stimulus_type: 'image', image_path: 'questions/a.png', image_alt: '' })).image_alt?.[0]).toMatch(/alt text/)
    expect(fieldErrors(mc({ image_path: '../../etc/passwd', image_alt: 'x' })).image_path?.[0]).toMatch(/invalid/)
  })

  it('enforces estimated time and tag rules', () => {
    expect(fieldErrors(mc({ estimated_seconds: 5 })).estimated_seconds?.[0]).toMatch(/At least 10/)
    expect(fieldErrors(mc({ estimated_seconds: '120' })).estimated_seconds).toBeUndefined()
    expect(fieldErrors(mc({ tags: ['Algebra', 'algebra'] })).tags?.[0]).toMatch(/unique/)
  })
})

describe('admin_upsert_question payload', () => {
  it('builds the migration-0009 payload for multiple choice', () => {
    const input = QuestionInputSchema.parse(mc({ passage: '  ', tags: [' linear ', 'one-step'], explanation_uz: "Javob 5." }))
    const payload = buildQuestionPayload(input, { id: 'abc', status: 'reviewed' })
    expect(payload).toMatchObject({
      id: 'abc',
      status: 'reviewed',
      subject_id: S,
      domain_id: D,
      skill_id: K,
      question_type: 'multiple_choice',
      stimulus_type: 'text',
      passage: null,
      image_path: null,
      image_alt: null,
      source_reference: null,
      spr_answers: [],
      tags: ['linear', 'one-step'],
    })
    expect(payload.options).toEqual([
      { label: 'A', content: '3', is_correct: false },
      { label: 'B', content: '5', is_correct: true },
      { label: 'C', content: '7', is_correct: false },
      { label: 'D', content: '15', is_correct: false },
    ])
    expect(payload.explanations).toEqual([
      { locale: 'en', content: 'Subtract 7, then divide by 3.' },
      { locale: 'uz', content: 'Javob 5.' },
    ])
  })

  it('drops options for SPR and normalizes answers', () => {
    const input = QuestionInputSchema.parse(mc({ question_type: 'student_produced_response', options: [], correct_option: null, spr_answers: [' 5 ', '−5/1', ''] }))
    const payload = buildQuestionPayload(input)
    expect(payload.status).toBe('draft')
    expect(payload.options).toEqual([])
    expect(payload.spr_answers).toEqual(['5', '-5/1'])
    expect(payload).not.toHaveProperty('id')
  })

  it('omits alt text when there is no image', () => {
    const input = QuestionInputSchema.parse(mc({ image_alt: 'orphan alt' }))
    expect(buildQuestionPayload(input).image_alt).toBeNull()
  })
})

describe('curriculum schemas', () => {
  it('validates domain and skill codes', () => {
    expect(DomainCreateSchema.safeParse({ subject_id: S, code: 'advanced_math', name: 'Advanced Math', weight_percent: '35' }).success).toBe(true)
    expect(DomainCreateSchema.safeParse({ subject_id: S, code: 'Advanced-Math', name: 'Advanced Math', weight_percent: 35 }).success).toBe(false)
    expect(DomainCreateSchema.safeParse({ subject_id: S, code: 'x', name: 'Too short code', weight_percent: 35 }).success).toBe(false)
    expect(DomainCreateSchema.safeParse({ subject_id: S, code: 'ok_code', name: 'Weight', weight_percent: 120 }).success).toBe(false)
    const skill = SkillCreateSchema.parse({ domain_id: D, code: 'circles', name: 'Circles', learning_objectives: [' Find arc length '] })
    expect(skill.learning_objectives).toEqual(['Find arc length'])
  })

  it('validates course slugs and statuses', () => {
    expect(CourseInputSchema.safeParse({ subject_id: S, slug: 'algebra-foundations', title: 'Algebra foundations', status: 'published' }).success).toBe(true)
    expect(CourseInputSchema.safeParse({ subject_id: S, slug: 'Algebra Foundations', title: 'Algebra foundations' }).success).toBe(false)
    expect(CourseInputSchema.safeParse({ subject_id: S, slug: 'algebra', title: 'Al', status: 'live' }).success).toBe(false)
  })

  it('validates lessons and converts them to rows', () => {
    const parsed = LessonInputSchema.parse({
      course_id: S,
      slug: 'linear-equations',
      title: 'Linear equations',
      duration_minutes: '12.5',
      video_provider: 'supabase',
      video_asset_id: 'lessons/a/b.mp4',
      body: 'Notes',
      objectives: ['Solve one-step equations'],
    })
    const rows = lessonRows(parsed)
    expect(rows.lesson).toMatchObject({ skill_id: null, duration_seconds: 750, video_provider: 'supabase', objectives: ['Solve one-step equations'] })
    expect(rows.content).toEqual({ body: 'Notes', video_asset_id: 'lessons/a/b.mp4' })
    const text = lessonRows(LessonInputSchema.parse({ course_id: S, slug: 'notes', title: 'Notes only', video_provider: 'none', video_asset_id: 'stale' }))
    expect(text.content.video_asset_id).toBeNull()
    expect(LessonInputSchema.safeParse({ course_id: S, slug: 'x', title: 'Bad asset', video_provider: 'bunny', video_asset_id: 'a b' }).success).toBe(false)
    expect(LessonInputSchema.safeParse({ course_id: S, slug: 'x', title: 'Traversal', video_provider: 'supabase', video_asset_id: '../x.mp4' }).success).toBe(false)
  })

  it('only accepts https resource links', () => {
    expect(LessonResourceLinkSchema.safeParse({ lesson_id: S, title: 'Desmos', url: 'https://www.desmos.com' }).success).toBe(true)
    expect(LessonResourceLinkSchema.safeParse({ lesson_id: S, title: 'Insecure', url: 'http://example.com' }).success).toBe(false)
    expect(LessonResourceLinkSchema.safeParse({ lesson_id: S, title: 'JS', url: 'javascript:alert(1)' }).success).toBe(false)
  })

  it('slugifies titles', () => {
    expect(slugify('Linear Equations: Intro!')).toBe('linear-equations-intro')
    expect(slugify("  O'zbek tili — kirish  ")).toBe('o-zbek-tili-kirish')
    expect(slugify('Ünïcödé')).toBe('unicode')
  })
})

describe('uploads', () => {
  it('checks file type and size per purpose', () => {
    expect(checkUploadFile('question_image', { type: 'image/png', size: 1000 })).toBeNull()
    expect(checkUploadFile('question_image', { type: 'image/svg+xml', size: 1000 })).toMatch(/Unsupported/)
    expect(checkUploadFile('question_image', { type: 'image/webp', size: 2 * 1024 * 1024 + 1 })).toMatch(/too large/)
    expect(checkUploadFile('lesson_video', { type: 'video/mp4', size: 400 * 1024 * 1024 })).toBeNull()
    expect(checkUploadFile('lesson_resource', { type: 'application/pdf', size: 0 })).toMatch(/empty/)
  })

  it('accepts only server-minted storage paths', () => {
    expect(QUESTION_IMAGE_PATH_RE.test('questions/6f1c2c0e-1111-4111-8111-111111111111.png')).toBe(true)
    expect(QUESTION_IMAGE_PATH_RE.test('questions/../secret.png')).toBe(false)
    expect(LESSON_FILE_PATH_RE.test('lessons/6f1c2c0e-1111-4111-8111-111111111111/7f1c2c0e-1111-4111-8111-111111111111.mp4')).toBe(true)
    expect(LESSON_FILE_PATH_RE.test('lessons/x/y.mp4')).toBe(false)
  })
})

describe('form errors', () => {
  it('keeps nested paths and summarizes', () => {
    const r = QuestionInputSchema.safeParse(mc({ stem: '', options: mc().options.map((o, i) => (i === 0 ? { ...o, content: '' } : o)) }))
    expect(r.success).toBe(false)
    if (r.success) return
    const fe = issuesToFieldErrors(r.error.issues)
    expect(fe['options.0.content']).toEqual(['Write option A.'])
    expect(summarizeFieldErrors(fe)).toMatch(/\(and 1 more\)$/)
    expect(summarizeFieldErrors({})).toBe('Some fields are invalid.')
  })
})
