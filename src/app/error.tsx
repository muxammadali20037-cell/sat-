'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Logo } from '@/components/layout/logo'
import { Button } from '@/components/ui/button'
import { useDict } from '@/lib/i18n/client'
import { commonDict } from '@/lib/i18n/dictionaries/common'

/** Root error boundary. Never shows internals; shows the digest so support can find the server log. */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useDict(commonDict)
  const digest = error instanceof Error && 'digest' in error && typeof error.digest === 'string' ? error.digest : null

  useEffect(() => {
    console.error('[root-error]', digest ?? error)
  }, [error, digest])

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 items-center px-4 sm:px-8">
        <Logo />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 pb-20">
        <div role="alert" className="w-full max-w-md text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-destructive-soft text-destructive">
            <AlertTriangle className="size-6" aria-hidden />
          </span>
          <h1 className="mt-6 text-[26px] font-semibold leading-tight text-foreground">{t.states.errorTitle}</h1>
          <p className="mt-2 text-muted-foreground">{t.states.errorBody}</p>
          {digest && <p className="mt-3 text-xs text-muted-foreground tabular">Ref: {digest}</p>}
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button onClick={() => retry()}>{t.actions.retry}</Button>
            <Button asChild variant="secondary">
              <Link href="/">{t.nav.home}</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
