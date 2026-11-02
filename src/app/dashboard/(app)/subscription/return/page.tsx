import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStudentReady } from '@/lib/auth/session'
import { getDict, getLocale } from '@/lib/i18n/server'
import { subscriptionDict } from '@/lib/i18n/dictionaries/subscription'
import { createServerSupabase } from '@/lib/supabase/server'
import { getMyPayment } from '@/features/payments/server'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/ui/states'
import { Button } from '@/components/ui/button'
import { PaymentStatusPanel } from '@/components/subscription/payment-status'
import { formatMoney } from '@/lib/utils'

export const metadata: Metadata = { title: 'Payment status' }

/**
 * Where providers send the student back. DISPLAY ONLY: shows the payment row as recorded from
 * verified provider callbacks and polls it while it is open. Query parameters from the provider
 * redirect are ignored on purpose.
 */
export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<{ payment?: string | string[] }> }) {
  const profile = await requireStudentReady({ next: '/dashboard/subscription' })
  const [{ payment: raw }, t, locale, db] = await Promise.all([searchParams, getDict(subscriptionDict), getLocale(), createServerSupabase()])
  const paymentId = typeof raw === 'string' ? raw : ''
  const payment = paymentId ? await getMyPayment(db, profile.id, paymentId) : null

  return (
    <div>
      <PageHeader title={t.returnPage.title} />
      {payment ? (
        <PaymentStatusPanel
          paymentId={payment.id}
          number={payment.number}
          initialStatus={payment.status as 'pending'}
          planName={payment.planName}
          providerLabel={payment.provider in t.method ? t.method[payment.provider as keyof typeof t.method] : payment.provider}
          amountLabel={formatMoney(payment.amountMinor, payment.currency, locale)}
        />
      ) : (
        <EmptyState
          title={t.returnPage.notFound}
          description={t.returnPage.notFoundBody}
          action={
            <Button asChild variant="secondary">
              <Link href="/dashboard/subscription">{t.returnPage.backToPlans}</Link>
            </Button>
          }
        />
      )}
    </div>
  )
}
