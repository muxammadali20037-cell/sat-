'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api/client'
import { useDict } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/dict'
import { practiceDict } from '@/lib/i18n/dictionaries/practice'
import { Button, type ButtonProps } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { errorDetails, isPlanLimit, practiceErrorMessage } from './error-message'

export type StartRequest = { mode: 'set'; practiceSetId: string } | { mode: 'retry'; sourceAttemptId: string } | { mode: 'bookmarks' }

/** Starts a server-composed practice session and opens the runner. */
export function StartPracticeButton({
  request,
  children,
  ...props
}: { request: StartRequest; children: React.ReactNode } & Omit<ButtonProps, 'onClick' | 'loading'>) {
  const t = useDict(practiceDict)
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function start() {
    setPending(true)
    try {
      const res = await apiFetch<{ attemptId: string }>('/api/practice/start', { method: 'POST', body: request })
      router.push(`/dashboard/practice/${res.attemptId}`)
    } catch (err) {
      setPending(false)
      if (isPlanLimit(err)) {
        const d = errorDetails<{ limit: number }>(err)
        toast.error(t.usage.limitTitle, {
          description: d.limit !== undefined ? format(t.usage.limitBody, { limit: d.limit }) : t.usage.disabledBody,
          action: { label: t.usage.seePlans, onClick: () => router.push('/dashboard/subscription') },
        })
      } else {
        toast.error(practiceErrorMessage(err, t.errors))
      }
    }
  }

  return (
    <Button {...props} loading={pending} onClick={() => void start()}>
      {children}
    </Button>
  )
}
