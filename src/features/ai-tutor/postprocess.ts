import type { AnswerKey } from '@/lib/scoring'
import type { GeneratedPractice, TutorResponse } from '@/lib/ai/schemas'
import { checkCalculation, type CalculationCheck } from '@/lib/math/arith'

/**
 * Server-side post-processing of validated tutor output (pure, unit-tested):
 * clamp lengths, enforce the hint policy (no answer, no full solution), override the final answer
 * with the verified key in explain mode, and detect hints that leak the answer.
 */

export const TUTOR_LIMITS = {
  concept: 2000,
  mistake: 1200,
  hint: 1200,
  steps: 8,
  stepTitle: 120,
  stepBody: 1500,
  finalAnswer: 600,
  relatedSkill: 120,
  nextExercise: 400,
  misconception: 800,
  choices: 6,
  choiceText: 600,
  methodTitle: 80,
  methodBody: 1200,
  calculations: 6,
} as const

/** Trim and cut at a word boundary with an ellipsis. Never splits inside a `$…$` pair if avoidable. */
export function clampText(input: string, max: number): string {
  const text = input.trim()
  if (text.length <= max) return text
  let cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  if (space > max * 0.6) cut = cut.slice(0, space)
  // Drop a dangling unmatched inline-math delimiter so KaTeX does not swallow the tail.
  const dollars = (cut.replace(/\\\$/g, '').match(/\$/g) ?? []).length
  if (dollars % 2 === 1) cut = cut.slice(0, cut.lastIndexOf('$'))
  return `${cut.trimEnd()}…`
}

const nullableText = (value: string | null, max: number): string | null => {
  if (value === null) return null
  const t = clampText(value, max)
  return t.length > 0 ? t : null
}

export function clampTutorResponse(r: TutorResponse): TutorResponse {
  return {
    concept: clampText(r.concept, TUTOR_LIMITS.concept),
    identified_mistake: nullableText(r.identified_mistake, TUTOR_LIMITS.mistake),
    hint: nullableText(r.hint, TUTOR_LIMITS.hint),
    step_by_step_explanation: r.step_by_step_explanation
      .map((s) => ({ title: clampText(s.title, TUTOR_LIMITS.stepTitle), body: clampText(s.body, TUTOR_LIMITS.stepBody) }))
      .filter((s) => s.title.length > 0 || s.body.length > 0)
      .slice(0, TUTOR_LIMITS.steps),
    final_answer: nullableText(r.final_answer, TUTOR_LIMITS.finalAnswer),
    related_skill: nullableText(r.related_skill, TUTOR_LIMITS.relatedSkill),
    next_exercise: nullableText(r.next_exercise, TUTOR_LIMITS.nextExercise),
    misconception: nullableText(r.misconception ?? null, TUTOR_LIMITS.misconception),
    choice_analysis: (r.choice_analysis ?? [])
      .map((c) => ({ choice: c.choice.trim().replace(/^\(?([A-Za-z])\)?\.?$/, '$1').toUpperCase().slice(0, 4), why_wrong: clampText(c.why_wrong, TUTOR_LIMITS.choiceText) }))
      .filter((c) => c.choice.length > 0 && c.why_wrong.length > 0)
      .slice(0, TUTOR_LIMITS.choices),
    alternative_method:
      r.alternative_method && r.alternative_method.body.trim()
        ? { title: clampText(r.alternative_method.title, TUTOR_LIMITS.methodTitle), body: clampText(r.alternative_method.body, TUTOR_LIMITS.methodBody) }
        : null,
    calculations: (r.calculations ?? [])
      .filter((c) => c.expression.trim() && c.result.trim())
      .slice(0, TUTOR_LIMITS.calculations)
      .map((c) => ({ expression: c.expression.trim().slice(0, 200), result: c.result.trim().slice(0, 60) })),
  }
}

/** SAT MASTER's own check of each stated calculation (never trusted from the model). */
export function checkCalculations(r: TutorResponse): CalculationCheck[] {
  return r.calculations.map((c) => checkCalculation(c.expression, c.result))
}

/** Hint mode: the answer and the full worked solution are always removed before saving/returning. */
export function applyHintPolicy(r: TutorResponse): TutorResponse {
  // Worked calculations, a second method and per-choice verdicts would all give the answer away.
  return { ...r, final_answer: null, step_by_step_explanation: [], calculations: [], alternative_method: null, choice_analysis: [] }
}

/** Explain mode: the verified key always wins over whatever the model wrote. */
export function applyExplainPolicy(r: TutorResponse, verifiedAnswer: string, choices?: { labels: string[]; correct: string | null }): TutorResponse {
  // Per-choice "why wrong" notes are kept only for real choices that the key marks as wrong, so the
  // model can never label the verified answer as incorrect.
  const choice_analysis = choices
    ? r.choice_analysis.filter((c) => choices.labels.includes(c.choice) && c.choice !== choices.correct)
    : []
  return { ...r, final_answer: verifiedAnswer, choice_analysis }
}

/** Chat has no question attached, so there are no labelled choices to analyse. */
export function applyChatPolicy(r: TutorResponse): TutorResponse {
  return { ...r, choice_analysis: [] }
}

export type QuestionShape = {
  questionType: 'multiple_choice' | 'student_produced_response'
  options: { id: string; label: string; content: string }[]
}

export function formatVerifiedAnswer(q: QuestionShape, key: AnswerKey): string {
  if (key.type === 'multiple_choice') {
    const option = q.options.find((o) => o.id === key.correctOptionId)
    return option ? `${option.label}) ${option.content}` : 'See the explanation'
  }
  const [first, ...rest] = key.acceptedAnswers
  if (!first) return 'See the explanation'
  return rest.length > 0 ? `${first} (also accepted: ${rest.join(', ')})` : first
}

