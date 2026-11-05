import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Video } from 'lucide-react'
import { requireUser } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import { Card } from '@/components/ui/card'
import { AcceptGuestButton } from '@/components/classroom/guest-ui'
import { normalizeCode } from '@/features/classroom/codes'
import { formatDate } from '@/features/dashboard/format'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(classroomDict)).teach.guests.acceptTitle }
}

/** Landing page of a guest link: shows the lesson and lets a signed-in person join it as a guest. */
export default async function GuestLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params
  const code = normalizeCode(raw)
  const profile = await requireUser({ next: `/live/guest/${raw}` })
  if (!code) notFound()
  const [c, locale] = await Promise.all([getDict(classroomDict), getLocale()])
  const t = c.teach.guests
  const { data: link } = await createAdminSupabase()
    .from('class_session_guest_links')
    .select('role, revoked_at, class_sessions!inner(title, starts_at, status)')
    .eq('code', code)
    .maybeSingle()
  if (!link || link.revoked_at) notFound()
  const s = link.class_sessions as unknown as { title: string; starts_at: string; status: string }
  if (s.status === 'cancelled') notFound()
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
      <Card className="space-y-3 p-6" data-testid="guest-accept">
        <Video className="size-5 text-muted-foreground" aria-hidden />
        <h1 className="text-lg font-semibold text-foreground">{t.acceptTitle}</h1>
        <p className="text-[15px] font-medium text-foreground">{s.title}</p>
        <p className="text-sm text-muted-foreground">{formatDate(s.starts_at, locale, profile.timezone || 'Asia/Tashkent', { dateStyle: 'full', timeStyle: 'short' })}</p>
        <p className="text-sm text-muted-foreground">{format(t.acceptBody, { role: t.roles[link.role as 'guest_teacher' | 'moderator'] })}</p>
        <AcceptGuestButton code={code} label={t.accept} />
      </Card>
    </main>
  )
}
