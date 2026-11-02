'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { configureTelegramBotAction } from '@/features/telegram/admin-actions'

export function ConfigureTelegramButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      loading={pending}
      disabled={disabled}
      onClick={() =>
        start(async () => {
          const res = await configureTelegramBotAction()
          if (res.ok) {
            toast.success(`${res.message}: ${res.data?.steps.join(', ')}`)
            router.refresh()
          } else toast.error(res.error)
        })
      }
    >
      <Send aria-hidden /> Configure bot
    </Button>
  )
}
