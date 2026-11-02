import { z } from 'zod'
import { parseSprResponse } from '@/lib/scoring'
import {
  DIFFICULTIES,
  LIMITS,
  OPTION_LABELS,
  QUESTION_SOURCES,
  QUESTION_TYPES,
  STIMULUS_TYPES,
  type OptionLabelValue,
  type QuestionStatus,
} from './constants'

/**
 * The single question schema used by the editor (client-side hints), the server actions,
 * POST/PATCH /api/admin/questions and the bulk importer. Pure and client-safe.
 * The database re-checks everything (CHECK constraints, admin_upsert_question, publish guard).
 */

const SAFE_STORAGE_PATH = /^(?!.*\.\.)[A-Za-z0-9/_.-]{1,300}$/

const SPR_REASON: Record<string, string> = {
  empty: 'Enter a value.',
  too_long: 'Too long: up to 5 characters (6 with a minus sign).',
  invalid: 'Use a number, decimal or fraction such as 12, .75 or 3/4.',
  mixed_number: 'Mixed numbers are not accepted. Write 3 1/2 as 7/2 or 3.5.',
  division_by_zero: 'The denominator cannot be zero.',
}

export function sprAnswerError(value: string): string | null {
  const parsed = parseSprResponse(value)
  return parsed.ok ? null : (SPR_REASON[parsed.reason] ?? 'Invalid answer.')
}

export const QuestionOptionSchema = z.object({
  label: z.enum(OPTION_LABELS),
  content: z.string().trim().max(LIMITS.option, `Options can be at most ${LIMITS.option} characters.`),
})

export const QuestionInputSchema = z
  .object({
    subject_id: z.guid('Choose a subject.'),
    domain_id: z.guid('Choose a domain.'),
    skill_id: z.guid('Choose a skill.'),
    difficulty: z.enum(DIFFICULTIES, 'Choose a difficulty.'),
    question_type: z.enum(QUESTION_TYPES, 'Choose an answer format.'),
    stimulus_type: z.enum(STIMULUS_TYPES, 'Choose a stimulus type.').default('text'),
    stem: z
      .string()
      .trim()
      .min(1, 'Write the question stem.')
      .max(LIMITS.stem, `The stem can be at most ${LIMITS.stem} characters.`),
    passage: z.string().trim().max(LIMITS.passage, `The passage can be at most ${LIMITS.passage} characters.`).default(''),
    image_path: z.string().trim().max(300).default(''),
    image_alt: z.string().trim().max(LIMITS.imageAlt, `Alt text can be at most ${LIMITS.imageAlt} characters.`).default(''),
    options: z.array(QuestionOptionSchema).max(4).default([]),
    correct_option: z.enum(OPTION_LABELS).nullable().default(null),
    spr_answers: z.array(z.string().trim()).max(LIMITS.sprAnswers, `At most ${LIMITS.sprAnswers} accepted answers.`).default([]),
    explanation_en: z
      .string()
      .trim()
      .min(1, 'An English explanation is required.')
      .max(LIMITS.explanation, `Explanations can be at most ${LIMITS.explanation} characters.`),
    explanation_uz: z.string().trim().max(LIMITS.explanation, `Explanations can be at most ${LIMITS.explanation} characters.`).default(''),
    explanation_ru: z.string().trim().max(LIMITS.explanation, `Explanations can be at most ${LIMITS.explanation} characters.`).default(''),
    estimated_seconds: z.coerce
      .number('Enter a number of seconds.')
      .int('Use whole seconds.')
      .min(10, 'At least 10 seconds.')
      .max(900, 'At most 900 seconds.')
      .default(75),
    tags: z
      .array(z.string().trim().min(1, 'Tags cannot be empty.').max(LIMITS.tag, `Tags can be at most ${LIMITS.tag} characters.`))
      .max(LIMITS.tags, `At most ${LIMITS.tags} tags.`)
      .default([]),
    source: z.enum(QUESTION_SOURCES).default('original'),
    source_reference: z.string().trim().max(LIMITS.sourceReference).default(''),
  })
  .superRefine((v, ctx) => {
    if (v.stimulus_type === 'passage' && !v.passage) {
      ctx.addIssue({ code: 'custom', path: ['passage'], message: 'A passage question needs passage text.' })
    }
    if (v.stimulus_type === 'image' && !v.image_path) {
      ctx.addIssue({ code: 'custom', path: ['image_path'], message: 'Upload an image for an image question.' })
    }
    if (v.image_path) {
      if (!SAFE_STORAGE_PATH.test(v.image_path)) {
        ctx.addIssue({ code: 'custom', path: ['image_path'], message: 'The image path is invalid. Upload the image again.' })
      }
      if (!v.image_alt) {
        ctx.addIssue({ code: 'custom', path: ['image_alt'], message: 'Describe the image for screen-reader users (alt text).' })
      }
    }

    if (v.question_type === 'multiple_choice') {
      if (v.options.length !== 4) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Multiple-choice questions need exactly 4 options (A–D).' })
      } else {
        v.options.forEach((o, i) => {
          if (o.label !== OPTION_LABELS[i]) {
            ctx.addIssue({ code: 'custom', path: ['options', i, 'label'], message: `Option ${i + 1} must be labelled ${OPTION_LABELS[i]}.` })
          }
          if (!o.content) {
            ctx.addIssue({ code: 'custom', path: ['options', i, 'content'], message: `Write option ${OPTION_LABELS[i]}.` })
          }
        })
        const contents = v.options.map((o) => o.content.toLowerCase()).filter(Boolean)
        if (new Set(contents).size !== contents.length) {
          ctx.addIssue({ code: 'custom', path: ['options'], message: 'Two options have the same text.' })
        }
      }
      if (!v.correct_option) {
        ctx.addIssue({ code: 'custom', path: ['correct_option'], message: 'Mark exactly one option as correct.' })
      }
    } else {
      const answers = v.spr_answers.filter((a) => a !== '')
      if (answers.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['spr_answers'], message: 'Add at least one accepted answer.' })
      }
      const seen = new Set<string>()
      v.spr_answers.forEach((a, i) => {
        if (a === '') return
        const err = sprAnswerError(a)
        if (err) {
          ctx.addIssue({ code: 'custom', path: ['spr_answers', i], message: `"${a}": ${err}` })
          return
        }
        const normalized = (parseSprResponse(a) as { ok: true; normalized: string }).normalized
        if (seen.has(normalized)) {
          ctx.addIssue({ code: 'custom', path: ['spr_answers', i], message: `"${a}" is listed twice.` })
        }
        seen.add(normalized)
      })
    }

    const tagSet = new Set(v.tags.map((t) => t.toLowerCase()))
    if (tagSet.size !== v.tags.length) {
      ctx.addIssue({ code: 'custom', path: ['tags'], message: 'Tags must be unique.' })
    }
  })

