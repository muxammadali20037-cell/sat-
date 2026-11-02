import 'server-only'
import { cache } from 'react'
import type { Db } from '@/lib/supabase/server'
import { getTaxonomy } from '@/features/taxonomy/server'
import type { GuideKind, GuideSection } from './schema'
import { parseSections, pickLocale } from './locale'

export { localeOrder, parseSections, pickLocale } from './locale'
import type { SubjectCode } from '@/types/questions'

export type GuideListItem = {
  id: string
  slug: string
  kind: GuideKind
  title: string
  summary: string
  locale: string
  readingMinutes: number
  position: number
  subjectCode: SubjectCode | null
  domainId: string | null
  domainName: string | null
  domainPosition: number
  skillId: string | null
  skillName: string | null
  read: boolean
}

type GuideRow = {
  id: string
  slug: string
  kind: string
  skill_id: string | null
  subject_id: string | null
  position: number
  reading_minutes: number
  guide_contents: { locale: string; title: string; summary: string }[]
}

/** Published guides visible to the signed-in user (RLS), with their read marks. */
export const listGuides = cache(async (db: Db, userId: string, locale: string): Promise<GuideListItem[]> => {
  const [guidesRes, readsRes, taxonomy] = await Promise.all([
    db
      .from('guides')
      .select('id, slug, kind, skill_id, subject_id, position, reading_minutes, guide_contents(locale, title, summary)')
      .eq('status', 'published')
      .order('position'),
    db.from('guide_reads').select('guide_id').eq('user_id', userId),
    getTaxonomy(db),
  ])
  if (guidesRes.error) throw guidesRes.error
  if (readsRes.error) throw readsRes.error
  const read = new Set((readsRes.data ?? []).map((r) => r.guide_id))

  const items: GuideListItem[] = []
  for (const g of (guidesRes.data ?? []) as GuideRow[]) {
    const content = pickLocale(g.guide_contents ?? [], locale)
    if (!content) continue
    const skill = g.skill_id ? taxonomy.skillById.get(g.skill_id) : undefined
    const domain = skill ? taxonomy.domainById.get(skill.domainId) : undefined
    const subjectId = g.subject_id ?? domain?.subjectId ?? null
    items.push({
      id: g.id,
      slug: g.slug,
      kind: g.kind as GuideKind,
      title: content.title,
      summary: content.summary,
      locale: content.locale,
      readingMinutes: g.reading_minutes,
      position: g.position,
      subjectCode: subjectId ? (taxonomy.subjectById.get(subjectId)?.code ?? null) : null,
      domainId: domain?.id ?? null,
      domainName: domain?.name ?? null,
      domainPosition: domain?.position ?? 0,
      skillId: skill?.id ?? null,
      skillName: skill?.name ?? null,
      read: read.has(g.id),
    })
  }
  return items
})

export type GuideView = GuideListItem & {
  sections: GuideSection[]
  availableLocales: string[]
}

export async function getGuide(db: Db, userId: string, slug: string, locale: string): Promise<GuideView | null> {
  const { data: g, error } = await db
    .from('guides')
    .select('id, slug, kind, skill_id, subject_id, position, reading_minutes, status')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  if (!g || g.status !== 'published') return null

  const [contentsRes, readRes, taxonomy] = await Promise.all([
    db.from('guide_contents').select('locale, title, summary, sections').eq('guide_id', g.id),
    db.from('guide_reads').select('guide_id').eq('user_id', userId).eq('guide_id', g.id).maybeSingle(),
    getTaxonomy(db),
  ])
  if (contentsRes.error) throw contentsRes.error
  const content = pickLocale(contentsRes.data ?? [], locale)
  if (!content) return null

  const skill = g.skill_id ? taxonomy.skillById.get(g.skill_id) : undefined
  const domain = skill ? taxonomy.domainById.get(skill.domainId) : undefined
  const subjectId = g.subject_id ?? domain?.subjectId ?? null
  return {
    id: g.id,
    slug: g.slug,
    kind: g.kind as GuideKind,
    title: content.title,
    summary: content.summary,
    locale: content.locale,
    readingMinutes: g.reading_minutes,
    position: g.position,
    subjectCode: subjectId ? (taxonomy.subjectById.get(subjectId)?.code ?? null) : null,
    domainId: domain?.id ?? null,
    domainName: domain?.name ?? null,
    domainPosition: domain?.position ?? 0,
    skillId: skill?.id ?? null,
    skillName: skill?.name ?? null,
    read: !!readRes.data,
    sections: parseSections(content.sections, g.slug),
    availableLocales: (contentsRes.data ?? []).map((c) => c.locale),
  }
}

/** skillId → guide slug for every published skill guide (for links from lessons, practice and results). */
export const guideSlugsBySkill = cache(async (db: Db): Promise<Record<string, string>> => {
  const { data, error } = await db.from('guides').select('slug, skill_id').eq('status', 'published').eq('kind', 'skill')
  if (error) throw error
  const map: Record<string, string> = {}
  for (const g of data ?? []) if (g.skill_id) map[g.skill_id] = g.slug
  return map
})
