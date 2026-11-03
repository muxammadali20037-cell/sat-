'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiFetch, ApiClientError } from '@/lib/api/client'

export type TelegramLoginLabels = {
  continue: string
  openTelegram: string
  codeLabel: string
  codeHint: string
  waiting: string
  opened: string
  signingIn: string
  denied: string
  expired: string
  retry: string
  cancel: string
  unavailable: string
}

type Start = { id: string; code: string; link: string; expiresAt: string }
type Poll = { status: 'waiting'; opened: boolean } | { status: 'denied' | 'expired' } | { status: 'signed_in'; next: string } | { status: 'linked' }

type State =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'waiting'; start: Start; opened: boolean }
  | { kind: 'done' }
  | { kind: 'ended'; message: string }

/**
 * "Continue with Telegram": opens the bot, shows the code the bot will repeat, and polls until the
 * student confirms in Telegram. The page keeps polling while the student is in the Telegram app
 * (the link opens in a new tab or the app), and checks again the moment they come back.
 */
export function TelegramLogin({
  labels,
  intent = 'sign_in',
  next,
  onLinked,
  className,
}: {
  labels: TelegramLoginLabels
  intent?: 'sign_in' | 'link'
  next?: string
  onLinked?: () => void
  className?: string
}) {
  const router = useRouter()
  const [state, setState] = React.useState<State>({ kind: 'idle' })
  const busy = React.useRef(false)

  const begin = async () => {
    setState({ kind: 'starting' })
    try {
      const start = await apiFetch<Start>('/api/telegram/login', { body: { intent, next } })
      setState({ kind: 'waiting', start, opened: false })
    } catch {
      setState({ kind: 'ended', message: labels.unavailable })
    }
  }

  const poll = React.useCallback(
    async (id: string) => {
      if (busy.current) return
      busy.current = true
      try {
        const res = await apiFetch<Poll>(`/api/telegram/login/${id}`)
        if (res.status === 'waiting') setState((s) => (s.kind === 'waiting' ? { ...s, opened: res.opened } : s))
        else if (res.status === 'signed_in') {
          setState({ kind: 'done' })
          router.replace(res.next)
          router.refresh()
        } else if (res.status === 'linked') {
          setState({ kind: 'idle' })
          onLinked?.()
          router.refresh()
        } else setState({ kind: 'ended', message: res.status === 'denied' ? labels.denied : labels.expired })
      } catch (err) {
        if (err instanceof ApiClientError && err.code !== 'NETWORK_ERROR' && err.code !== 'RATE_LIMITED') {
          setState({ kind: 'ended', message: err.status === 409 || err.status === 403 ? err.message : labels.expired })
        }
      } finally {
        busy.current = false
      }
    },
    [labels.denied, labels.expired, onLinked, router],
  )

  const waitingId = state.kind === 'waiting' ? state.start.id : null
  React.useEffect(() => {
    if (!waitingId) return
    const timer = setInterval(() => poll(waitingId), 2000)
    const onVisible = () => document.visibilityState === 'visible' && poll(waitingId)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [waitingId, poll])

  if (state.kind === 'idle' || state.kind === 'starting') {
    return (
      <Button type="button" variant="secondary" size="lg" className={className ?? 'w-full'} loading={state.kind === 'starting'} onClick={begin}>
        {state.kind === 'idle' && <Send aria-hidden className="text-[#229ED9]" />}
        {labels.continue}
      </Button>
    )
  }

  if (state.kind === 'done') {
    return (
      <p role="status" className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> {labels.signingIn}
      </p>
    )
  }

  if (state.kind === 'ended') {
    return (
      <div className="rounded-lg border border-border p-4 text-sm">
        <p role="alert">{state.message}</p>
        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={begin}>
          {labels.retry}
        </Button>
      </div>
    )
  }

  const { start, opened } = state
  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <Button asChild size="lg" className="w-full">
        <a href={start.link} target="_blank" rel="noopener noreferrer">
          <Send aria-hidden /> {labels.openTelegram}
        </a>
      </Button>
      <div className="mt-4 text-center">
        <p className="text-xs text-muted-foreground">{labels.codeLabel}</p>
        <p className="mt-1 font-mono text-[32px] font-semibold tracking-[0.3em] tabular-nums" aria-label={start.code.split('').join(' ')}>
          {start.code}
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">{labels.codeHint}</p>
      </div>
      <p role="status" aria-live="polite" className="mt-4 flex items-center justify-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
        {opened ? labels.opened : labels.waiting}
      </p>
      <div className="mt-3 text-center">
        <button type="button" className="text-[13px] text-muted-foreground underline-offset-4 hover:underline" onClick={() => setState({ kind: 'idle' })}>
          {labels.cancel}
        </button>
      </div>
    </div>
  )
}
