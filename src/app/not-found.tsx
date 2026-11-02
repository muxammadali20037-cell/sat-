import Link from 'next/link'
import { Logo } from '@/components/layout/logo'
import { Button } from '@/components/ui/button'
import { getDict } from '@/lib/i18n/server'
import { publicDict } from '@/lib/i18n/dictionaries/public'

export default async function NotFound() {
  const t = await getDict(publicDict, { public: true })
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 items-center px-4 sm:px-8">
        <Logo />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 pb-20">
        <div className="w-full max-w-md text-center">
          {/* The question-navigator motif: one square left unanswered. */}
          <div aria-hidden className="mx-auto mb-8 grid w-fit grid-cols-4 gap-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className={
                  i === 6
                    ? 'size-7 rounded-md border border-dashed border-border-strong'
                    : 'size-7 rounded-md bg-navy-900 dark:bg-primary'
                }
              />
            ))}
          </div>
          <p className="text-sm font-semibold text-primary tabular">{t.notFound.code}</p>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight text-foreground">{t.notFound.title}</h1>
          <p className="mt-2 text-muted-foreground">{t.notFound.body}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/">{t.notFound.home}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard">{t.notFound.dashboard}</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
