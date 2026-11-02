import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { CONTENT_ROLES, STAFF_ROLES, hasRole } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { GuideEditor, type GuideEditorData } from '@/components/admin/guide-editor'
import { getTaxonomy } from '@/features/taxonomy/server'
import { isUuid } from '@/features/admin/params'
import { formatDateTime } from '@/features/admin/format'
import type { GuideLocale } from '@/features/guides/schema'

export const metadata: Metadata = { title: 'Edit study guide' }

export default async function EditGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(STAFF_ROLES, { next: '/admin/guides' })
  const { id } = await params
  const isNew = id === 'new'
  if (!isNew && !isUuid(id)) notFound()
  if (isNew && !hasRole(profile.role, CONTENT_ROLES)) notFound()

  const db = await createServerSupabase()
  const taxonomy = await getTaxonomy(db)
  const skills = taxonomy.skills
    .map((s) => {
      const domain = taxonomy.domainById.get(s.domainId)
      return { id: s.id, label: `${domain?.name ?? ''} · ${s.name}`, order: (domain?.position ?? 0) * 100 + s.position, subject: domain?.subjectId ?? '' }
    })
    .sort((a, b) => a.subject.localeCompare(b.subject) || a.order - b.order)

  let data: GuideEditorData
  let updatedAt: string | null = null
  if (isNew) {
    data = { id: null, status: 'draft', meta: { slug: '', kind: 'skill', skillId: null, subjectCode: null, position: 0, readingMinutes: 8 }, contents: {} }
  } else {
    const { data: g, error } = await db
      .from('guides')
      .select('id, slug, kind, skill_id, subject_id, position, reading_minutes, status, updated_at, guide_contents(locale, title, summary, sections)')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!g) notFound()
    updatedAt = g.updated_at
    const contents: GuideEditorData['contents'] = {}
    for (const c of g.guide_contents ?? []) {
      contents[c.locale as GuideLocale] = { title: c.title, summary: c.summary, sections: Array.isArray(c.sections) ? (c.sections as unknown[]) : [] }
    }
    data = {
      id: g.id,
      status: g.status,
      meta: {
        slug: g.slug,
        kind: g.kind as 'skill' | 'strategy',
        skillId: g.skill_id,
        subjectCode: g.subject_id ? ((taxonomy.subjectById.get(g.subject_id)?.code ?? null) as GuideEditorData['meta']['subjectCode']) : null,
        position: g.position,
        readingMinutes: g.reading_minutes,
      },
      contents,
    }
  }
  const title = data.contents.uz?.title ?? data.contents.en?.title ?? (isNew ? 'New study guide' : data.meta.slug)
  const canEdit = hasRole(profile.role, CONTENT_ROLES)

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Study guides', href: '/admin/guides' }, { label: title }]} />}
        title={title}
        description={updatedAt ? `Last updated ${formatDateTime(updatedAt)}${canEdit ? '' : ' · read only'}` : 'Create the guide, then add its Uzbek content.'}
      />
      <GuideEditor key={updatedAt ?? 'new'} data={data} skills={skills} canEdit={canEdit} />
    </>
  )
}
