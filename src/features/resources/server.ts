import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { SubjectCode } from '@/types/questions'

export type ResourceRow = {
  id: string
  provider: string
  provider_name: string
  kind: string
  title: string
  description: string
  url: string
  language: string
  subject_id: string | null
  domain_id: string | null
  skill_id: string | null
  usage_terms: string
  attribution: string
  status: string
  link_status: number | null
  link_checked_at: string | null
  position: number
  updated_at: string
}

export const RESOURCE_COLUMNS =
  'id, provider, provider_name, kind, title, description, url, language, subject_id, domain_id, skill_id, usage_terms, attribution, status, link_status, link_checked_at, position, updated_at'

export type HubSection = {
  key: string
  scope: 'domain' | 'subject' | 'general'
  title: string
  subjectCode: SubjectCode | null
  items: Array<ResourceRow & { host: string; skillName: string | null }>
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * Published resources grouped by domain in framework order (then subject-wide, then general).
 * Uses the student's own client: RLS returns published rows only.
 */
export async function loadHub(
  db: Db,
  taxonomy: {
    subjects: Array<{ id: string; code: SubjectCode; name: string }>
    domains: Array<{ id: string; subjectId: string; name: string }>
    skillById: Map<string, { name: string; domainId: string }>
  },
): Promise<HubSection[]> {
  const { data, error } = await db.from('learning_resources').select(RESOURCE_COLUMNS).eq('status', 'published').order('position').order('title')
  if (error) throw error
  const rows = (data ?? []) as ResourceRow[]
  const enrich = (r: ResourceRow) => ({ ...r, host: hostOf(r.url), skillName: r.skill_id ? (taxonomy.skillById.get(r.skill_id)?.name ?? null) : null })
  const domainOf = (r: ResourceRow) => r.domain_id ?? (r.skill_id ? (taxonomy.skillById.get(r.skill_id)?.domainId ?? null) : null)
  const sections: HubSection[] = []
  for (const subject of taxonomy.subjects) {
    for (const d of taxonomy.domains.filter((x) => x.subjectId === subject.id)) {
      const items = rows.filter((r) => domainOf(r) === d.id).map(enrich)
      if (items.length) sections.push({ key: d.id, scope: 'domain', title: d.name, subjectCode: subject.code, items })
    }
    const subjectWide = rows.filter((r) => !domainOf(r) && r.subject_id === subject.id).map(enrich)
    if (subjectWide.length) sections.push({ key: subject.id, scope: 'subject', title: subject.name, subjectCode: subject.code, items: subjectWide })
  }
  const general = rows.filter((r) => !domainOf(r) && !r.subject_id).map(enrich)
  if (general.length) sections.push({ key: 'general', scope: 'general', title: '', subjectCode: null, items: general })
  return sections
}

export type TopicVideo = { id: string; title: string; url: string; providerName: string; attribution: string; language: string; description: string }

/** Published videos for one SAT skill (link only), shown next to its lessons and guides. */
export async function loadTopicVideos(db: Db, skillId: string, limit = 3): Promise<TopicVideo[]> {
  const { data, error } = await db
    .from('learning_resources')
    .select('id, title, url, provider_name, attribution, language, description')
    .eq('status', 'published')
    .eq('kind', 'video')
    .eq('skill_id', skillId)
    .order('position')
    .order('title')
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((r) => ({ id: r.id, title: r.title, url: r.url, providerName: r.provider_name, attribution: r.attribution, language: r.language, description: r.description }))
}

export type LibraryItem = { id: string; group: import('./rules').LibraryGroup; title: string; description: string; url: string; host: string; providerName: string; attribution: string; kind: string }

/** Published Library items (books, official practice, grammar guides), shelf by shelf. RLS: published only. */
export async function loadLibrary(db: Db): Promise<LibraryItem[]> {
  const { libraryGroup } = await import('./rules')
  const { data, error } = await db
    .from('learning_resources')
    .select('id, provider, provider_name, kind, title, description, url, attribution, position')
    .eq('status', 'published')
    .neq('kind', 'video')
    .order('position')
    .order('title')
    .limit(500)
  if (error) throw error
  return (data ?? []).flatMap((r) => {
    const group = libraryGroup(r)
    return group ? [{ id: r.id, group, title: r.title, description: r.description, url: r.url, host: hostOf(r.url), providerName: r.provider_name, attribution: r.attribution, kind: r.kind }] : []
  })
}
