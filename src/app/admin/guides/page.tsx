import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { CONTENT_ROLES, STAFF_ROLES, hasRole } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { ContentStatusBadge } from '@/components/admin/status-badge'
import { getTaxonomy } from '@/features/taxonomy/server'
import { formatDateTime } from '@/features/admin/format'
import { ImportGuidesButton } from '@/components/admin/import-guides-button'
import { BUNDLED_GUIDES_JSON } from '@/features/guides/bundled.generated'

export const metadata: Metadata = { title: 'Study guides' }

type Row = {
  id: string
  slug: string
  kind: string
  status: string
  position: number
  updated_at: string
  skill_id: string | null
  guide_contents: { locale: string; title: string }[]
}

export default async function AdminGuidesPage() {
  const profile = await requireRole(STAFF_ROLES, { next: '/admin/guides' })
  const db = await createServerSupabase()
  const [{ data, error }, taxonomy] = await Promise.all([
    db.from('guides').select('id, slug, kind, status, position, updated_at, skill_id, guide_contents(locale, title)').order('kind', { ascending: false }).order('position'),
    getTaxonomy(db),
  ])
  if (error) throw error
  const rows = (data ?? []) as Row[]
  const canEdit = hasRole(profile.role, CONTENT_ROLES)
  const covered = new Set(rows.filter((r) => r.kind === 'skill' && r.status !== 'archived').map((r) => r.skill_id))
  const missing = taxonomy.skills.filter((s) => !covered.has(s.id))
  const existingSlugs = new Set(rows.map((r) => r.slug))
  const bundledMissing = (JSON.parse(BUNDLED_GUIDES_JSON) as { slug: string }[]).filter((g) => !existingSlugs.has(g.slug)).length

  return (
    <>
      <PageHeader
        title="Study guides"
        description="Structured explanations of every skill and test strategy, written in Uzbek first. Students see published guides on every plan."
        actions={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              {bundledMissing > 0 && <ImportGuidesButton missing={bundledMissing} />}
              <Button asChild>
                <Link href="/admin/guides/new">
                  <Plus aria-hidden /> New guide
                </Link>
              </Button>
            </div>
          ) : undefined
        }
      />
      {missing.length > 0 && (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning-soft/60 px-4 py-3 text-sm">
          <span className="font-medium">{missing.length} skill(s) without a guide:</span> {missing.map((s) => s.name).join(', ')}
        </p>
      )}
      <DataTable
        caption="Study guides"
        rows={rows}
        rowKey={(r) => r.id}
        empty={{ title: 'No guides yet', description: 'Create the first guide, or apply the guide content migration.' }}
        columns={[
          {
            key: 'title',
            header: 'Guide',
            cell: (r) => {
              const uz = r.guide_contents.find((c) => c.locale === 'uz') ?? r.guide_contents[0]
              return (
                <Link href={`/admin/guides/${r.id}`} className="font-medium text-primary hover:underline">
                  {uz?.title ?? r.slug}
                </Link>
              )
            },
          },
          {
            key: 'kind',
            header: 'Type',
            cell: (r) => (r.kind === 'skill' ? (taxonomy.skillById.get(r.skill_id ?? '')?.name ?? 'Skill') : 'Strategy'),
            hideBelow: 'md',
          },
          {
            key: 'locales',
            header: 'Languages',
            cell: (r) => (
              <span className="flex gap-1">
                {r.guide_contents.map((c) => (
                  <Badge key={c.locale} variant="outline">
                    {c.locale.toUpperCase()}
                  </Badge>
                ))}
              </span>
            ),
            hideBelow: 'sm',
          },
          { key: 'status', header: 'Status', cell: (r) => <ContentStatusBadge status={r.status} /> },
          { key: 'updated', header: 'Updated', cell: (r) => formatDateTime(r.updated_at), hideBelow: 'lg' },
        ]}
      />
    </>
  )
}
