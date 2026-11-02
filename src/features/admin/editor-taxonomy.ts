import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { getTaxonomy } from '@/features/taxonomy/server'

/** Serializable taxonomy for client editors (subject → domain → skill cascade). */
export async function editorTaxonomy(db: Db) {
  const t = await getTaxonomy(db)
  return {
    subjects: t.subjects.map((s) => ({ id: s.id, code: s.code, name: s.name })),
    domains: t.domains.map((d) => ({ id: d.id, subjectId: d.subjectId, code: d.code, name: d.name })),
    skills: t.skills.map((s) => ({ id: s.id, domainId: s.domainId, code: s.code, name: s.name })),
  }
}
