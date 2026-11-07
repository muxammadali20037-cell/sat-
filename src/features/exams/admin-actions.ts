'use server'

import { revalidatePath } from 'next/cache'
import type { z } from 'zod'
import { getApiContext } from '@/lib/auth/session'
import { createServerSupabase, type Db } from '@/lib/supabase/server'
import { ApiError, type ActionResult } from '@/lib/api/errors'
import { writeAudit } from '@/lib/audit'
import { fetchAll } from '@/features/admin/server-utils'
import { CONTENT_ROLES } from '@/config/roles'
import { getTaxonomy } from '@/features/taxonomy/server'
import { FULL_LENGTH_COUNTS, type ExamSection, type ModuleVariant } from './machine'
import { allocateAutoFill, moduleLabel, nextMockNumber, requiredModuleSpecs, type PoolQuestion } from './builder'
import { examValidationIssues, getExamAdmin } from './admin'
import {
  AutoFillSchema,
  AutoFillExamSchema,
  CreateExamSchema,
  ExamSettingsSchema,
  ExamStatusSchema,
  ModuleDurationSchema,
  ModuleEntrySchema,
  ModuleQuestionSchema,
  MoveEntrySchema,
  QuestionSearchSchema,
} from './schemas'

/**
 * Exam builder mutations. Every action: DAL (content role) → Zod → user-scoped client, so RLS
 * (is_content_manager) applies and the audit triggers record the acting user.
 */

type Ctx = { db: Db; actorId: string; actorRole: string }

async function contentContext(): Promise<Ctx> {
  const { profile } = await getApiContext(CONTENT_ROLES)
  return { db: await createServerSupabase(), actorId: profile.id, actorRole: profile.role }
}

function failure(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError) return { ok: false, error: err.message }
  const e = err as { code?: string; message?: string }
  if (e?.code === '23505') return { ok: false, error: 'That value is already in use.' }
  if (e?.code === '42501') return { ok: false, error: 'You do not have permission to change mock exams.' }
  console.error('[admin/exams] action failed', err)
  return { ok: false, error: 'Something went wrong. Try again.' }
}

function invalid(error: z.ZodError): { ok: false; error: string; fieldErrors: Record<string, string[]> } {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message]
  }
  return { ok: false, error: 'Check the highlighted fields.', fieldErrors }
}

const revalidateExam = (examId: string) => {
  revalidatePath('/admin/exams')
  revalidatePath(`/admin/exams/${examId}`, 'layout')
  revalidatePath('/dashboard/mock-exams')
}

type ModuleRow = { id: string; mock_exam_id: string; section: ExamSection; module_number: 1 | 2; variant: ModuleVariant; status: string; isFullLength: boolean }

async function loadModule(db: Db, moduleId: string): Promise<ModuleRow> {
  const { data, error } = await db
    .from('mock_exam_modules')
    .select('id, mock_exam_id, section, module_number, variant, mock_exams(status, is_full_length)')
    .eq('id', moduleId)
    .maybeSingle()
  if (error) throw error
  if (!data || !data.mock_exams) throw new ApiError(404, 'NOT_FOUND', 'Module not found.')
  return {
    id: data.id,
    mock_exam_id: data.mock_exam_id,
    section: data.section as ExamSection,
    module_number: data.module_number === 2 ? 2 : 1,
    variant: data.variant as ModuleVariant,
    status: data.mock_exams.status,
    isFullLength: data.mock_exams.is_full_length,
  }
}

function assertDraft(status: string) {
  if (status !== 'draft') {
    throw new ApiError(409, 'CONFLICT', 'Move the exam back to draft before changing its structure or questions.')
  }
}

async function examQuestionIds(db: Db, examId: string): Promise<Map<string, string>> {
  const { data, error } = await db.from('mock_exam_questions').select('question_id, module_id, mock_exam_modules!inner(mock_exam_id)').eq('mock_exam_modules.mock_exam_id', examId)
  if (error) throw error
  return new Map(data.map((r) => [r.question_id, r.module_id]))
}

async function nextPosition(db: Db, moduleId: string): Promise<number> {
  const { data, error } = await db.from('mock_exam_questions').select('position').eq('module_id', moduleId).order('position', { ascending: false }).limit(1)
  if (error) throw error
  return (data[0]?.position ?? 0) + 1
}

// ---------------------------------------------------------------------------
// Exams
// ---------------------------------------------------------------------------

