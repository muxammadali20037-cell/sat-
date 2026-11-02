'use client'

import { useState, useTransition } from 'react'
import { Check, CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { setGuideReadAction } from '@/features/guides/actions'

export function MarkReadButton({
  guideId,
  slug,
  initialRead,
  labels,
}: {
  guideId: string
  slug: string
  initialRead: boolean
  labels: { markRead: string; markedRead: string; unmarkRead: string }
}) {
  const [read, setRead] = useState(initialRead)
  const [pending, startTransition] = useTransition()

  const toggle = () =>
    startTransition(async () => {
      const next = !read
      const res = await setGuideReadAction({ guideId, slug, read: next })
      if (res.ok) setRead(next)
      else toast.error(res.error)
    })

  return read ? (
    <Button variant="secondary" size="sm" onClick={toggle} loading={pending} title={labels.unmarkRead} aria-pressed>
      <CircleCheck className="text-success" aria-hidden /> {labels.markedRead}
    </Button>
  ) : (
    <Button variant="primary" size="sm" onClick={toggle} loading={pending} aria-pressed={false}>
      <Check aria-hidden /> {labels.markRead}
    </Button>
  )
}
