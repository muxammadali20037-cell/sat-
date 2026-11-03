/**
 * Website sign-in helpers: Telegram bot sign-in (device label, shared phone numbers), SMS sign-in
 * (Uzbek phone parsing) and the Supabase Send SMS hook signature (vector computed independently
 * with Python's hmac module).
 */
import { describe, expect, it } from 'vitest'
import { clientHint, normalizePhone } from '@/features/telegram/login-shared'
import { formatUzPhone, normalizeUzPhone } from '@/features/auth/phone'
import { signWebhook, verifyWebhook } from '@/lib/sms/standard-webhooks'

describe('clientHint', () => {
  it('names browser and system', () => {
    expect(clientHint('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36')).toBe('Chrome · Windows')
    expect(clientHint('Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1')).toBe('Safari · iOS')
    expect(clientHint('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0 YaBrowser/26.1 Mobile Safari/537.36')).toBe('Yandex · Android')
    expect(clientHint('Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0 Safari/537.36 Edg/150.0')).toBe('Edge · macOS')
    expect(clientHint('')).toBe('')
  })
})

describe('phone numbers', () => {
  it('normalizes numbers shared in Telegram', () => {
    expect(normalizePhone('998901234567')).toBe('+998901234567')
    expect(normalizePhone('+1 (555) 010-9999')).toBe('+15550109999')
    expect(normalizePhone('12')).toBeNull()
  })
  it('accepts Uzbek numbers in common shapes for SMS sign-in', () => {
    for (const input of ['+998 90 123 45 67', '998901234567', '90 123-45-67', '(90) 1234567']) expect(normalizeUzPhone(input)).toBe('+998901234567')
    for (const input of ['+7 912 345 67 89', '12345', '+998 90 123 45 6', '']) expect(normalizeUzPhone(input)).toBeNull()
    expect(formatUzPhone('+998901234567')).toBe('+998 90 123 45 67')
  })
})

describe('Send SMS hook signature (Standard Webhooks)', () => {
  const secret = 'v1,whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'
  const id = 'msg_2KWPBgLlAfxdpx2AI54pPJ85f4W'
  const ts = 1793700000
  const body = '{"user":{"phone":"998901234567"},"sms":{"otp":"561166"}}'
  const now = ts * 1000 + 30_000

  it('matches the independently computed signature', () => {
    expect(signWebhook(secret, id, ts, body)).toBe('yu/FXKG49zzotWx4MIQ7tPqELYS4VPjrKz8ec2ekX3Y=')
  })
  it('accepts a valid signature (also among several)', () => {
    const signature = 'v1,yu/FXKG49zzotWx4MIQ7tPqELYS4VPjrKz8ec2ekX3Y='
    expect(verifyWebhook(secret, { id, timestamp: String(ts), signature }, body, now)).toBe(true)
    expect(verifyWebhook(secret, { id, timestamp: String(ts), signature: `v1,AAAA ${signature}` }, body, now)).toBe(true)
  })
  it('rejects tampering, other secrets, missing headers and old timestamps', () => {
    const signature = 'v1,yu/FXKG49zzotWx4MIQ7tPqELYS4VPjrKz8ec2ekX3Y='
    expect(verifyWebhook(secret, { id, timestamp: String(ts), signature }, body.replace('561166', '000000'), now)).toBe(false)
    expect(verifyWebhook('v1,whsec_' + Buffer.from('other').toString('base64'), { id, timestamp: String(ts), signature }, body, now)).toBe(false)
    expect(verifyWebhook(secret, { id: null, timestamp: String(ts), signature }, body, now)).toBe(false)
    expect(verifyWebhook(secret, { id, timestamp: String(ts), signature }, body, now + 10 * 60_000)).toBe(false)
  })
})
