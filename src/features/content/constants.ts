/**
 * Content constants shared by admin editors, server actions, API routes and the import
 * validator. Pure (client-safe). Values mirror CHECK constraints in migrations 0002/0003.
 */

export const QUESTION_STATUSES = ['draft', 'reviewed', 'published', 'archived'] as const
export type QuestionStatus = (typeof QUESTION_STATUSES)[number]
export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  draft: 'Draft',
  reviewed: 'Reviewed',
  published: 'Published',
  archived: 'Archived',
}

export const CONTENT_STATUSES = ['draft', 'published', 'archived'] as const
export type ContentStatus = (typeof CONTENT_STATUSES)[number]
export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
}

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export type DifficultyValue = (typeof DIFFICULTIES)[number]

export const QUESTION_TYPES = ['multiple_choice', 'student_produced_response'] as const
export type QuestionTypeValue = (typeof QUESTION_TYPES)[number]
export const QUESTION_TYPE_LABELS: Record<QuestionTypeValue, string> = {
  multiple_choice: 'Multiple choice',
  student_produced_response: 'Student-produced response',
}
export const QUESTION_TYPE_SHORT: Record<QuestionTypeValue, string> = {
  multiple_choice: 'MC',
  student_produced_response: 'SPR',
}

export const STIMULUS_TYPES = ['text', 'passage', 'image'] as const
export type StimulusTypeValue = (typeof STIMULUS_TYPES)[number]
export const STIMULUS_TYPE_LABELS: Record<StimulusTypeValue, string> = {
  text: 'Text only',
  passage: 'Passage',
  image: 'Image',
}

export const QUESTION_SOURCES = ['original', 'ai_generated', 'licensed'] as const
export type QuestionSource = (typeof QUESTION_SOURCES)[number]
export const QUESTION_SOURCE_LABELS: Record<QuestionSource, string> = {
  original: 'Original',
  ai_generated: 'AI generated',
  licensed: 'Licensed',
}

export const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const
export type OptionLabelValue = (typeof OPTION_LABELS)[number]

export const COURSE_LEVELS = ['all', 'beginner', 'intermediate', 'advanced'] as const
export type CourseLevel = (typeof COURSE_LEVELS)[number]
export const COURSE_LEVEL_LABELS: Record<CourseLevel, string> = {
  all: 'All levels',
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

export const VIDEO_PROVIDERS = ['none', 'bunny', 'supabase'] as const
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number]
export const VIDEO_PROVIDER_LABELS: Record<VideoProvider, string> = {
  none: 'No video (text lesson)',
  bunny: 'Bunny Stream',
  supabase: 'Supabase Storage',
}

/** Length limits (characters) mirroring the database checks. */
export const LIMITS = {
  stem: 5000,
  passage: 10000,
  option: 2000,
  explanation: 10000,
  imageAlt: 300,
  tag: 40,
  tags: 12,
  sourceReference: 300,
  sprAnswers: 10,
  lessonBody: 50000,
  lessonTitle: 160,
  lessonDescription: 2000,
  objective: 300,
  objectives: 12,
  learningObjectives: 20,
  resourceTitle: 160,
} as const

/** Minimum lesson-notes length for a text lesson to be publishable (lessons_guard_publish). */
export const MIN_TEXT_LESSON_BODY = 50

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const DOMAIN_CODE_RE = /^[a-z0-9_]{2,64}$/
export const SKILL_CODE_RE = /^[a-z0-9_]{2,80}$/
export const VIDEO_ASSET_ID_RE = /^[A-Za-z0-9/_.-]{1,300}$/
/** Paths minted by createUploadTarget (see upload-actions.ts). */
export const QUESTION_IMAGE_PATH_RE = /^questions\/[0-9a-f-]{36}\.(png|jpg|webp)$/
export const LESSON_FILE_PATH_RE = /^lessons\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp4|pdf|png|jpg)$/

export type UploadPurpose = 'question_image' | 'lesson_video' | 'lesson_resource'

export const UPLOAD_RULES: Record<
  UploadPurpose,
  { bucket: 'question-images' | 'lesson-videos' | 'lesson-resources'; maxBytes: number; types: Record<string, string>; label: string }
> = {
  question_image: {
    bucket: 'question-images',
    maxBytes: 2 * 1024 * 1024,
    types: { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' },
    label: 'PNG, JPEG or WebP up to 2 MB',
  },
  lesson_video: {
    bucket: 'lesson-videos',
    maxBytes: 500 * 1024 * 1024,
    types: { 'video/mp4': 'mp4' },
    label: 'MP4 up to 500 MB',
  },
  lesson_resource: {
    bucket: 'lesson-resources',
    maxBytes: 20 * 1024 * 1024,
    types: { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' },
    label: 'PDF, PNG or JPEG up to 20 MB',
  },
}

/** Client- and server-side check of a file against an upload rule. Returns an error message or null. */
export function checkUploadFile(purpose: UploadPurpose, file: { type: string; size: number }): string | null {
  const rule = UPLOAD_RULES[purpose]
  if (!rule.types[file.type]) return `Unsupported file type. Use ${rule.label}.`
  if (file.size <= 0) return 'The file is empty.'
  if (file.size > rule.maxBytes) return `The file is too large. Use ${rule.label}.`
  return null
}

export function isQuestionStatus(v: unknown): v is QuestionStatus {
  return typeof v === 'string' && (QUESTION_STATUSES as readonly string[]).includes(v)
}
export function isContentStatus(v: unknown): v is ContentStatus {
  return typeof v === 'string' && (CONTENT_STATUSES as readonly string[]).includes(v)
}
