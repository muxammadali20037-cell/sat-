import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth/session'
import { ADMIN_ROLES } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { Alert } from '@/components/ui/card'
import { listPlansForAdmin } from '@/features/subscriptions/admin'
import { BillingTabs } from '@/components/admin/billing/billing-ui'
import { PlanEditor } from '@/components/admin/billing/plan-editor'

export const metadata: Metadata = { title: 'Plans' }

export default async function AdminPlansPage() {
  await requireRole(ADMIN_ROLES, { next: '/admin/subscriptions/plans' })
  const plans = await listPlansForAdmin()
  return (
    <div>
      <PageHeader title="Subscriptions" description="Plans, prices and what each plan includes." />
      <BillingTabs active="plans" />
      <Alert variant="neutral" className="mb-6">
        UZS prices are what Click and Payme charge; the USD price is what card checkout (Stripe) charges. Limits are per day (practice,
        AI) or per calendar month (mock exams) in the student&apos;s time zone. Every change is recorded in the audit log.
      </Alert>
      <div className="grid grid-cols-1 gap-6">
        {plans.map((p) => (
          <PlanEditor key={p.id} plan={p} />
        ))}
      </div>
    </div>
  )
}