export type QuestionInput = z.output<typeof QuestionInputSchema>
export type QuestionInputRaw = z.input<typeof QuestionInputSchema>

/** Payload accepted by public.admin_upsert_question(jsonb) — migration 0009. */
export type QuestionRpcPayload = {
  id?: string
  subject_id: string
  domain_id: string
  skill_id: string
  difficulty: string
  question_type: string
  stimulus_type: string
  stem: string
  passage: string | null
  image_path: string | null
  image_alt: string | null
  estimated_seconds: number
  tags: string[]
  source: string
  source_reference: string | null
  status: Exclude<QuestionStatus, 'archived'>
  options: Array<{ label: OptionLabelValue; content: string; is_correct: boolean }>
  spr_answers: string[]
  explanations: Array<{ locale: 'en' | 'uz' | 'ru'; content: string }>
}

/**
 * Validated input → RPC payload. Normalizes SPR answers (parseSprResponse), drops options for
 * SPR and answers for MC, keeps only non-empty explanations, and fixes option positions.
 */
export function buildQuestionPayload(
  input: QuestionInput,
  opts: { id?: string | null; status?: Exclude<QuestionStatus, 'archived'> } = {},
): QuestionRpcPayload {
  const isMc = input.question_type === 'multiple_choice'
  const spr = isMc
    ? []
    : [
        ...new Set(
          input.spr_answers
            .map((a) => parseSprResponse(a))
            .filter((p): p is { ok: true; normalized: string; value: number } => p.ok)
            .map((p) => p.normalized),
        ),
      ]
  const explanations: QuestionRpcPayload['explanations'] = []
  if (input.explanation_en) explanations.push({ locale: 'en', content: input.explanation_en })
  if (input.explanation_uz) explanations.push({ locale: 'uz', content: input.explanation_uz })
  if (input.explanation_ru) explanations.push({ locale: 'ru', content: input.explanation_ru })

  const hasImage = Boolean(input.image_path)
  const payload: QuestionRpcPayload = {
    subject_id: input.subject_id,
    domain_id: input.domain_id,
    skill_id: input.skill_id,
    difficulty: input.difficulty,
    question_type: input.question_type,
    stimulus_type: input.stimulus_type,
    stem: input.stem,
    passage: input.passage ? input.passage : null,
    image_path: hasImage ? input.image_path : null,
    image_alt: hasImage ? input.image_alt || null : null,
    estimated_seconds: input.estimated_seconds,
    tags: [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))],
    source: input.source,
    source_reference: input.source_reference ? input.source_reference : null,
    status: opts.status ?? 'draft',
    options: isMc
      ? OPTION_LABELS.map((label, i) => ({
          label,
          content: input.options[i]?.content ?? '',
          is_correct: input.correct_option === label,
        }))
      : [],
    spr_answers: spr,
    explanations,
  }
  if (opts.id) payload.id = opts.id
  return payload
}

/** Editor state for a blank question. */
export function emptyQuestionInput(defaults: Partial<QuestionInputRaw> = {}): QuestionInputRaw {
  return {
    subject_id: '',
    domain_id: '',
    skill_id: '',
    difficulty: 'medium',
    question_type: 'multiple_choice',
    stimulus_type: 'text',
    stem: '',
    passage: '',
    image_path: '',
    image_alt: '',
    options: OPTION_LABELS.map((label) => ({ label, content: '' })),
    correct_option: null,
    spr_answers: [''],
    explanation_en: '',
    explanation_uz: '',
    explanation_ru: '',
    estimated_seconds: 75,
    tags: [],
    source: 'original',
    source_reference: '',
    ...defaults,
  }
}
