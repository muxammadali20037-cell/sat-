import 'server-only'
import { cache } from 'react'
import type { Db } from '@/lib/supabase/server'
import type { SubjectCode } from '@/types/questions'

export type SubjectRow = { id: string; code: SubjectCode; name: string; position: number }
export type DomainRow = { id: string; subjectId: string; code: string; name: string; weightPercent: number; position: number }
export type SkillRow = { id: string; domainId: string; code: string; name: string; position: number }

export type Taxonomy = {
  subjects: SubjectRow[]
  domains: DomainRow[]
  skills: SkillRow[]
  subjectById: Map<string, SubjectRow>
  subjectByCode: Map<SubjectCode, SubjectRow>
  domainById: Map<string, DomainRow>
  skillById: Map<string, SkillRow>
}

/** The Digital SAT framework (2 subjects, 8 domains, 30 skills). Small; loaded once per request. */
export const getTaxonomy = cache(async (db: Db): Promise<Taxonomy> => {
  const [subjects, domains, skills] = await Promise.all([
    db.from('subjects').select('id, code, name, position').order('position'),
    db.from('domains').select('id, subject_id, code, name, weight_percent, position').order('position'),
    db.from('skills').select('id, domain_id, code, name, position').order('position'),
  ])
  if (subjects.error) throw subjects.error
  if (domains.error) throw domains.error
  if (skills.error) throw skills.error

  const s: SubjectRow[] = subjects.data.map((r) => ({ id: r.id, code: r.code as SubjectCode, name: r.name, position: r.position }))
  const d: DomainRow[] = domains.data.map((r) => ({
    id: r.id,
    subjectId: r.subject_id,
    code: r.code,
    name: r.name,
    weightPercent: Number(r.weight_percent),
    position: r.position,
  }))
  const k: SkillRow[] = skills.data.map((r) => ({ id: r.id, domainId: r.domain_id, code: r.code, name: r.name, position: r.position }))
  return {
    subjects: s,
    domains: d,
    skills: k,
    subjectById: new Map(s.map((x) => [x.id, x])),
    subjectByCode: new Map(s.map((x) => [x.code, x])),
    domainById: new Map(d.map((x) => [x.id, x])),
    skillById: new Map(k.map((x) => [x.id, x])),
  }
})