export async function createExamAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await contentContext()
    const parsed = CreateExamSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    const v = parsed.data
    const { data: exam, error } = await ctx.db
      .from('mock_exams')
      .insert({
        title: v.title,
        slug: v.slug,
        description: v.description,
        status: 'draft',
        is_adaptive: v.isAdaptive,
        routing_threshold: v.routingThreshold,
        break_seconds: v.breakMinutes * 60,
        is_full_length: v.isFullLength,
        created_by: ctx.actorId,
      })
      .select('id')
      .single()
    if (error) {
      if (error.code === '23505') return { ok: false, error: 'That slug is already used by another exam.', fieldErrors: { slug: ['Already in use.'] } }
      throw error
    }
    const specs = requiredModuleSpecs(v.isAdaptive, { reading_writing: v.rwModuleMinutes * 60, math: v.mathModuleMinutes * 60 })
    const { error: mErr } = await ctx.db.from('mock_exam_modules').insert(
      specs.map((s) => ({
        mock_exam_id: exam.id,
        section: s.section,
        module_number: s.moduleNumber,
        variant: s.variant,
        duration_seconds: s.durationSeconds,
      })),
    )
    if (mErr) {
      await ctx.db.from('mock_exams').delete().eq('id', exam.id)
      throw mErr
    }
    revalidateExam(exam.id)
    return { ok: true, data: { id: exam.id }, message: 'Exam created' }
  } catch (err) {
    return failure(err)
  }
}

/**
 * One click: creates the next full-length adaptive mock ("SAT Mock Test N", the same settings as the
 * New exam form's defaults) as a DRAFT and auto-fills all six modules (fresh questions first). The
 * editor still opens it and presses Publish.
 */
export async function createFilledMockAction(): Promise<ActionResult<{ id: string; title: string; added: number; shortfall: number; reused: number }>> {
  try {
    const ctx = await contentContext()
    const { data: slugRows, error: sErr } = await ctx.db.from('mock_exams').select('slug').like('slug', 'sat-mock-test-%').limit(5000)
    if (sErr) throw sErr
    const n = nextMockNumber((slugRows ?? []).map((r) => r.slug))
    const title = `SAT Mock Test ${n}`
    const created = await createExamAction({
      title,
      slug: `sat-mock-test-${n}`,
      description:
        'To‘liq Digital SAT formatidagi sinov imtihoni: Reading and Writing (2 modul, 64 daqiqa) va Math (2 modul, 70 daqiqa), o‘rtada 10 daqiqa tanaffus. Ikkinchi modul birinchi moduldagi natijangizga qarab osonroq yoki qiyinroq bo‘ladi. Natija taxminiy ball bo‘lib, rasmiy SAT natijasi emas.',
      isAdaptive: true,
      isFullLength: true,
      routingThreshold: 0.6,
      breakMinutes: 10,
      rwModuleMinutes: 32,
      mathModuleMinutes: 35,
    })
    if (!created.ok || !created.data) return created.ok ? { ok: false, error: 'The exam was not created.' } : created
    const filled = await autoFillExamAction({ examId: created.data.id })
    if (!filled.ok || !filled.data) return { ok: false, error: `${title} was created as a draft, but filling it failed: ${filled.ok ? 'no result' : filled.error}` }
    return {
      ok: true,
      data: { id: created.data.id, title, ...filled.data },
      message: `${title} created as a draft. ${filled.message ?? ''} Open it and press Publish.`,
    }
  } catch (err) {
    return failure(err)
  }
}

export async function updateExamAction(examId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await contentContext()
    const parsed = ExamSettingsSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    const v = parsed.data
    const exam = await getExamAdmin(ctx.db, examId)
    if (!exam) return { ok: false, error: 'Exam not found.' }
    const structural =
      Math.abs(exam.routingThreshold - v.routingThreshold) > 1e-6 || exam.breakSeconds !== v.breakMinutes * 60 || exam.isFullLength !== v.isFullLength
    if (structural) assertDraft(exam.status)
    const { error } = await ctx.db
      .from('mock_exams')
      .update({
        title: v.title,
        slug: v.slug,
        description: v.description,
        routing_threshold: v.routingThreshold,
        break_seconds: v.breakMinutes * 60,
        is_full_length: v.isFullLength,
      })
      .eq('id', examId)
    if (error) {
      if (error.code === '23505') return { ok: false, error: 'That slug is already used by another exam.', fieldErrors: { slug: ['Already in use.'] } }
      throw error
    }
    revalidateExam(examId)
    return { ok: true, message: 'Saved' }
  } catch (err) {
    return failure(err)
  }
}

