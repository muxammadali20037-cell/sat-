import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { getTaxonomy } from '@/features/taxonomy/server'
import { DbActionError } from './server-utils'

/** Course and skill choices for lesson editors and filters. */
export async function lessonEditorOptions(db: Db) {
  const [courses, taxonomy] = await Promise.all([db.from('courses').select('id, title, subject_id, status, position').order('position').order('title'), getTaxonomy(db)])
  if (courses.error) throw new DbActionError(courses.error)
  return {
    courses: (courses.data ?? []).map((c) => ({
      id: c.id,
      title: c.title + (c.status === 'archived' ? ' (archived)' : ''),
      subjectName: taxonomy.subjectById.get(c.subject_id)?.name ?? '',
    })),
    skills: taxonomy.skills.map((s) => {
      const d = taxonomy.domainById.get(s.domainId)
      return { id: s.id, name: s.name, group: d ? `${taxonomy.subjectById.get(d.subjectId)?.name ?? ''} · ${d.name}` : '' }
    }),
  }
}
