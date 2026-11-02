import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getTaxonomy } from '@/features/taxonomy/server'
import { SECTIONS, type ExamSection, type ModuleVariant } from './machine'
import { validateExamForPublish, type ValidationModule } from './builder'

/**
 * Admin read models for the exam builder. They use the USER-scoped client: RLS lets staff read
 * exams, modules, module questions and the question bank (writes need a content role).
 */

export type AdminModule = {
  id: string
  section: ExamSection
  moduleNumber: 1 | 2
  variant: ModuleVariant
  durationSeconds: number
  questionCount: number
}

export type AdminExam = {
  id: string
  title: string
  slug: string
  description: string
  status: 'draft' | 'published' | 'archived'
  isAdaptive: boolean
  isFullLength: boolean
  routingThreshold: number
  breakSeconds: number
  updatedAt: string
  modules: AdminModule[]
}

const VARIANT_ORDER: Record<ModuleVariant, number> = { standard: 0, easier: 1, harder: 2 }
export function sortAdminModules<T extends { section: ExamSection; moduleNumber: number; variant: ModuleVariant }>(modules: T[]): T[] {
  return [...modules].sort(
    (a, b) =>
      SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.moduleNumber - b.moduleNumber || VARIANT_ORDER[a.variant] - VARIANT_ORDER[b.variant],
  )
}

type ExamRow = {
  id: string
  title: string
  slug: string
  description: string
  status: string
  is_adaptive: boolean
  is_full_length: boolean
  routing_threshold: number
  break_seconds: number
  updated_at: string
}

async function withModules(db: Db, exams: ExamRow[]): Promise<AdminExam[]> {
  if (exams.length === 0) return []
  const { data: modules, error } = await db
    .from('mock_exam_modules')
    .select('id, mock_exam_id, section, module_number, variant, duration_seconds')
    .in(
      'mock_exam_id',
      exams.map((e) => e.id),
    )
  if (error) throw error
  const counts = new Map<string, number>()
  if (modules.length > 0) {
    const { data: rows, error: qErr } = await db
      .from('mock_exam_questions')
      .select('module_id')
      .in(
        'module_id',
        modules.map((m) => m.id),
      )
    if (qErr) throw qErr
    for (const r of rows) counts.set(r.module_id, (counts.get(r.module_id) ?? 0) + 1)
  }
  return exams.map((e) => ({
    id: e.id,
    title: e.title,
    slug: e.slug,
    description: e.description,
    status: e.status as AdminExam['status'],
    isAdaptive: e.is_adaptive,
    isFullLength: e.is_full_length,
    routingThreshold: Number(e.routing_threshold),
    breakSeconds: e.break_seconds,
    updatedAt: e.updated_at,
    modules: sortAdminModules(
      modules
        .filter((m) => m.mock_exam_id === e.id)
        .map((m) => ({
          id: m.id,
          section: m.section as ExamSection,
          moduleNumber: (m.module_number === 2 ? 2 : 1) as 1 | 2,
          variant: m.variant as ModuleVariant,
          durationSeconds: m.duration_seconds,
          questionCount: counts.get(m.id) ?? 0,
        })),
    ),
  }))
}

const EXAM_COLUMNS = 'id, title, slug, description, status, is_adaptive, is_full_length, routing_threshold, break_seconds, updated_at'

export async function listExamsAdmin(db: Db): Promise<AdminExam[]> {
  const { data, error } = await db.from('mock_exams').select(EXAM_COLUMNS).order('updated_at', { ascending: false })
  if (error) throw error
  return withModules(db, data)
}