export function formatStudentAnswer(q: QuestionShape, answer: { selectedOptionId: string | null; responseText: string | null }): string | null {
  if (q.questionType === 'multiple_choice') {
    const option = q.options.find((o) => o.id === answer.selectedOptionId)
    return option ? `${option.label}) ${option.content}` : null
  }
  return answer.responseText?.trim() ? answer.responseText.trim() : null
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[$*_\\{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * True when the fields a hint keeps (concept, hint, feedback, next exercise) name the correct choice
 * or state the accepted answer. `final_answer` and the steps are always stripped, so they are not
 * checked. The key is only used here, server-side — it is never sent to the model in hint mode.
 */
export function hintRevealsAnswer(r: TutorResponse, q: QuestionShape, key: AnswerKey): boolean {
  const text = [r.concept, r.hint, r.identified_mistake, r.next_exercise, r.misconception]
    .filter((x): x is string => typeof x === 'string')
    .join('\n')
  if (key.type === 'multiple_choice') {
    const correct = q.options.find((o) => o.id === key.correctOptionId)
    if (!correct) return false
    const L = escapeRegex(correct.label)
    const patterns = [
      new RegExp(`\\b(?:answer|choice|option)\\s*(?:is|=|:)?\\s*\\(?${L}\\)?(?![A-Za-z0-9])`, 'i'),
      new RegExp(`\\(${L}\\)\\s*(?:is\\s+)?(?:correct|right)`, 'i'),
      new RegExp(`(?:^|\\s)${L}\\)?\\s+is\\s+(?:the\\s+)?(?:correct|right)`, ''),
    ]
    if (patterns.some((p) => p.test(text))) return true
    const content = normalize(correct.content)
    return content.length >= 12 && normalize(text).includes(content)
  }
  return key.acceptedAnswers.some((accepted) => {
    const a = escapeRegex(accepted.trim())
    // Not followed by more of a number ("3/4" must not match "3/45" or "3/4.5"); a sentence period is fine.
    return new RegExp(`\\b(?:answer|result|solution)\\s*(?:is|=|:)\\s*\\$?\\s*${a}(?!\\d|[./]\\d)`, 'i').test(text)
  })
}

/** Plain-text rendering stored in ai_messages.content (history for later turns, fallback display). */
export function tutorResponseToText(r: TutorResponse): string {
  const parts: string[] = []
  if (r.concept) parts.push(r.concept)
  if (r.identified_mistake) parts.push(`Feedback: ${r.identified_mistake}`)
  if (r.hint) parts.push(`Hint: ${r.hint}`)
  if (r.step_by_step_explanation.length) {
    parts.push(r.step_by_step_explanation.map((s, i) => `${i + 1}. ${s.title}: ${s.body}`).join('\n'))
  }
  if (r.misconception) parts.push(`Misconception: ${r.misconception}`)
  if (r.choice_analysis.length) parts.push(r.choice_analysis.map((c) => `${c.choice}: ${c.why_wrong}`).join('\n'))
  if (r.alternative_method) parts.push(`Another way (${r.alternative_method.title}): ${r.alternative_method.body}`)
  if (r.final_answer) parts.push(`Answer: ${r.final_answer}`)
  if (r.next_exercise) parts.push(`Next: ${r.next_exercise}`)
  return parts.join('\n\n').slice(0, 19_000)
}

/** Map the model's free-text skill name onto the taxonomy (exact name/code, case-insensitive). */
export function matchSkill(name: string | null, skills: { id: string; name: string; code: string }[]): string | null {
  if (!name) return null
  const n = normalize(name)
  const hit =
    skills.find((s) => normalize(s.name) === n || s.code === n.replace(/\s+/g, '_')) ??
    skills.find((s) => n.length >= 6 && normalize(s.name).includes(n)) ??
    skills.find((s) => normalize(s.name).length >= 6 && n.includes(normalize(s.name)))
  return hit?.id ?? null
}

/** Short title for a new session. */
export function sessionTitle(text: string, max = 80): string {
  const flat = text.replace(/\$+/g, '').replace(/\s+/g, ' ').trim()
  if (!flat) return 'New conversation'
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

// ---------------------------------------------------------------------------
// Generated practice drafts
// ---------------------------------------------------------------------------

/** Mirrors the ai_generated_questions CHECK limits (options kept short for the UI). */
export const GENERATED_LIMITS = { stem: 5000, passage: 6000, option: 500, explanation: 6000 } as const

const normOption = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** Server validation beyond the schema; an error code makes run.ts retry once. */
export function validateGeneratedDraft(d: GeneratedPractice): string | null {
  if (!d.stem.trim() || !d.explanation.trim()) return 'draft_empty'
  if (d.options.length !== 4 || d.options.some((o) => !o.trim())) return 'draft_empty_option'
  if (new Set(d.options.map(normOption)).size !== 4) return 'draft_duplicate_options'
  if (d.stem.length > GENERATED_LIMITS.stem || (d.passage?.length ?? 0) > GENERATED_LIMITS.passage) return 'draft_too_long'
  if (d.options.some((o) => o.length > GENERATED_LIMITS.option) || d.explanation.length > GENERATED_LIMITS.explanation) return 'draft_too_long'
  return null
}

export function cleanGeneratedDraft(d: GeneratedPractice): GeneratedPractice {
  return {
    stem: d.stem.trim(),
    passage: d.passage?.trim() ? d.passage.trim() : null,
    options: d.options.map((o) => o.trim().replace(/^\(?[A-Da-d][).:]\s+/, '')),
    correct_index: d.correct_index,
    explanation: clampText(d.explanation, GENERATED_LIMITS.explanation),
  }
}
