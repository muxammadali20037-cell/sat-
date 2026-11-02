import { Badge } from '@/components/ui/card'
import { ROLE_LABELS, isRole } from '@/config/roles'
import { CONTENT_STATUS_LABELS, QUESTION_STATUS_LABELS, isContentStatus, isQuestionStatus } from '@/features/content/constants'

const QUESTION_VARIANT = { draft: 'neutral', reviewed: 'primary', published: 'success', archived: 'outline' } as const
const CONTENT_VARIANT = { draft: 'neutral', published: 'success', archived: 'outline' } as const

export function QuestionStatusBadge({ status }: { status: string }) {
  if (!isQuestionStatus(status)) return <Badge variant="outline">{status}</Badge>
  return <Badge variant={QUESTION_VARIANT[status]}>{QUESTION_STATUS_LABELS[status]}</Badge>
}

export function ContentStatusBadge({ status }: { status: string }) {
  if (!isContentStatus(status)) return <Badge variant="outline">{status}</Badge>
  return <Badge variant={CONTENT_VARIANT[status]}>{CONTENT_STATUS_LABELS[status]}</Badge>
}

const PAYMENT_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'neutral' | 'outline'> = {
  succeeded: 'success',
  pending: 'warning',
  processing: 'warning',
  failed: 'destructive',
  canceled: 'neutral',
  refunded: 'outline',
}

export function PaymentStatusBadge({ status }: { status: string }) {
  return <Badge variant={PAYMENT_VARIANT[status] ?? 'outline'}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>
}

export function RoleBadge({ role }: { role: string }) {
  if (!isRole(role)) return <Badge variant="outline">{role}</Badge>
  const variant = role === 'STUDENT' ? 'neutral' : role === 'SUPER_ADMIN' || role === 'ADMIN' ? 'navy' : 'primary'
  return <Badge variant={variant}>{ROLE_LABELS[role]}</Badge>
}
