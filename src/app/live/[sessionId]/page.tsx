import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Video } from 'lucide-react'
import { requireUser } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { liveDict } from '@/lib/i18n/dictionaries/live'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LiveRoom } from '@/components/live/live-room'
import { liveConfig, resolveLiveAccess } from '@/features/live/server'
import { formatDate } from '@/features/dashboard/format'
import { effectivePlan } from '@/features/classroom/plan-server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(liveDict)).metaTitle }
}

/** One lesson's live room. Access: the group's staff and current students only (404 otherwise). */
export default async function LivePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const profile = await requireUser({ next: `/live/${sessionId}` })
  const [t, locale] = await Promise.all([getDict(liveDict), getLocale()])
  const access = await resolveLiveAccess(createAdminSupabase(), profile.id, sessionId)
  if (!access.ok && access.reason === 'not_found') notFound()
  const back =
    access.ok && access.role === 'staff' ? `/teach/${access.session.workspaceId}/groups/${access.session.groupId}` : access.ok && access.role === 'guest' ? '/dashboard' : '/dashboard/classes'
  const configured = liveConfig() !== null
  const tz = profile.timezone || 'Asia/Tashkent'

  const notice = (title: string, body?: string, extra?: React.ReactNode) => (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-4 py-10">
      <Card className="space-y-3 p-6" data-testid="live-notice">
        <Video className="size-5 text-muted-foreground" aria-hidden />
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        {body && <p className="text-sm text-muted-foreground">{body}</p>}
        {extra}
        <Link href={back} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> {t.back}
        </Link>
      </Card>
    </main>
  )

  if (!access.ok) return notice(t.cancelled)
  const s = access.session
  const external = s.meetingUrl ? (
    <Button asChild variant="secondary">
      <a href={s.meetingUrl} target="_blank" rel="noopener noreferrer">
        {t.externalLink}
      </a>
    </Button>
  ) : null
  if (!configured) return notice(t.notConfiguredTitle, t.notConfiguredBody, external)
  const { plan } = await effectivePlan(createAdminSupabase(), s.workspaceId)
  if (plan && !plan.liveLessons) return notice(t.notIncludedTitle, t.notIncludedBody, external)
  if (access.window === 'too_early') return notice(s.title, format(t.tooEarly, { time: formatDate(s.startsAt, locale, tz, { dateStyle: 'medium', timeStyle: 'short' }) }))
  if (access.window === 'closed') return notice(s.title, t.closed)

  return (
    <LiveRoom
      sessionId={s.id}
      title={s.title}
      subtitle={[access.groupName, access.workspaceName].filter(Boolean).join(' · ')}
      role={access.role}
      selfId={profile.id}
      backHref={back}
      workspaceId={s.workspaceId}
      groupId={s.groupId}
    />
  )
}
