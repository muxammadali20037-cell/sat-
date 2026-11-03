import { NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env'
import { verifyWebhook } from '@/lib/sms/standard-webhooks'
import { otpMessage, sendSms } from '@/lib/sms/eskiz'

/**
 * POST /api/webhooks/send-sms — Supabase Auth "Send SMS" hook. Supabase generates and checks the
 * one-time code; this endpoint only delivers it through Eskiz.uz. The request is signed with the
 * hook secret (Standard Webhooks); anything unsigned is refused. Errors use the hook error shape,
 * so Supabase reports a failed send to the student instead of a silent success.
 */
export async function POST(request: Request) {
  const secret = serverEnv().SEND_SMS_HOOK_SECRET
  if (!secret) return NextResponse.json({ error: { http_code: 503, message: 'SMS is not configured.' } }, { status: 503 })

  const body = await request.text()
  const ok = verifyWebhook(
    secret,
    { id: request.headers.get('webhook-id'), timestamp: request.headers.get('webhook-timestamp'), signature: request.headers.get('webhook-signature') },
    body,
  )
  if (!ok) return NextResponse.json({ error: { http_code: 401, message: 'Invalid signature.' } }, { status: 401 })

  let payload: { user?: { phone?: string }; sms?: { otp?: string } }
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: { http_code: 400, message: 'Invalid payload.' } }, { status: 400 })
  }
  const phone = payload.user?.phone ? `+${payload.user.phone.replace(/^\+/, '')}` : ''
  const otp = payload.sms?.otp ?? ''
  if (!/^\+998\d{9}$/.test(phone) || !/^\d{4,10}$/.test(otp)) {
    return NextResponse.json({ error: { http_code: 400, message: 'Only Uzbekistan numbers (+998) are supported.' } }, { status: 400 })
  }
  try {
    await sendSms(phone, otpMessage(otp))
  } catch (err) {
    console.error('[sms] send failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: { http_code: 502, message: 'The SMS could not be sent. Try again later.' } }, { status: 502 })
  }
  return NextResponse.json({})
}
