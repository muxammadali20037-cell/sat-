'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { apiFetch, ApiClientError } from '@/lib/api/client'

export function DisconnectTelegramButton({ label, doneLabel }: { label: string; doneLabel: string }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  return (
    <Button
      variant="secondary"
      className="mt-4"
      loading={pending}
      onClick={async () => {
        setPending(true)
        try {
          await apiFetch('/api/telegram/link', { method: 'DELETE' })
          toast.success(doneLabel)
          router.refresh()
        } catch (err) {
          toast.error(err instanceof ApiClientError ? err.message : 'Something went wrong.')
        } finally {
          setPending(false)
        }
      }}
    >
      {label}
    </Button>
  )
}
