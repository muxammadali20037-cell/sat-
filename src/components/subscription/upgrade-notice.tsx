import Link from 'next/link'
import { Lock } from 'lucide-react'
import { Alert } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

/**
 * Shown when an action returns PLAN_REQUIRED / PLAN_LIMIT_REACHED, or a page section needs a
 * paid feature. States the reason plainly and links to the subscription page.
 */
export function UpgradeNotice({
  title = 'This is part of a paid plan',
  description = 'Choose a plan to unlock it. You can cancel any time; access continues until the end of the paid period.',
  limit,
  className,
  actionLabel = 'See plans',
}: {
  title?: string
  description?: string
  limit?: { used: number; limit: number }
  className?: string
  actionLabel?: string
}) {
  return (
    <Alert
      variant="primary"
      icon={<Lock className="text-primary" />}
      title={title}
      className={className}
      action={
        <Button asChild size="sm">
          <Link href="/dashboard/subscription">{actionLabel}</Link>
        </Button>
      }
    >
      {limit ? `You have used ${limit.used} of ${limit.limit}. ${description}` : description}
    </Alert>
  )
}
