import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { ADMIN_ROLES } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { Alert } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { SettingEditor } from '@/components/admin/settings-editor'
import { DbActionError, profileNames } from '@/features/admin/server-utils'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  await requireRole(ADMIN_ROLES, { next: '/admin/settings' })
  const db = await createServerSupabase()
  const { data, error } = await db.from('platform_settings').select('id, key, value, description, is_public, updated_at, updated_by').order('key')
  if (error) throw new DbActionError(error)
  const names = await profileNames(db, (data ?? []).map((r) => r.updated_by))
  const groups = new Map<string, NonNullable<typeof data>>()
  for (const row of data ?? []) {
    const group = row.key.split('.')[0] ?? 'general'
    groups.set(group, [...(groups.get(group) ?? []), row])
  }

  return (
    <>
      <PageHeader title="Platform settings" description="Operational values read by the platform at runtime. Each change is validated and recorded in the audit log." />
      <Alert variant="neutral" className="mb-5" title="Public settings are readable by anyone">
        Never store secrets here. API keys and payment credentials belong in environment variables.
      </Alert>
      {(data ?? []).length === 0 ? (
        <EmptyState title="No settings found" description="Settings are created by database migrations." />
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {[...groups.entries()].map(([group, rows]) => (
            <section key={group} aria-label={group} className="rounded-lg border border-border bg-card">
              <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold capitalize">{group}</h2>
              {rows.map((r) => (
                <SettingEditor
                  key={`${r.id}-${r.updated_at}`}
                  row={{
                    id: r.id,
                    key: r.key,
                    value: r.value,
                    description: r.description,
                    isPublic: r.is_public,
                    updatedAt: r.updated_at,
                    updatedBy: r.updated_by ? (names.get(r.updated_by)?.name ?? null) : null,
                  }}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  )
}