export async function getExamAdmin(db: Db, examId: string): Promise<AdminExam | null> {
  const { data, error } = await db.from('mock_exams').select(EXAM_COLUMNS).eq('id', examId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const [exam] = await withModules(db, [data])
  return exam ?? null
}

/** Publish problems for an exam (empty list = publishable). */
export async function examValidationIssues(db: Db, exam: AdminExam): Promise<string[]> {
  const taxonomy = await getTaxonomy(db)
  const moduleIds = exam.modules.map((m) => m.id)
  const { data, error } = moduleIds.length
    ? await db.from('mock_exam_questions').select('module_id, question_id, questions(status, subject_id)').in('module_id', moduleIds)
    : { data: [], error: null }
  if (error) throw error
  const modules: ValidationModule[] = exam.modules.map((m) => ({
    section: m.section,
    moduleNumber: m.moduleNumber,
    variant: m.variant,
    questions: (data ?? [])
      .filter((r) => r.module_id === m.id)
      .map((r) => ({
        questionId: r.question_id,
        status: r.questions?.status ?? 'missing',
        subjectCode: r.questions ? (taxonomy.subjectById.get(r.questions.subject_id)?.code ?? null) : null,
      })),
  }))
  return validateExamForPublish({ isAdaptive: exam.isAdaptive, isFullLength: exam.isFullLength }, modules)
}

/** In-progress student attempts of this exam (count only). Service role: editors cannot read attempts. */
export async function activeAttemptCount(examId: string): Promise<number> {
  const { count, error } = await createAdminSupabase()
    .from('attempts')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'mock_exam')
    .eq('mock_exam_id', examId)
    .eq('status', 'in_progress')
  if (error) throw error
  return count ?? 0
}

export type ModuleEntry = {
  entryId: string
  position: number
  questionId: string
  stem: string
  difficulty: 'easy' | 'medium' | 'hard'
  questionType: string
  status: string
  domainId: string
  domainName: string
  skillName: string
}

export type ModuleEditorData = {
  exam: AdminExam
  module: AdminModule
  entries: ModuleEntry[]
  /** Questions used by the other modules of this exam. */
  usedElsewhere: string[]
  domains: Array<{ id: string; name: string; weightPercent: number; position: number }>
  skills: Array<{ id: string; name: string; domainId: string }>
}

export async function getModuleEditor(db: Db, examId: string, moduleId: string): Promise<ModuleEditorData | null> {
  const exam = await getExamAdmin(db, examId)
  const mod = exam?.modules.find((m) => m.id === moduleId)
  if (!exam || !mod) return null
  const taxonomy = await getTaxonomy(db)
  const { data: rows, error } = await db
    .from('mock_exam_questions')
    .select('id, module_id, position, question_id, questions(id, stem, difficulty, question_type, status, domain_id, skill_id)')
    .in(
      'module_id',
      exam.modules.map((m) => m.id),
    )
    .order('position')
  if (error) throw error
  const subject = taxonomy.subjectByCode.get(mod.section)
  const domains = taxonomy.domains
    .filter((d) => d.subjectId === subject?.id)
    .map((d) => ({ id: d.id, name: d.name, weightPercent: d.weightPercent, position: d.position }))
  const domainIds = new Set(domains.map((d) => d.id))
  return {
    exam,
    module: mod,
    entries: rows
      .filter((r) => r.module_id === moduleId && r.questions)
      .map((r) => ({
        entryId: r.id,
        position: r.position,
        questionId: r.question_id,
        stem: r.questions!.stem,
        difficulty: r.questions!.difficulty as ModuleEntry['difficulty'],
        questionType: r.questions!.question_type,
        status: r.questions!.status,
        domainId: r.questions!.domain_id,
        domainName: taxonomy.domainById.get(r.questions!.domain_id)?.name ?? '',
        skillName: taxonomy.skillById.get(r.questions!.skill_id)?.name ?? '',
      })),
    usedElsewhere: rows.filter((r) => r.module_id !== moduleId).map((r) => r.question_id),
    domains,
    skills: taxonomy.skills.filter((s) => domainIds.has(s.domainId)).map((s) => ({ id: s.id, name: s.name, domainId: s.domainId })),
  }
}
