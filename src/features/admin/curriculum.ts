import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { DbActionError, fetchAll } from './server-utils'

export type UsageCounts = { questions: number; published: number; lessons: number; courses: number }
const zero = (): UsageCounts => ({ questions: 0, published: 0, lessons: 0, courses: 0 })

/** Questions / lessons / courses per subject, domain and skill (for "in use" columns and delete hints). */
export async function curriculumUsage(db: Db) {
  const [questions, lessons, courses, skills] = await Promise.all([
    fetchAll((from, to) => db.from('questions').select('id, subject_id, domain_id, skill_id, status').order('id').range(from, to), { max: 200_000 }),
    fetchAll((from, to) => db.from('lessons').select('id, skill_id, course_id').order('id').range(from, to)),
    db.from('courses').select('id, subject_id'),
    db.from('skills').select('id, domain_id'),
  ])
  if (courses.error) throw new DbActionError(courses.error)
  if (skills.error) throw new DbActionError(skills.error)
  const bySubject = new Map<string, UsageCounts>()
  const byDomain = new Map<string, UsageCounts>()
  const bySkill = new Map<string, UsageCounts>()
  const get = (m: Map<string, UsageCounts>, k: string) => {
    let v = m.get(k)
    if (!v) m.set(k, (v = zero()))
    return v
  }
  for (const q of questions.rows) {
    for (const c of [get(bySubject, q.subject_id), get(byDomain, q.domain_id), get(bySkill, q.skill_id)]) {
      c.questions++
      if (q.status === 'published') c.published++
    }
  }
  const skillDomain = new Map((skills.data ?? []).map((s) => [s.id, s.domain_id]))
  const courseSubject = new Map((courses.data ?? []).map((c) => [c.id, c.subject_id]))
  for (const l of lessons.rows) {
    const subject = courseSubject.get(l.course_id)
    if (subject) get(bySubject, subject).lessons++
    if (l.skill_id) {
      get(bySkill, l.skill_id).lessons++
      const domain = skillDomain.get(l.skill_id)
      if (domain) get(byDomain, domain).lessons++
    }
  }
  for (const c of courses.data ?? []) get(bySubject, c.subject_id).courses++
  return {
    subject: (id: string) => bySubject.get(id) ?? zero(),
    domain: (id: string) => byDomain.get(id) ?? zero(),
    skill: (id: string) => bySkill.get(id) ?? zero(),
  }
}
