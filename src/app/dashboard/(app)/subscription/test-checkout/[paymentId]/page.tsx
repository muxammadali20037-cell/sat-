import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FlaskConical } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { getDict, getLocale } from '@/lib/i18n/server'
import { subscriptionDict } from '@/lib/i18n/dictionaries/subscription'
import { createServerSupabase } from '@/lib/supabase/server'
import { testProviderSecret } from '@/lib/payments/registry'
import { getMyPayment } from '@/features/payments/server'
import { PageHeader } from '@/components/layout/page-header'
import { Alert, Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TestCheckoutActions } from '@/components/subscription/test-checkout-actions'
import { formatMoney } from '@/lib/utils'

export const metadata: Metadata = { title: 'Test checkout' }

/** Development-only simulated checkout. 404 whenever the test provider is disabled (always in production). */
export default async function TestCheckoutPage({ params }: { params: Promise<{ paymentId: string }> }) {
  if (!testProviderSecret()) notFound()
  const profile = await requireStudentReady()
  const [{ paymentId }, t, locale, db] = await Promise.all([params, getDict(subscriptionDict), getLocale(), createServerSupabase()])
  const payment = await getMyPayment(db, profile.id, paymentId)
  if (!payment || payment.provider !== 'test') notFound()

  return (
    <div className="max-w-xl">
      <PageHeader title={t.test.title} />
      <Alert variant="warning" icon={<FlaskConical />} title={t.test.banner}>
        {t.test.body}
      </Alert>
      <Card className="mt-6 p-6">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">{t.test.plan}</dt>
            <dd className="mt-0.5 font-medium">{payment.planName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t.test.amount}</dt>
            <dd className="mt-0.5 font-medium tabular">{formatMoney(payment.amountMinor, payment.currency, locale)}</dd>
          </div>
        </dl>
        <div className="mt-6 border-t border-border pt-6">
          {payment.status === 'pending' ? (
            <TestCheckoutActions paymentId={payment.id} />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">{t.test.notPending}</p>
              <Button asChild variant="secondary" size="sm">
                <Link href={`/dashboard/subscription/return?payment=${payment.id}`}>{t.returnPage.title}</Link>
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
