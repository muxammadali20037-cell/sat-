import { z } from 'zod'

/**
 * Study guides ("O‘zbekcha qo‘llanma"): structured, locale-specific explanations of each Digital SAT
 * skill and of general test strategy. Content is authored as JSON in `content/guides/*.json`,
 * validated here, shipped to the database by a generated migration, and editable in the admin panel.
 *
 * Text fields use SAT MASTER rich text: paragraphs, **bold**, *italic*, __underline__, "- " lists,
 * $inline math$ and $$display math$$ (escape a literal dollar as \$).
 */

export const GUIDE_KINDS = ['skill', 'strategy'] as const
export type GuideKind = (typeof GUIDE_KINDS)[number]

export const GUIDE_LOCALES = ['uz', 'en', 'ru'] as const
export type GuideLocale = (typeof GUIDE_LOCALES)[number]

export const SECTION_TYPES = [
  'concept', // what it is / what the question tests
  'recognize', // how to recognise this question type
  'method', // step-by-step method
  'watch_out', // what to pay attention to
  'traps', // common mistakes and distractor patterns
  'example', // worked example
  'time', // pacing advice
  'terms', // English terms with explanations
  'checklist', // quick checklist before answering
  'note', // anything else (platform tips, rules)
] as const
export type SectionType = (typeof SECTION_TYPES)[number]

const richText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => (s.replace(/\\\$/g, '').match(/\$/g)?.length ?? 0) % 2 === 0, 'Unbalanced $ math delimiters')

export const exampleSchema = z.object({
  /** The problem as it would appear on the test (English), rich text. */
  problem: richText(3000),
  /** Optional passage / context shown above the problem (English). */
  passage: richText(3000).optional(),
  /** Answer choices A–D (English). Omit for student-produced response. */
  choices: z.array(richText(400)).length(4).optional(),
  /** Solution steps in the guide's language. */
  solution: z.array(richText(1200)).min(1).max(12),
  /** Final answer, e.g. "B" or "B) 12" or "7/2". */
  answer: richText(200),
})

export const termSchema = z.object({
  term: z.string().trim().min(1).max(80),
  meaning: richText(400),
})

export const sectionSchema = z
  .object({
    type: z.enum(SECTION_TYPES),
    heading: z.string().trim().min(2).max(120),
    body: richText(4000).optional(),
    items: z.array(richText(800)).min(1).max(20).optional(),
    steps: z.array(richText(800)).min(2).max(12).optional(),
    example: exampleSchema.optional(),
    terms: z.array(termSchema).min(1).max(30).optional(),
  })
  .superRefine((s, ctx) => {
    const has = { body: !!s.body, items: !!s.items, steps: !!s.steps, example: !!s.example, terms: !!s.terms }
    if (!Object.values(has).some(Boolean)) ctx.addIssue({ code: 'custom', message: 'Section has no content' })
    if (s.type === 'method' && !s.steps) ctx.addIssue({ code: 'custom', message: 'A method section needs steps' })
    if (s.type === 'example' && !s.example) ctx.addIssue({ code: 'custom', message: 'An example section needs an example' })
    if (s.type === 'terms' && !s.terms) ctx.addIssue({ code: 'custom', message: 'A terms section needs terms' })
    if (s.type !== 'example' && s.example) ctx.addIssue({ code: 'custom', message: 'Only example sections may contain an example' })
    if (s.type !== 'terms' && s.terms) ctx.addIssue({ code: 'custom', message: 'Only terms sections may contain terms' })
  })
export type GuideSection = z.infer<typeof sectionSchema>

export const sectionsSchema = z.array(sectionSchema).min(2).max(16)

export const localeContentSchema = z.object({
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().min(10).max(600),
  sections: sectionsSchema,
})
export type GuideLocaleContent = z.infer<typeof localeContentSchema>

/** A guide as authored in content/guides/<slug>.json. */
export const guideFileSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case slug'),
    kind: z.enum(GUIDE_KINDS),
    /** Skill code from the reference data (required for skill guides). */
    skill: z
      .string()
      .regex(/^[a-z0-9_]{2,80}$/)
      .optional(),
    /** Subject grouping for strategy guides (null = general). */
    subject: z.enum(['math', 'reading_writing']).nullable().optional(),
    position: z.number().int().min(0).max(999),
    readingMinutes: z.number().int().min(1).max(60),
    locales: z
      .object({ uz: localeContentSchema.optional(), en: localeContentSchema.optional(), ru: localeContentSchema.optional() })
      .refine((l) => Object.values(l).some(Boolean), 'At least one locale is required'),
  })
  .superRefine((g, ctx) => {
    if (g.kind === 'skill' && !g.skill) ctx.addIssue({ code: 'custom', path: ['skill'], message: 'Skill guides need a skill code' })
    if (g.kind === 'strategy' && g.skill) ctx.addIssue({ code: 'custom', path: ['skill'], message: 'Strategy guides have no skill' })
  })
export type GuideFile = z.infer<typeof guideFileSchema>

/** Editorial completeness rules for skill guides (used by the validator and the admin editor). */
export function skillGuideGaps(content: GuideLocaleContent): string[] {
  const types = new Set(content.sections.map((s) => s.type))
  const gaps: string[] = []
  for (const required of ['concept', 'recognize', 'method', 'example', 'terms'] as const) {
    if (!types.has(required)) gaps.push(`missing a "${required}" section`)
  }
  if (!types.has('watch_out') && !types.has('traps')) gaps.push('missing a "watch_out" or "traps" section')
  const method = content.sections.find((s) => s.type === 'method')
  if (method?.steps && method.steps.length < 3) gaps.push('method needs at least 3 steps')
  return gaps
}
