import type { Metadata } from 'next'
import { requireStudentReady } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict } from '@/lib/i18n/server'
import { pathDict } from '@/lib/i18n/dictionaries/path'
import { PageHeader } from '@/components/layout/page-header'
import { PathOverview, type FocusSkill } from '@/components/path/path-view'
import { loadPath } from '@/features/path/server'
import { getTaxonomy } from '@/features/taxonomy/server'
import { getOrCreateReferralCode } from '@/features/referrals/server'
import { inviteUrl } from '@/features/referrals/logic'
import { siteUrl } from '@/lib/env'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(pathDict)).metaTitle }
}

export default async function PathPage() {
  const profile = await requireStudentReady({ next: '/dashboard/path' })
  const [t, db] = await Promise.all([getDict(pathDict), createServerSupabase()])
  const admin = createAdminSupabase()
  const [{ stats, path }, taxonomy, code] = await Promise.all([
    loadPath(db, admin, profile.id, profile.timezone),
    getTaxonomy(db),
    getOrCreateReferralCode(admin, profile.id),
  ])
  const skills = new Map<string, FocusSkill>(taxonomy.skills.map((s) => [s.code, { code: s.code, id: s.id, name: s.name }]))
  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <PathOverview t={t} path={path} estimate={stats.estimate} skills={skills} inviteUrl={inviteUrl(siteUrl('/'), code)} />
    </>
  )
}
