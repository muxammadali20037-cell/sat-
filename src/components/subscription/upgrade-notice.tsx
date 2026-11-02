'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { Alert } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useDict } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/dict'
import { learningDict } from '@/lib/i18n/dictionaries/learning'

/**
 * Shown when an action returns PLAN_REQUIRED / PLAN_LIMIT_REACHED, or a page section needs a
 * paid feature. States the reason plainly and links to the subscription page.
 * Text defaults follow the viewer's locale; props override them.
 */
export function UpgradeNotice({
  title,
  description,
  limit,
  className,
  actionLabel,
}: {
  title?: string
  description?: string
  limit?: { used: number; limit: number }
  className?: string
  actionLabel?: string
}) {
  const t = useDict(learningDict).upgrade
  const body = description ?? (limit ? t.limitDescription : t.description)
  return (
    <Alert
      variant="primary"
      icon={<Lock className="text-primary" />}
      title={title ?? (limit ? t.limitTitle : t.title)}
      className={className}
      action={
        <Button asChild size="sm">
          <Link href="/dashboard/subscription">{actionLabel ?? t.action}</Link>
        </Button>
      }
    >
      {limit ? `${format(t.used, { used: limit.used, limit: limit.limit })} ${body}` : body}
    </Alert>
  )
}