export async function setExamStatusAction(input: unknown): Promise<ActionResult<{ issues?: string[] }>> {
  try {
    const ctx = await contentContext()
    const parsed = ExamStatusSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    const { examId, status } = parsed.data
    const exam = await getExamAdmin(ctx.db, examId)
    if (!exam) return { ok: false, error: 'Exam not found.' }
    if (status === 'published') {
      const issues = await examValidationIssues(ctx.db, exam)
      if (issues.length > 0) return { ok: false, error: `Fix ${issues.length} problem${issues.length === 1 ? '' : 's'} before publishing: ${issues.join(' ')}` }
    }
    const { error } = await ctx.db.from('mock_exams').update({ status }).eq('id', examId)
    if (error) throw error
    revalidateExam(examId)
    return { ok: true, message: status === 'published' ? 'Published' : status === 'archived' ? 'Archived' : 'Moved to draft' }
  } catch (err) {
    return failure(err)
  }
}

export async function setModuleDurationAction(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await contentContext()
    const parsed = ModuleDurationSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    const mod = await loadModule(ctx.db, parsed.data.moduleId)
    assertDraft(mod.status)
    const { error } = await ctx.db.from('mock_exam_modules').update({ duration_seconds: parsed.data.minutes * 60 }).eq('id', mod.id)
    if (error) throw error
    revalidateExam(mod.mock_exam_id)
    return { ok: true, message: 'Saved' }
  } catch (err) {
    return failure(err)
  }
}

// ---------------------------------------------------------------------------
// Module questions
// ---------------------------------------------------------------------------

export async function addQuestionAction(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await contentContext()
    const parsed = ModuleQuestionSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    const mod = await loadModule(ctx.db, parsed.data.moduleId)
    assertDraft(mod.status)
    const taxonomy = await getTaxonomy(ctx.db)
    const { data: q, error } = await ctx.db.from('questions').select('id, status, subject_id').eq('id', parsed.data.questionId).maybeSingle()
    if (error) throw error
    if (!q) return { ok: false, error: 'Question not found.' }
    if (q.status !== 'published') return { ok: false, error: 'Only published questions can be added to an exam.' }
    if (taxonomy.subjectById.get(q.subject_id)?.code !== mod.section) return { ok: false, error: 'That question belongs to the other subject.' }
    const used = await examQuestionIds(ctx.db, mod.mock_exam_id)
    if (used.has(q.id)) return { ok: false, error: 'That question is already used in this exam.' }
    const { error: insErr } = await ctx.db
      .from('mock_exam_questions')
      .insert({ module_id: mod.id, question_id: q.id, position: await nextPosition(ctx.db, mod.id) })
    if (insErr) throw insErr
    await writeAudit({
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      action: 'mock_exam.question_add',
      entityType: 'mock_exam_modules',
      entityId: mod.id,
      summary: `Added question ${q.id} to ${moduleLabel({ section: mod.section, moduleNumber: mod.module_number, variant: mod.variant })}`,
    })
    revalidateExam(mod.mock_exam_id)
    return { ok: true, message: 'Added' }
  } catch (err) {
    return failure(err)
  }
}

export async function removeQuestionAction(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await contentContext()
    const parsed = ModuleEntrySchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    const mod = await loadModule(ctx.db, parsed.data.moduleId)
    assertDraft(mod.status)
    const { data, error } = await ctx.db
      .from('mock_exam_questions')
      .delete()
      .eq('id', parsed.data.entryId)
      .eq('module_id', mod.id)
      .select('question_id')
    if (error) throw error
    if (data.length > 0) {
      await writeAudit({
        actorId: ctx.actorId,
        actorRole: ctx.actorRole,
        action: 'mock_exam.question_remove',
        entityType: 'mock_exam_modules',
        entityId: mod.id,
        summary: `Removed question ${data[0]!.question_id}`,
      })
    }
    revalidateExam(mod.mock_exam_id)
    return { ok: true, message: 'Removed' }
  } catch (err) {
    return failure(err)
  }
}

export async function moveQuestionAction(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await contentContext()
    const parsed = MoveEntrySchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    const mod = await loadModule(ctx.db, parsed.data.moduleId)
    assertDraft(mod.status)
    const { data: rows, error } = await ctx.db.from('mock_exam_questions').select('id, position').eq('module_id', mod.id).order('position')
    if (error) throw error
    const i = rows.findIndex((r) => r.id === parsed.data.entryId)
    const j = parsed.data.direction === 'up' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= rows.length) return { ok: true }
    const a = rows[i]!
    const b = rows[j]!
    // Swap through a temporary slot (unique (module_id, position)).
    const temp = 32000 + Math.floor(Math.random() * 700)
    for (const [id, position] of [
      [a.id, temp],
      [b.id, a.position],
      [a.id, b.position],
    ] as const) {
      const { error: uErr } = await ctx.db.from('mock_exam_questions').update({ position }).eq('id', id)
      if (uErr) throw uErr
    }
    revalidateExam(mod.mock_exam_id)
    return { ok: true }
  } catch (err) {
    return failure(err)
  }
}

