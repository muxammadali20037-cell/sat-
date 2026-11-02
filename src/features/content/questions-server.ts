import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { DbActionError, profileNames } from '@/features/admin/server-utils'
import { OPTION_LABELS, isQuestionStatus, type QuestionStatus } from './constants'
import { buildQuestionPayload, type QuestionInput, type QuestionInputRaw, type QuestionRpcPayload } from './question-schema'

/** Calls public.admin_upsert_question with the USER-SCOPED client (SQL re-checks the role). */
export async function upsertQuestionRpc(db: Db, payload: QuestionRpcPayload): Promise<string> {
  const { data, error } = await db.rpc('admin_upsert_question', { p_payload: payload as unknown as Json })
  if (error) throw new DbActionError(error, { entity: 'question' })
  return data
}

/**
 * Create or update. Existing questions keep their workflow status (the SQL function refuses to
 * keep a reviewed/published question that became incomplete); archived ones return to draft.
 */
export async function saveQuestion(db: Db, input: QuestionInput, id?: string | null): Promise<{ id: string; status: QuestionStatus }> {
  let status: Exclude<QuestionStatus, 'archived'> = 'draft'
  if (id) {
    const { data, error } = await db.from('questions').select('status').eq('id', id).maybeSingle()
    if (error) throw new DbActionError(error, { entity: 'question' })
    if (!data) throw new DbActionError({ code: 'P0002', message: 'Question not found' })
    status = data.status === 'reviewed' || data.status === 'published' ? data.status : 'draft'
  }
  const newId = await upsertQuestionRpc(db, buildQuestionPayload(input, { id, status }))
  return { id: newId, status }
}

export type EditorQuestion = {
  id: string
  input: QuestionInputRaw
  status: QuestionStatus
  version: number
  createdAt: string
  updatedAt: string
  reviewedAt: string | null
  publishedAt: string | null
  archivedAt: string | null
  createdBy: { name: string; email: string } | null
  reviewedBy: { name: string; email: string } | null
  imageUrl: string | null
  isComplete: boolean
  usage: { attempts: number }
}

export async function loadQuestionForEditor(db: Db, id: string): Promise<EditorQuestion | null> {
  const { data: q, error } = await db
    .from('questions')
    .select(
      '*, answer_options(label, content, is_correct, position), question_spr_answers(value), question_explanations(locale, content)',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new DbActionError(error, { entity: 'question' })
  if (!q) return null

  const admin = createAdminSupabase()
  const [names, complete, usage, signed] = await Promise.all([
    // Content editors cannot read other profiles under RLS; names come from the service role
    // after the page authorized a staff member.
    profileNames(admin, [q.created_by, q.reviewed_by]),
    db.rpc('question_is_complete', { p_question_id: id }),
    admin.from('attempt_answers').select('id', { count: 'exact', head: true }).eq('question_id', id),
    q.image_path ? admin.storage.from('question-images').createSignedUrl(q.image_path, 60 * 60) : Promise.resolve(null),
  ])

  const options = [...(q.answer_options ?? [])].sort((a, b) => a.position - b.position)
  const explanation = (locale: string) => q.question_explanations?.find((e) => e.locale === locale)?.content ?? ''
  const correct = options.find((o) => o.is_correct)?.label
  return {
    id: q.id,
    status: isQuestionStatus(q.status) ? q.status : 'draft',
    version: q.version,
    createdAt: q.created_at,
    updatedAt: q.updated_at,
    reviewedAt: q.reviewed_at,
    publishedAt: q.published_at,
    archivedAt: q.archived_at,
    createdBy: q.created_by ? (names.get(q.created_by) ?? null) : null,
    reviewedBy: q.reviewed_by ? (names.get(q.reviewed_by) ?? null) : null,
    imageUrl: signed && 'data' in signed && signed.data ? signed.data.signedUrl : null,
    isComplete: complete.data === true,
    usage: { attempts: usage.count ?? 0 },
    input: {
      subject_id: q.subject_id,
      domain_id: q.domain_id,
      skill_id: q.skill_id,
      difficulty: q.difficulty as QuestionInputRaw['difficulty'],
      question_type: q.question_type as QuestionInputRaw['question_type'],
      stimulus_type: q.stimulus_type as QuestionInputRaw['stimulus_type'],
      stem: q.stem,
      passage: q.passage ?? '',
      image_path: q.image_path ?? '',
      image_alt: q.image_alt ?? '',
      options: OPTION_LABELS.map((label) => ({ label, content: options.find((o) => o.label === label)?.content ?? '' })),
      correct_option: correct && (OPTION_LABELS as readonly string[]).includes(correct) ? (correct as (typeof OPTION_LABELS)[number]) : null,
      spr_answers: (q.question_spr_answers ?? []).map((s) => s.value).concat((q.question_spr_answers ?? []).length ? [] : ['']),
      explanation_en: explanation('en'),
      explanation_uz: explanation('uz'),
      explanation_ru: explanation('ru'),
      estimated_seconds: q.estimated_seconds,
      tags: q.tags ?? [],
      source: q.source as QuestionInputRaw['source'],
      source_reference: q.source_reference ?? '',
    },
  }
}

/** Server-side copy as a new draft (never trusts browser state). */
export async function duplicateQuestion(db: Db, id: string): Promise<string> {
  const q = await loadQuestionForEditor(db, id)
  if (!q) throw new DbActionError({ code: 'P0002', message: 'Question not found' })
  const raw = q.input
  const payload: QuestionRpcPayload = {
    subject_id: raw.subject_id,
    domain_id: raw.domain_id,
    skill_id: raw.skill_id,
    difficulty: raw.difficulty,
    question_type: raw.question_type,
    stimulus_type: raw.stimulus_type ?? 'text',
    stem: raw.stem,
    passage: raw.passage || null,
    image_path: raw.image_path || null,
    image_alt: raw.image_path ? raw.image_alt || null : null,
    estimated_seconds: Number(raw.estimated_seconds ?? 75),
    tags: raw.tags ?? [],
    source: raw.source ?? 'original',
    source_reference: raw.source_reference || null,
    status: 'draft',
    options:
      raw.question_type === 'multiple_choice'
        ? OPTION_LABELS.map((label, i) => ({ label, content: raw.options?.[i]?.content ?? '', is_correct: raw.correct_option === label }))
        : [],
    spr_answers: raw.question_type === 'multiple_choice' ? [] : (raw.spr_answers ?? []).filter(Boolean),
    explanations: (['en', 'uz', 'ru'] as const)
      .map((locale) => ({ locale, content: (raw[`explanation_${locale}` as const] ?? '') as string }))
      .filter((e) => e.content.trim() !== ''),
  }
  return upsertQuestionRpc(db, payload)
}

/** Reads the current status (for routing decisions and messages). */
export async function questionStatus(db: Db, id: string): Promise<QuestionStatus | null> {
  const { data, error } = await db.from('questions').select('status').eq('id', id).maybeSingle()
  if (error) throw new DbActionError(error, { entity: 'question' })
  return data && isQuestionStatus(data.status) ? data.status : null
}
