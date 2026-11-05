import type { Metadata } from 'next'
import { requireStudentReady } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { pathDict } from '@/lib/i18n/dictionaries/path'
import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { InviteLink } from '@/components/referrals/invite-link'
import { loadInviteOverview } from '@/features/referrals/server'
import { telegramShareUrl } from '@/features/referrals/logic'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(pathDict)).invite.metaTitle }
}

export default async function InvitePage() {
  const profile = await requireStudentReady({ next: '/dashboard/invite' })
  const t = (await getDict(pathDict)).invite
  // Service role, always filtered by this student's id; friends are shown by first name only.
  const o = await loadInviteOverview(createAdminSupabase(), profile.id)
  const s = o.settings
  const reward =
    s.referrerDays > 0
      ? format(t.rewardOn, { referrer: s.referrerDays, cap: s.monthlyCap, friendPart: s.friendDays > 0 ? format(t.rewardFriendPart, { friend: s.friendDays }) : '' })
      : s.friendDays > 0
        ? format(t.rewardFriendOnly, { friend: s.friendDays, cap: s.monthlyCap })
        : t.rewardOff
  const qualified = o.friends.filter((f) => f.status !== 'pending').length
  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <InviteLink url={o.url} shareUrl={telegramShareUrl(o.url, t.shareText)} labels={t} />
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="text-base font-semibold">{t.friendsTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground tabular" data-testid="invite-stats">
              {format(t.stats, { n: o.friends.length, q: qualified, d: o.daysEarned })}
            </p>
            {o.friends.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">{t.none}</p>
            ) : (
              <ul className="mt-4 divide-y" data-testid="invite-friends">
                {o.friends.map((f, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="font-medium">{f.name ?? t.someone}</span>
                    <span className={f.status === 'pending' ? 'text-muted-foreground' : 'text-success'}>
                      {format(t.statuses[f.status], { days: f.days })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card className="h-fit p-5 sm:p-6">
          <h2 className="text-base font-semibold">{t.howTitle}</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            <li>{t.how1}</li>
            <li>{t.how2}</li>
          </ol>
          <p className="mt-4 text-sm" data-testid="invite-reward">{reward}</p>
        </Card>
      </div>
    </>
  )
}