type FillResult = { added: number; shortfall: number; reused: number; full: boolean }

/** Fills one module (see allocateAutoFill). Fresh questions first; reuse from other exams only on shortfall. Audited. */
async function fillModule(ctx: Awaited<ReturnType<typeof contentContext>>, moduleId: string, count: number, mode: 'append' | 'replace'): Promise<FillResult> {
  const mod = await loadModule(ctx.db, moduleId)
  assertDraft(mod.status)
  const target = mod.isFullLength ? FULL_LENGTH_COUNTS[mod.section] : count
  const taxonomy = await getTaxonomy(ctx.db)
  const subject = taxonomy.subjectByCode.get(mod.section)
  if (!subject) throw new ApiError(400, 'VALIDATION_FAILED', 'Subject not configured.')

  if (mode === 'replace') {
    const { error } = await ctx.db.from('mock_exam_questions').delete().eq('module_id', mod.id)
    if (error) throw error
  }
  const used = await examQuestionIds(ctx.db, mod.mock_exam_id)
  const { data: existingRows, error: eErr } = await ctx.db
    .from('mock_exam_questions')
    .select('question_id, questions(id, domain_id, skill_id, difficulty)')
    .eq('module_id', mod.id)
  if (eErr) throw eErr
  const existing: PoolQuestion[] = existingRows
    .filter((r) => r.questions)
    .map((r) => ({ id: r.question_id, domainId: r.questions!.domain_id, skillId: r.questions!.skill_id, difficulty: r.questions!.difficulty as PoolQuestion['difficulty'] }))
  if (existing.length >= target) return { added: 0, shortfall: 0, reused: 0, full: true }

  // Paged: the hosted API returns at most 1000 rows per request.
  const { rows: pool } = await fetchAll(
    (from, to) => ctx.db.from('questions').select('id, domain_id, skill_id, difficulty').eq('subject_id', subject.id).eq('status', 'published').order('id').range(from, to),
    { max: 100_000 },
  )
  // Questions already used in OTHER mock exams: kept for last, so each exam gets fresh questions
  // while the bank allows; they are only reused to cover a shortfall.
  const { rows: otherRows } = await fetchAll(
    (from, to) =>
      ctx.db
        .from('mock_exam_questions')
        .select('question_id, mock_exam_modules!inner(mock_exam_id)')
        .neq('mock_exam_modules.mock_exam_id', mod.mock_exam_id)
        .order('module_id')
        .order('question_id')
        .range(from, to),
    { max: 200_000 },
  )
  const inOtherExams = new Set(otherRows.map((r) => r.question_id))
  const candidates = pool
    .filter((q) => !used.has(q.id))
    .map((q) => ({ id: q.id, domainId: q.domain_id, skillId: q.skill_id, difficulty: q.difficulty as PoolQuestion['difficulty'] }))
  const base = {
    targetCount: target,
    section: mod.section,
    moduleNumber: mod.module_number,
    variant: mod.variant,
    domains: taxonomy.domains.filter((d) => d.subjectId === subject.id).map((d) => ({ id: d.id, weightPercent: d.weightPercent, position: d.position })),
  }
  const fresh = allocateAutoFill({ ...base, existing, pool: candidates.filter((q) => !inOtherExams.has(q.id)) })
  const result =
    fresh.shortfall === 0
      ? fresh
      : (() => {
          const picked = new Set(fresh.selected)
          const withFresh = [...existing, ...candidates.filter((q) => picked.has(q.id))]
          const topUp = allocateAutoFill({ ...base, existing: withFresh, pool: candidates.filter((q) => !picked.has(q.id)) })
          return { ...topUp, selected: [...fresh.selected, ...topUp.selected], allocation: topUp.allocation }
        })()
  const reused = result.selected.filter((id) => inOtherExams.has(id)).length
  if (result.selected.length > 0) {
    const start = await nextPosition(ctx.db, mod.id)
    const { error: insErr } = await ctx.db
      .from('mock_exam_questions')
      .insert(result.selected.map((questionId, i) => ({ module_id: mod.id, question_id: questionId, position: start + i })))
    if (insErr) throw insErr
  }
  await writeAudit({
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    action: 'mock_exam.autofill',
    entityType: 'mock_exam_modules',
    entityId: mod.id,
    summary: `Auto-fill (${mode}) added ${result.selected.length} of ${target - existing.length} needed (${reused} also in other exams); shortfall ${result.shortfall}`,
    after: { allocation: result.allocation },
  })
  return { added: result.selected.length, shortfall: result.shortfall, reused, full: false }
}

