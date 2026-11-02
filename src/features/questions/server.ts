import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { AnswerKey } from '@/lib/scoring'
import type { Locale } from '@/lib/i18n/config'
import { getTaxonomy } from '@/features/taxonomy/server'
import type { Difficulty, OptionLabel, QuestionType, RevealedAnswer, SafeQuestion, StimulusType, SubjectCode } from '@/types/questions'

/**
 * The ONLY sanctioned way to turn question rows into browser payloads.
 * - loadSafeQuestions never selects `is_correct`, SPR answers or explanations.
 * - loadAnswerKeys / loadExplanations are for server-side scoring and post-answer reveals.
 * All functions take the service-role client: call them only after authorizing the request.
 */

const SIGNED_URL_TTL_SECONDS = 60 * 60

export async function loadSafeQuestions(
  admin: Db,
  questionIds: string[],
  options: { requirePublished?: boolean } = {},
): Promise<Map<string, SafeQuestion>> {
  const result = new Map<string, SafeQuestion>()
  if (questionIds.length === 0) return result
  const unique = [...new Set(questionIds)]

  let query = admin
    .from('questions')
    .select(
      'id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type, stem, passage, image_path, image_alt, estimated_seconds, status, answer_options(id, label, content, position)',
    )
    .in('id', unique)
  if (options.requirePublished) query = query.eq('status', 'published')
  const { data, error } = await query
  if (error) throw error

  const taxonomy = await getTaxonomy(admin)

  const imagePaths = data.map((q) => q.image_path).filter((p): p is string => !!p)
  const signed = new Map<string, string>()
  if (imagePaths.length > 0) {
    const { data: urls } = await admin.storage.from('question-images').createSignedUrls(imagePaths, SIGNED_URL_TTL_SECONDS)
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl)
  }

  for (const q of data) {
    const subject = taxonomy.subjectById.get(q.subject_id)
    result.set(q.id, {
      id: q.id,
      subjectCode: (subject?.code ?? 'math') as SubjectCode,
      domainId: q.domain_id,
      domainName: taxonomy.domainById.get(q.domain_id)?.name ?? '',
      skillId: q.skill_id,
      skillName: taxonomy.skillById.get(q.skill_id)?.name ?? '',
      difficulty: q.difficulty as Difficulty,
      questionType: q.question_type as QuestionType,
      stimulusType: q.stimulus_type as StimulusType,
      stem: q.stem,
      passage: q.passage,
      imageUrl: q.image_path ? (signed.get(q.image_path) ?? null) : null,
      imageAlt: q.image_alt,
      estimatedSeconds: q.estimated_seconds,
      options: (q.answer_options ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((o) => ({ id: o.id, label: o.label as OptionLabel, content: o.content })),
    })
  }
  return result
}

/** Server-only answer keys for scoring. Never serialize the result to the client. */
export async function loadAnswerKeys(admin: Db, questionIds: string[]): Promise<Map<string, AnswerKey>> {
  const keys = new Map<string, AnswerKey>()
  if (questionIds.length === 0) return keys
  const unique = [...new Set(questionIds)]
  const [questions, options, spr] = await Promise.all([
    admin.from('questions').select('id, question_type').in('id', unique),
    admin.from('answer_options').select('id, question_id').eq('is_correct', true).in('question_id', unique),
    admin.from('question_spr_answers').select('question_id, value').in('question_id', unique),
  ])
  if (questions.error) throw questions.error
  if (options.error) throw options.error
  if (spr.error) throw spr.error

  const correctOption = new Map(options.data.map((o) => [o.question_id, o.id]))
  const accepted = new Map<string, string[]>()
  for (const row of spr.data) accepted.set(row.question_id, [...(accepted.get(row.question_id) ?? []), row.value])

  for (const q of questions.data) {
    if (q.question_type === 'multiple_choice') {
      const id = correctOption.get(q.id)
      if (id) keys.set(q.id, { type: 'multiple_choice', correctOptionId: id })
    } else {
      keys.set(q.id, { type: 'student_produced_response', acceptedAnswers: accepted.get(q.id) ?? [] })
    }
  }
  return keys
}

/** Explanations in the requested locale with English fallback. */
export async function loadExplanations(admin: Db, questionIds: string[], locale: Locale): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (questionIds.length === 0) return out
  const locales = locale === 'en' ? ['en'] : [locale, 'en']
  const { data, error } = await admin
    .from('question_explanations')
    .select('question_id, locale, content')
    .in('question_id', [...new Set(questionIds)])
    .in('locale', locales)
  if (error) throw error
  for (const row of data) {
    if (row.locale === locale || !out.has(row.question_id)) out.set(row.question_id, row.content)
  }
  return out
}

export function buildReveal(
  questionId: string,
  key: AnswerKey | undefined,
  explanation: string | undefined,
  answer: { selectedOptionId: string | null; responseText: string | null; isCorrect: boolean | null },
): RevealedAnswer {
  return {
    questionId,
    isCorrect: answer.isCorrect,
    selectedOptionId: answer.selectedOptionId,
    responseText: answer.responseText,
    correctOptionId: key?.type === 'multiple_choice' ? key.correctOptionId : null,
    acceptedAnswers: key?.type === 'student_produced_response' ? key.acceptedAnswers : [],
    explanation: explanation ?? null,
  }
}

/** Validate that a submitted option id belongs to the question (prevents cross-question ids). */
export function optionBelongsToQuestion(question: SafeQuestion, optionId: string | null | undefined): boolean {
  return !!optionId && question.options.some((o) => o.id === optionId)
}
