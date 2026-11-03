import { requireUser } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { TeachShell } from '@/components/classroom/teach-shell'
import { requireStaffMembership } from '@/features/classroom/server'

/** Workspace area: staff only (anyone else gets 404, so workspace ids cannot be probed). */
export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ ws: string }> }) {
  const { ws } = await params
  const profile = await requireUser({ next: `/teach/${ws}` })
  const membership = await requireStaffMembership(createAdminSupabase(), profile.id, ws)
  return (
    <TeachShell profile={profile} membership={membership}>
      {children}
    </TeachShell>
  )
}
