'use client'

import * as React from 'react'
import { FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { useDict } from '@/lib/i18n/client'
import { subscriptionDict } from '@/lib/i18n/dictionaries/subscription'
import type { ProviderId } from '@/lib/payments/types'

/**
 * One button per configured provider. Each click creates (or, for a repeated click, reuses) a
 * pending payment with a client idempotency key and follows the provider redirect. The page we
 * come back to only displays the payment status — it never confirms anything.
 */
export function CheckoutButtons({ planCode, providers, primary }: { planCode: string; providers: ProviderId[]; primary?: boolean }) {
  const t = useDict(subscriptionDict)
  const [busy, setBusy] = React.useState<ProviderId | null>(null)
  const keys = React.useRef<Partial<Record<ProviderId, string>>>({})

  async function start(provider: ProviderId) {
    setBusy(provider)
    keys.current[provider] ??= crypto.randomUUID()
    try {
      const { redirectUrl } = await apiFetch<{ paymentId: string; redirectUrl: string }>('/api/payments/checkout', {
        body: { planCode, provider, idempotencyKey: keys.current[provider] },
      })
      toast(t.checkout.redirecting)
      window.location.assign(redirectUrl)
    } catch (err) {
      // A different outcome needs a fresh attempt next time.
      delete keys.current[provider]
      toast.error(t.checkout.failed, { description: err instanceof ApiClientError ? err.message : undefined })
      setBusy(null)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-2">
      {providers.map((id, i) => (
        <Button
          key={id}
          variant={id === 'test' ? 'secondary' : primary && i === 0 ? 'primary' : 'secondary'}
          loading={busy === id}
          disabled={busy !== null && busy !== id}
          onClick={() => void start(id)}
          className="w-full"
        >
          {id === 'test' && <FlaskConical aria-hidden />}
          {t.providers[id]}
        </Button>
      ))}
    </div>
  )
}
