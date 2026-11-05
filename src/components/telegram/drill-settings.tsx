'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { apiFetch, ApiClientError } from '@/lib/api/client'

type Labels = { drillsTitle: string; drillsBody: string; drillsOn: string; drillsSaved: string; drillsNow: string; drillsSent: string }

/** Daily Telegram drill: on/off, and "send today's now". Shown only when Telegram is connected. */
export function DrillSettings({ enabled, labels }: { enabled: boolean; labels: Labels }) {
  const router = useRouter()
  const [on, setOn] = React.useState(enabled)
  const [pending, setPending] = React.useState<'toggle' | 'send' | null>(null)
  const call = async (kind: 'toggle' | 'send', fn: () => Promise<unknown>, ok: string) => {
    setPending(kind)
    try {
      await fn()
      toast.success(ok)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Something went wrong.')
      if (kind === 'toggle') setOn((v) => !v)
    } finally {
      setPending(null)
    }
  }
  return (
    <div className="mt-6 border-t border-border pt-5" data-testid="drill-settings">
      <h3 className="text-base font-semibold">{labels.drillsTitle}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{labels.drillsBody}</p>
      <label className="mt-3 flex items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4 accent-[var(--primary)]"
          checked={on}
          disabled={pending !== null}
          onChange={(e) => {
            const next = e.target.checked
            setOn(next)
            void call('toggle', () => apiFetch('/api/telegram/drills', { method: 'PATCH', body: { enabled: next } }), labels.drillsSaved)
          }}
        />
        {labels.drillsOn}
      </label>
      <Button type="button" variant="secondary" size="sm" className="mt-3" loading={pending === 'send'} onClick={() => call('send', () => apiFetch('/api/telegram/drills', { method: 'POST' }), labels.drillsSent)}>
        {labels.drillsNow}
      </Button>
    </div>
  )
}
