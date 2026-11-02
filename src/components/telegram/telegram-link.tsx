'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogoMark } from '@/components/layout/logo'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api/client'
import { whenWebApp } from '@/lib/telegram/client'
import { TG_COPY, tgCopyFor, type TgCopy } from './telegram-copy'
import { EntryFrame, errorMessage } from './telegram-entry'

/** Connects the signed-in account to the Telegram user who opened the Mini App, then continues. */
export function TelegramLink() {
  const router = useRouter()
  const [t, setT] = React.useState<TgCopy>(TG_COPY.uz)
  const [failure, setFailure] = React.useState<{ title: string; body: string } | null>(null)

  React.useEffect(() => {
    let cancelled = false
    whenWebApp().then(async (wa) => {
      if (cancelled) return
      if (!wa) return setFailure({ title: TG_COPY.uz.linkFailedTitle, body: TG_COPY.uz.linkOutside })
      const copy = tgCopyFor(wa.initDataUnsafe.user?.language_code)
      setT(copy)
      try {
        const res = await apiFetch<{ linked: true; next: string }>('/api/telegram/link', { body: { initData: wa.initData } })
        wa.HapticFeedback?.notificationOccurred('success')
        router.replace(res.next)
        router.refresh()
      } catch (err) {
        if (!cancelled) setFailure({ title: copy.linkFailedTitle, body: errorMessage(err, copy) })
      }
    })
    return () => {
      cancelled = true
    }
  }, [router])

  if (!failure) {
    return (
      <EntryFrame>
        <div className="flex flex-col items-center gap-4 text-center" role="status">
          <LogoMark className="size-12 animate-pulse motion-reduce:animate-none" />
          <p className="text-sm text-muted-foreground">{t.linking}</p>
        </div>
      </EntryFrame>
    )
  }
  return (
    <EntryFrame
      footer={
        <Button asChild size="lg" variant="secondary" className="w-full">
          <Link href="/dashboard">{t.toHome}</Link>
        </Button>
      }
    >
      <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{failure.title}</h1>
      <p role="alert" className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        {failure.body}
      </p>
    </EntryFrame>
  )
}
