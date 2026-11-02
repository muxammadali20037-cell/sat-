import 'server-only'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { format, resolveDict } from '@/lib/i18n/dict'
import { isUiLocale } from '@/lib/i18n/config'
import { subscriptionDict } from '@/lib/i18n/dictionaries/subscription'
import { PAYME_TIMEOUT_MS } from '@/lib/payments/payme'
import { cancelPendingPayment } from '@/features/payments/process'
import { getGraceDays } from './server'

export const STALE_PAYMENT_HOURS = 24
const BATCH = 500

export type MaintenanceResult = { reminders: number; expired: number; stalePaymentsCanceled: number; errors: number }

/** Link doubles as the once-per-period dedupe key (notifications has no metadata column). */
export const reminderLink = (periodEnd: string) => `/dashboard/subscription?reminder=${Math.floor(new Date(periodEnd).getTime() / 1000)}`

function formatDate(iso: string, locale: string, timeZone: string): string {
  const intl = locale === 'uz' ? 'uz-UZ' : 'en-GB'
  try {
    return new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

async function reminderDays(): Promise<number> {
  const { data } = await createAdminSupabase().from('platform_settings').select('value').eq('key', 'billing.renewal_reminder_days').maybeSingle()
  const n = Number(data?.value)
  return Number.isFinite(n) && n >= 0 && n <= 30 ? n : 3
}

type SubRow = {
  id: string
  user_id: string
  current_period_end: string
  plan: { name: string } | null
  profile: { locale: string; timezone: string } | null
}

/**
 * Daily maintenance (idempotent — safe to run any number of times):
 *  1. one renewal reminder per subscription period, `billing.renewal_reminder_days` before it ends
 *     (skipped when the student canceled);
 *  2. subscriptions past period end + grace → status `expired` (+ one notification);
 *  3. abandoned checkouts older than 24 h → canceled. Payme transactions in state 1 are left alone
 *     until their own 12-hour window has passed, then closed with reason 4 (timeout).
 */
export async function runRenewalMaintenance(now = new Date()): Promise<MaintenanceResult> {
  const admin = createAdminSupabase()
  const result: MaintenanceResult = { reminders: 0, expired: 0, stalePaymentsCanceled: 0, errors: 0 }
  const [days, graceDays] = await Promise.all([reminderDays(), getGraceDays()])
  const select = 'id, user_id, current_period_end, plan:plans!subscriptions_plan_id_fkey(name), profile:profiles!subscriptions_user_id_fkey(locale, timezone)'

  // 1. Renewal reminders
  const { data: ending, error: endingError } = await admin
    .from('subscriptions')
    .select(select)
    .eq('status', 'active')
    .eq('cancel_at_period_end', false)
    .gt('current_period_end', now.toISOString())
    .lte('current_period_end', new Date(now.getTime() + days * 86_400_000).toISOString())
    .limit(BATCH)
  if (endingError) throw endingError
  const endingRows = (ending ?? []) as unknown as SubRow[]
  if (endingRows.length > 0) {
    const links = [...new Set(endingRows.map((s) => reminderLink(s.current_period_end)))]
    const { data: sent, error: sentError } = await admin
      .from('notifications')
      .select('user_id, link')
      .eq('type', 'subscription')
      .in('user_id', endingRows.map((s) => s.user_id))
      .in('link', links)
    if (sentError) throw sentError
    const already = new Set((sent ?? []).map((n) => `${n.user_id}|${n.link}`))
    const rows = endingRows
      .filter((s) => !already.has(`${s.user_id}|${reminderLink(s.current_period_end)}`))
      .map((s) => {
        const locale = isUiLocale(s.profile?.locale) ? s.profile!.locale : 'en'
        const t = resolveDict(subscriptionDict, locale).reminders
        const date = formatDate(s.current_period_end, locale, s.profile?.timezone ?? 'Asia/Tashkent')
        return {
          user_id: s.user_id,
          type: 'subscription',
          title: format(t.renewTitle, { plan: s.plan?.name ?? '', date }).slice(0, 160),
          body: t.renewBody,
          link: reminderLink(s.current_period_end),
        }
      })
    if (rows.length > 0) {
      const { error } = await admin.from('notifications').insert(rows)
      if (error) throw error
      result.reminders = rows.length
    }
  }

  // 2. Expire subscriptions past their grace period
  const graceCutoff = new Date(now.getTime() - graceDays * 86_400_000).toISOString()
  const { data: expired, error: expireError } = await admin
    .from('subscriptions')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('current_period_end', graceCutoff)
    .select(select)
  if (expireError) throw expireError
  const expiredRows = (expired ?? []) as unknown as SubRow[]
  if (expiredRows.length > 0) {
    result.expired = expiredRows.length
    const notes = expiredRows.map((s) => {
      const locale = isUiLocale(s.profile?.locale) ? s.profile!.locale : 'en'
      const t = resolveDict(subscriptionDict, locale).reminders
      return {
        user_id: s.user_id,
        type: 'subscription',
        title: format(t.expiredTitle, { plan: s.plan?.name ?? '' }).slice(0, 160),
        body: t.expiredBody,
        link: '/dashboard/subscription',
      }
    })
    const { error } = await admin.from('notifications').insert(notes)
    if (error) console.error('[cron] expiry notifications failed', error)
  }

  // 3. Stale checkouts
  const staleCutoff = new Date(now.getTime() - STALE_PAYMENT_HOURS * 3_600_000).toISOString()
  const { data: stale, error: staleError } = await admin
    .from('payments')
    .select('id, provider, status, provider_state, provider_create_time_ms')
    .in('status', ['pending', 'processing'])
    .lt('created_at', staleCutoff)
    .order('created_at', { ascending: true })
    .limit(BATCH)
  if (staleError) throw staleError
  for (const p of stale ?? []) {
    try {
      if (p.provider === 'payme' && p.provider_state === 1) {
        const created = Number(p.provider_create_time_ms ?? 0)
        if (now.getTime() - created <= PAYME_TIMEOUT_MS) continue // still inside Payme's 12-hour window
        await cancelPendingPayment(p.id, 'Payme transaction timed out (12 hours)')
        await admin
          .from('payments')
          .update({ provider_state: -1, provider_cancel_time_ms: now.getTime(), provider_cancel_reason: 4 })
          .eq('id', p.id)
          .eq('provider_state', 1)
          .eq('status', 'canceled')
      } else {
        await cancelPendingPayment(p.id, `Checkout not completed within ${STALE_PAYMENT_HOURS} hours`)
      }
      result.stalePaymentsCanceled += 1
    } catch (err) {
      result.errors += 1
      console.error('[cron] could not cancel stale payment', p.id, err)
    }
  }

  return result
}