function fillMessage(r: { added: number; shortfall: number; reused: number }): string {
  return r.shortfall > 0
    ? `Added ${r.added}; the bank is short by ${r.shortfall}.`
    : `Added ${r.added} questions${r.reused > 0 ? ` (${r.reused} also appear in another mock exam — the bank had too few unused ones)` : ''}`
}

export async function autoFillModuleAction(input: unknown): Promise<ActionResult<{ added: number; shortfall: number }>> {
  try {
    const ctx = await contentContext()
    const parsed = AutoFillSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    const r = await fillModule(ctx, parsed.data.moduleId, parsed.data.count, parsed.data.mode)
    const mod = await loadModule(ctx.db, parsed.data.moduleId)
    revalidateExam(mod.mock_exam_id)
    if (r.full) return { ok: true, data: { added: 0, shortfall: 0 }, message: 'The module is already full.' }
    return { ok: true, data: { added: r.added, shortfall: r.shortfall }, message: fillMessage(r) }
  } catch (err) {
    return failure(err)
  }
}

/** Fills every module of a draft exam in one go (append: questions already placed are kept). */
export async function autoFillExamAction(input: unknown): Promise<ActionResult<{ added: number; shortfall: number; reused: number }>> {
  try {
    const ctx = await contentContext()
    const parsed = AutoFillExamSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    const { data: mods, error } = await ctx.db
      .from('mock_exam_modules')
      .select('id, section, module_number, variant')
      .eq('mock_exam_id', parsed.data.examId)
      .order('section', { ascending: false })
      .order('module_number')
      .order('variant')
    if (error) throw error
    if (!mods || mods.length === 0) return { ok: false, error: 'Exam not found.' }
    const total = { added: 0, shortfall: 0, reused: 0 }
    for (const m of mods) {
      const r = await fillModule(ctx, m.id, parsed.data.count, 'append')
      total.added += r.added
      total.shortfall += r.shortfall
      total.reused += r.reused
    }
    revalidateExam(parsed.data.examId)
    return { ok: true, data: total, message: total.added === 0 && total.shortfall === 0 ? 'Every module is already full.' : fillMessage(total) }
  } catch (err) {
    return failure(err)
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type QuestionSearchRow = {
  id: string
  stem: string
  difficulty: string
  questionType: string
  domainName: string
  skillName: string
  usedInThisExam: boolean
}

const escapeLike = (s: string) => s.replace(/[\\%_*]/g, (c) => (c === '*' ? ' ' : `\\${c}`))

export async function searchQuestionsAction(input: unknown): Promise<ActionResult<{ rows: QuestionSearchRow[]; total: number; page: number; pageSize: number }>> {
  try {
    const ctx = await contentContext()
    const parsed = QuestionSearchSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    const v = parsed.data
    const mod = await loadModule(ctx.db, v.moduleId)
    const taxonomy = await getTaxonomy(ctx.db)
    const subject = taxonomy.subjectByCode.get(mod.section)
    if (!subject) return { ok: false, error: 'Subject not configured.' }
    const pageSize = 20
    let query = ctx.db
      .from('questions')
      .select('id, stem, difficulty, question_type, domain_id, skill_id', { count: 'exact' })
      .eq('subject_id', subject.id)
      .eq('status', 'published')
    if (v.domainId) query = query.eq('domain_id', v.domainId)
    if (v.skillId) query = query.eq('skill_id', v.skillId)
    if (v.difficulty) query = query.eq('difficulty', v.difficulty)
    if (v.q) {
      const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.q)
      query = isId ? query.eq('id', v.q) : query.ilike('stem', `%${escapeLike(v.q)}%`)
    }
    const { data, error, count } = await query.order('updated_at', { ascending: false }).range((v.page - 1) * pageSize, v.page * pageSize - 1)
    if (error) throw error
    const used = await examQuestionIds(ctx.db, mod.mock_exam_id)
    return {
      ok: true,
      data: {
        page: v.page,
        pageSize,
        total: count ?? 0,
        rows: data.map((q) => ({
          id: q.id,
          stem: q.stem,
          difficulty: q.difficulty,
          questionType: q.question_type,
          domainName: taxonomy.domainById.get(q.domain_id)?.name ?? '',
          skillName: taxonomy.skillById.get(q.skill_id)?.name ?? '',
          usedInThisExam: used.has(q.id),
        })),
      },
    }
  } catch (err) {
    return failure(err)
  }
}
