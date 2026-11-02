import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { historyFromAnswers } from './select'

/**
 * Shared service-role queries for practice, diagnostic, bookmarks and results.
 * Every function that touches user data takes the AUTHORIZED user id and filters by it.
 */

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>

/** Reads every row of a query in pages (PostgREST caps responses at max-rows, 1000 on Supabase). */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PageResult<T>,
  opts: { pageSize?: number; max?: number } = {},
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 1000
  const max = opts.max ?? 10_000
  const out: T[] = []
  for (let from = 0; from < max; from += pageSize) {
    const to = Math.min(from + pageSize, max) - 1
    const { data, error } = await page(from, to)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < to - from + 1) break
  }
  return out
}

/** Numeric platform setting with a fallback and optional bounds (settings are admin-editable JSON). */
export async function getNumberSetting(
  admin: Db,
  key: string,
  fallback: number,
  bounds: { min?: number; max?: number } = {},
): Promise<number> {
  const { data, error } = await admin.from('platform_settings').select('value').eq('key', key).maybeSingle()
  if (error) {
    console.error('[settings] failed to read', key, error)
    return fallback
  }
  if (!data) return fallback
  const raw = data.value
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(bounds.max ?? Number.POSITIVE_INFINITY, Math.max(bounds.min ?? Number.NEGATIVE_INFINITY, n))
}

/** Latest scored result per question for this student (newest answer wins). */
export async function loadAnswerHistory(admin: Db, userId: string): Promise<Map<string, boolean>> {
  const rows = await fetchAllPages(
    (from, to) =>
      admin
        .from('attempt_answers')
        .select('question_id, is_correct')
        .eq('user_id', userId)
        .not('is_correct', 'is', null)
        .order('answered_at', { ascending: false, nullsFirst: false })
        .order('id')
        .range(from, to),
    { max: 5000 },
  )
  return historyFromAnswers(rows.map((r) => ({ questionId: r.question_id, isCorrect: r.is_correct })))
}

/**
 * Questions that belong to one of the student's IN-PROGRESS timed tests (diagnostic or mock
 * exam). Practice reveals answers immediately, so these must never be served or scored in
 * practice while the test is running — otherwise practice would leak the test's answer keys.
 */
export async function lockedQuestionIds(admin: Db, userId: string): Promise<Set<string>> {
  const { data: active, error } = await admin
    .from('attempts')
    .select('id, kind, mock_exam_id')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .in('kind', ['diagnostic', 'mock_exam'])
  if (error) throw error
  const locked = new Set<string>()
  if (!active || active.length === 0) return locked

  const attemptIds = active.map((a) => a.id)
  const mockIds = active.map((a) => a.mock_exam_id).filter((id): id is string => !!id)
  const [assigned, mock] = await Promise.all([
    admin.from('attempt_questions').select('question_id').in('attempt_id', attemptIds),
    mockIds.length > 0
      ? admin.from('mock_exam_questions').select('question_id, mock_exam_modules!inner(mock_exam_id)').in('mock_exam_modules.mock_exam_id', mockIds)
      : Promise.resolve({ data: [] as Array<{ question_id: string }>, error: null }),
  ])
  if (assigned.error) throw assigned.error
  if (mock.error) throw mock.error
  for (const row of assigned.data ?? []) locked.add(row.question_id)
  for (const row of mock.data ?? []) locked.add(row.question_id)
  return locked
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
}
