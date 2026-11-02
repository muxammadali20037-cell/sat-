import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env'
import { runRenewalMaintenance } from '@/features/subscriptions/cron'

export const dynamic = 'force-dynamic'

/**
 * Daily billing maintenance (vercel.json schedules it at 04:00 UTC; Vercel sends
 * `Authorization: Bearer $CRON_SECRET`). Renewal reminders (one per period), expiry after the
 * grace period, and cancellation of abandoned checkouts. Idempotent.
 */
export async function GET(request: Request) {
  const secret = serverEnv().CRON_SECRET
  const given = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret ?? ''}`
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Missing or invalid cron secret.' } }, { status: 401 })
  }
  try {
    const result = await runRenewalMaintenance()
    return NextResponse.json({ data: result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[cron] renewal maintenance failed', err)
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Maintenance failed; see server logs.' } }, { status: 500 })
  }
}
