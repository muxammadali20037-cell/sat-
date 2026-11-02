'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { useDict } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/dict'
import { diagnosticDict } from '@/lib/i18n/dictionaries/diagnostic'
import { Button, type ButtonProps } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'

/** Starts (or resumes) a diagnostic and opens the runner. */
export function StartDiagnosticButton({
  diagnosticTestId,
  children,
  ...props
}: { diagnosticTestId: string; children: React.ReactNode } & Omit<ButtonProps, 'onClick' | 'loading'>) {
  const t = useDict(diagnosticDict)
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function start() {
    setPending(true)
    try {
      const res = await apiFetch<{ attemptId: string }>('/api/diagnostic/start', { method: 'POST', body: { diagnosticTestId } })
      router.push(`/dashboard/diagnostic/${res.attemptId}`)
    } catch (err) {
      setPending(false)
      if (!(err instanceof ApiClientError)) return void toast.error(t.errors.generic)
      const details = (err.details ?? {}) as { reason?: string; domain?: string }
      if (err.code === 'NETWORK_ERROR') toast.error(t.errors.network)
      else if (err.code === 'RATE_LIMITED') toast.error(t.errors.rateLimited)
      else if (err.code === 'PLAN_REQUIRED') toast.error(t.planRequiredTitle, { description: t.planRequiredBody })
      else if (details.reason === 'not_ready') toast.error(format(t.errors.notReady, { domain: details.domain ?? '' }))
      else if (details.reason === 'other_test_in_progress') toast.error(t.errors.otherTest)
      else if (err.code === 'NOT_FOUND') toast.error(t.errors.notFound)
      else toast.error(t.errors.generic)
    }
  }

  return (
    <Button {...props} loading={pending} onClick={() => void start()}>
      {children}
    </Button>
  )
}
