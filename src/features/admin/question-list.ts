import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { DIFFICULTIES, QUESTION_SOURCES, QUESTION_STATUSES, QUESTION_TYPES } from '@/features/content/constants'
import { DbActionError } from './server-utils'
import { oneOf, pageFromParam, param, sanitizeSearch, uuidParam } from './params'

export const QUESTIONS_PAGE_SIZE = 25

export type QuestionFilters = {
  view: 'all' | 'review'
  q: string
  subject: string
  domain: string
  skill: string
  difficulty: string
  type: string
  status: string
  source: string
  /** Exact tag, e.g. a bundled pack id. */
  tag: string
  page: number
}

export function parseQuestionFilters(sp: Record<string, string | string[] | undefined>): QuestionFilters {
  const view = param(sp.view) === 'review' ? 'review' : 'all'
  return {
    view,
    q: sanitizeSearch(param(sp.q)),
    subject: uuidParam(sp.subject),
    domain: uuidParam(sp.domain),
    skill: uuidParam(sp.skill),
    difficulty: oneOf(sp.difficulty, DIFFICULTIES),
    type: oneOf(sp.type, QUESTION_TYPES),
    status: view === 'review' ? 'draft' : oneOf(sp.status, QUESTION_STATUSES),
    source: oneOf(sp.source, QUESTION_SOURCES),
    tag: /^[a-z0-9][a-z0-9-]{0,39}$/.test(param(sp.tag)) ? param(sp.tag) : '',
    page: pageFromParam(sp.page),
  }
}

/** Filtered, searched, paginated question list (user-scoped client; staff RLS). */
export async function listQuestions(db: Db, f: QuestionFilters) {
  let q = db
    .from('questions')
    .select('id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type, stem, status, source, version, created_at, updated_at', { count: 'exact' })
  if (f.subject) q = q.eq('subject_id', f.subject)
  if (f.domain) q = q.eq('domain_id', f.domain)
  if (f.skill) q = q.eq('skill_id', f.skill)
  if (f.difficulty) q = q.eq('difficulty', f.difficulty)
  if (f.type) q = q.eq('question_type', f.type)
  if (f.status) q = q.eq('status', f.status)
  if (f.source) q = q.eq('source', f.source)
  if (f.tag) q = q.contains('tags', [f.tag])
  // Search stem and passage. ilike fallback: the GIN index is on an expression PostgREST cannot target.
  if (f.q) q = q.or(`stem.ilike.*${f.q}*,passage.ilike.*${f.q}*`)
  q = f.view === 'review' ? q.order('created_at', { ascending: true }) : q.order('updated_at', { ascending: false })
  const from = (f.page - 1) * QUESTIONS_PAGE_SIZE
  const { data, error, count } = await q.order('id').range(from, from + QUESTIONS_PAGE_SIZE - 1)
  if (error) throw new DbActionError(error)
  return { rows: data ?? [], total: count ?? 0 }
}
