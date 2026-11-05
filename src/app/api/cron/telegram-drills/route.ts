import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env'
import { isTelegramConfigured } from '@/lib/telegram/bot'
import { runDailyDrills } from '@/features/telegram/drills'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Daily Telegram drills (vercel.json: 14:00 UTC = 19:00 in Tashkent; Vercel sends
 * `Authorization: Bearer $CRON_SECRET`). Sends today's drill once to each student who turned it on.
 */
export async function GET(request: Request) {
  const secret = serverEnv().CRON_SECRET
  const a = Buffer.from(request.headers.get('authorization') ?? '')
  const b = Buffer.from(`Bearer ${secret ?? ''}`)
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Missing or invalid cron secret.' } }, { status: 401 })
  }
  if (!isTelegramConfigured()) return NextResponse.json({ data: { status: 'NOT_CONFIGURED' } })
  try {
    return NextResponse.json({ data: await runDailyDrills() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[cron] telegram drills failed', err)
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Drills failed; see server logs.' } }, { status: 500 })
  }
}
