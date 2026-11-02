'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { useDict } from '@/lib/i18n/client'
import { subscriptionDict } from '@/lib/i18n/dictionaries/subscription'
import { simulateTestPaymentAction } from '@/features/payments/test-actions'

export function TestCheckoutActions({ paymentId }: { paymentId: string }) {
  const t = useDict(subscriptionDict)
  const router = useRouter()
  const [busy, setBusy] = React.useState<'succeeded' | 'failed' | null>(null)

  async function simulate(outcome: 'succeeded' | 'failed') {
    setBusy(outcome)
    const result = await simulateTestPaymentAction({ paymentId, outcome })
    if (result.ok && result.data) {
      router.push(result.data.redirectUrl)
      return
    }
    toast.error(result.ok ? 'Unexpected response' : result.error)
    setBusy(null)
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button loading={busy === 'succeeded'} disabled={busy !== null} onClick={() => void simulate('succeeded')}>
        {t.test.succeed}
      </Button>
      <Button variant="secondary" loading={busy === 'failed'} disabled={busy !== null} onClick={() => void simulate('failed')}>
        {t.test.fail}
      </Button>
    </div>
  )
}
