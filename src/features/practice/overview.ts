import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { SubjectCode } from '@/types/questions'
import { getTaxonomy } from '@/features/taxonomy/server'
import { listAttempts, type AttemptListItem } from '@/features/results/server'
import { fetchAllPages } from './queries'

export type PracticeSetCard = {
  id: string
  title: string
  description: string
  subjectCode: SubjectCode
  domainName: string | null
  skillName: string | null
  difficulty: string | null
  questionCount: number
}

/** Published question counts by `${skillId}:${difficulty}` — aggregate numbers only. */
export async function practiceAvailability(admin: Db): Promise<Record<string, number>> {
  const rows = await fetchAllPages(
    (from, to) => admin.from('questions').select('skill_id, difficulty').eq('status', 'published').order('id').range(from, to),
    { max: 20_000 },
  )
  const out: Record<string, number> = {}
  for (const r of rows) {
    const key = `${r.skill_id}:${r.difficulty}`
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}

export async function publishedPracticeSets(admin: Db): Promise<PracticeSetCard[]> {
  const { data, error } = await admin
    .from('practice_sets')
    .select('id, title, description, subject_id, domain_id, skill_id, difficulty, position')
    .eq('status', 'published')
    .order('position')
    .order('title')
    .limit(60)
  if (error) throw error
  const sets = data ?? []
  if (sets.length === 0) return []

  const [taxonomy, links] = await Promise.all([
    getTaxonomy(admin),
    admin
      .from('practice_set_questions')
      .select('practice_set_id, questions!inner(status)')
      .in('practice_set_id', sets.map((s) => s.id))
      .eq('questions.status', 'published')
      .limit(10_000),
  ])
  if (links.error) throw links.error
  const counts = new Map<string, number>()
  for (const l of links.data ?? []) counts.set(l.practice_set_id, (counts.get(l.practice_set_id) ?? 0) + 1)

  return sets
    .map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      subjectCode: (taxonomy.subjectById.get(s.subject_id)?.code ?? 'math') as SubjectCode,
      domainName: s.domain_id ? (taxonomy.domainById.get(s.domain_id)?.name ?? null) : null,
      skillName: s.skill_id ? (taxonomy.skillById.get(s.skill_id)?.name ?? null) : null,
      difficulty: s.difficulty,
      questionCount: counts.get(s.id) ?? 0,
    }))
    .filter((s) => s.questionCount > 0)
}

export async function bookmarkedQuestionCount(admin: Db, userId: string): Promise<number> {
  const { count, error } = await admin
    .from('bookmarks')
    .select('id, questions!inner(status)', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('question_id', 'is', null)
    .eq('questions.status', 'published')
  if (error) throw error
  return count ?? 0
}

export async function recentPractice(admin: Db, userId: string, limit = 6): Promise<AttemptListItem[]> {
  const { items } = await listAttempts(admin, userId, { kind: 'practice', limit })
  return items
}
