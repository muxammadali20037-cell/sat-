'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Languages, PenLine, Sparkles, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LogoMark } from '@/components/layout/logo'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { whenWebApp, type TelegramWebApp } from '@/lib/telegram/client'
import { tgCopyFor, TG_COPY, type TgCopy } from './telegram-copy'

type Session = { status: 'signed_in'; isNew: boolean; next: string } | { status: 'unlinked'; firstName: string }

type View =
  | { kind: 'loading'; label: string }
  | { kind: 'welcome'; firstName: string; signedOut: boolean }
  | { kind: 'outside' }
  | { kind: 'web' }
  | { kind: 'error'; message: string }

export function errorMessage(err: unknown, t: TgCopy): string {
  if (!(err instanceof ApiClientError)) return t.errors.generic
  const reason = (err.details as { reason?: string } | undefined)?.reason
  if (reason === 'telegram_in_use') return t.errors.telegramInUse
  if (reason === 'account_has_other_telegram') return t.errors.otherTelegram
  if (err.code === 'NETWORK_ERROR') return t.errors.network
  if (err.code === 'SERVICE_NOT_CONFIGURED') return t.errors.notConfigured
  if (err.status === 401) return t.errors.invalid
  if (err.status === 403) return t.errors.suspended
  return t.errors.generic
}

/** Full-height, app-like frame: content in the middle, actions pinned to the bottom (thumb reach). */
export function EntryFrame({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-surface px-5 pb-[calc(1.25rem+var(--app-inset-bottom))] pt-6">
      <div className="flex items-center gap-2">
        <LogoMark className="size-7" />
        <span className="font-display text-[15px] font-semibold tracking-[0.04em] text-navy-900 dark:text-white">SAT MASTER</span>
      </div>
      <div className="flex flex-1 flex-col justify-center py-8">{children}</div>
      {footer && <div className="space-y-3">{footer}</div>}
    </main>
  )
}

export function TelegramEntry({ signedOut }: { signedOut: boolean }) {
  const router = useRouter()
  const [app, setApp] = React.useState<TelegramWebApp | null>(null)
  const [t, setT] = React.useState<TgCopy>(TG_COPY.uz)
  const [view, setView] = React.useState<View>({ kind: 'loading', label: TG_COPY.uz.loading })
  const [busy, setBusy] = React.useState(false)

  const open = React.useCallback(
    async (wa: TelegramWebApp, create: boolean, copy: TgCopy) => {
      setBusy(true)
      if (create) setView({ kind: 'loading', label: copy.creating })
      try {
        const res = await apiFetch<Session>('/api/telegram/session', { body: { initData: wa.initData, create } })
        if (res.status === 'signed_in') {
          wa.HapticFeedback?.notificationOccurred('success')
          router.replace(res.next)
          router.refresh()
          return
        }
        setView({ kind: 'welcome', firstName: res.firstName, signedOut: false })
      } catch (err) {
        wa.HapticFeedback?.notificationOccurred('error')
        setView({ kind: 'error', message: errorMessage(err, copy) })
      } finally {
        setBusy(false)
      }
    },
    [router],
  )

  React.useEffect(() => {
    let cancelled = false
    whenWebApp().then((wa) => {
      if (cancelled) return
      if (!wa) return setView({ kind: 'outside' })
      const copy = tgCopyFor(wa.initDataUnsafe.user?.language_code)
      setT(copy)
      setApp(wa)
      // Telegram Web runs Mini Apps in a cross-site frame, where browsers drop the session cookie.
      if (window.top !== window.self) return setView({ kind: 'web' })
      if (signedOut) return setView({ kind: 'welcome', firstName: wa.initDataUnsafe.user?.first_name ?? '', signedOut: true })
      setView({ kind: 'loading', label: copy.loading })
      void open(wa, false, copy)
    })
    return () => {
      cancelled = true
    }
  }, [open, signedOut])

  if (view.kind === 'loading') {
    return (
      <EntryFrame>
        <div className="flex flex-col items-center gap-4 text-center" role="status">
          <LogoMark className="size-12 animate-pulse motion-reduce:animate-none" />
          <p className="text-sm text-muted-foreground">{view.label}</p>
        </div>
      </EntryFrame>
    )
  }

  if (view.kind === 'outside' || view.kind === 'web' || view.kind === 'error') {
    const title = view.kind === 'outside' ? t.outsideTitle : view.kind === 'web' ? t.webTitle : t.errorTitle
    const body = view.kind === 'outside' ? t.outsideBody : view.kind === 'web' ? t.webBody : view.message
    return (
      <EntryFrame
        footer={
          view.kind === 'error' && app ? (
            <Button size="lg" className="w-full" loading={busy} onClick={() => open(app, false, t)}>
              {t.retry}
            </Button>
          ) : view.kind === 'web' && app ? (
            <Button size="lg" className="w-full" onClick={() => app.openLink(`${location.origin}/login`)}>
              {t.openSite}
            </Button>
          ) : (
            <Button asChild size="lg" variant="secondary" className="w-full">
              <Link href="/">{t.toSite}</Link>
            </Button>
          )
        }
      >
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground" role={view.kind === 'error' ? 'alert' : undefined}>
          {body}
        </p>
      </EntryFrame>
    )
  }

  const icons = [Target, PenLine, Languages]
  return (
    <EntryFrame
      footer={
        <>
          <Button size="lg" className="w-full" loading={busy} onClick={() => app && open(app, true, t)}>
            {view.signedOut ? t.continueTelegram : t.start}
          </Button>
          <Button size="lg" variant="ghost" className="w-full" disabled={busy} onClick={() => router.push('/tg/link')}>
            {view.signedOut ? t.otherAccount : t.haveAccount}
          </Button>
          {!view.signedOut && (
            <p className="px-2 text-center text-xs leading-relaxed text-muted-foreground">
              {t.termsBefore}
              <Link href="/terms" className="underline underline-offset-2">
                {t.terms}
              </Link>
              {t.and}
              <Link href="/privacy" className="underline underline-offset-2">
                {t.privacy}
              </Link>
              {t.termsAfter}
            </p>
          )}
        </>
      }
    >
      {view.signedOut ? (
        <>
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{t.signedOutTitle}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{t.signedOutBody}</p>
        </>
      ) : (
        <>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
            {view.firstName ? t.hello.replace('{name}', view.firstName) : t.lead}
          </h1>
          {view.firstName && <p className="mt-2 text-[17px] text-muted-foreground">{t.lead}</p>}
          <ul className="mt-8 space-y-5">
            {t.points.map((point, i) => {
              const Icon = icons[i] ?? Sparkles
              return (
                <li key={point} className="flex items-start gap-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="pt-1.5 text-[15px] leading-snug">{point}</span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </EntryFrame>
  )
}
