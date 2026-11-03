import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { CONTENT_ROLES, STAFF_ROLES, hasRole } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { ResourceManager } from '@/components/admin/resource-manager'
import { getTaxonomy } from '@/features/taxonomy/server'
import { RESOURCE_COLUMNS, type ResourceRow } from '@/features/resources/server'

export const metadata: Metadata = { title: 'Resource Hub' }

export default async function AdminResourcesPage() {
  const profile = await requireRole(STAFF_ROLES, { next: '/admin/resources' })
  const db = await createServerSupabase()
  const [{ data, error }, taxonomy] = await Promise.all([
    db.from('learning_resources').select(RESOURCE_COLUMNS).order('status').order('position').order('title'),
    getTaxonomy(db),
  ])
  if (error) throw error
  return (
    <>
      <PageHeader
        title="Resource Hub"
        description="Curated links to official SAT information, free lessons and tools, with source, usage terms and attribution. SAT MASTER links only: nothing is copied or embedded, and progress on other sites is never tracked."
      />
      <ResourceManager
        rows={(data ?? []) as ResourceRow[]}
        canEdit={hasRole(profile.role, CONTENT_ROLES)}
        taxonomy={{
          subjects: taxonomy.subjects.map((s) => ({ id: s.id, name: s.name })),
          domains: taxonomy.domains.map((d) => ({ id: d.id, name: d.name, subjectId: d.subjectId })),
          skills: taxonomy.skills.map((s) => ({ id: s.id, name: s.name, domainId: s.domainId })),
        }}
      />
    </>
  )
}
