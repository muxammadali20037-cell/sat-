import type { Metadata } from 'next'
import Link from 'next/link'
import { getCurrentProfile } from '@/lib/auth/session'
import { getDict } from '@/lib/i18n/server'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/layout/logo'
import { JoinForm } from '@/components/classroom/forms'
import { formatCode, normalizeCode } from '@/features/classroom/codes'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(classroomDict, { public: true })).join.title, robots: { index: false } }
}

/**
 * Invitation link target (also what the QR code opens). Joining is an explicit button press, never
 * a side effect of opening the link. Visitors sign in first and come back here.
 */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params
  const code = normalizeCode(decodeURIComponent(raw))
  const profile = await getCurrentProfile()
  const c = await getDict(classroomDict, { public: !profile })
  const t = c.join
  const next = `/join/${code ?? ''}`

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md space-y-5 p-6">
        <Logo href="/" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t.title}</h1>
          {code && <p className="mt-1 font-mono text-lg tracking-wider text-muted-foreground">{formatCode(code)}</p>}
        </div>
        {profile ? (
          <JoinForm initialCode={code ? formatCode(code) : ''} redirect />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t.signIn}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/login?next=${encodeURIComponent(next)}`}>{t.signInCta}</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={`/register?next=${encodeURIComponent(next)}`}>{t.signUpCta}</Link>
              </Button>
            </div>
          </div>
        )}
      </Card>
    </main>
  )
}
