import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Standard Webhooks signature check (https://www.standardwebhooks.com), used by Supabase Auth hooks.
 *   secret:  "v1,whsec_<base64>" (as shown in the Supabase dashboard) or "whsec_<base64>"
 *   signed:  `${webhook-id}.${webhook-timestamp}.${raw body}`, HMAC-SHA256 with the decoded secret
 *   header:  webhook-signature = "v1,<base64 sig>" (several may be space-separated)
 * Timestamps more than 5 minutes off are refused (replay protection).
 */

const TOLERANCE_SECONDS = 5 * 60

export function secretKey(secret: string): Buffer {
  return Buffer.from(secret.replace(/^v1,/, '').replace(/^whsec_/, ''), 'base64')
}

export function signWebhook(secret: string, id: string, timestamp: number, body: string): string {
  return createHmac('sha256', secretKey(secret)).update(`${id}.${timestamp}.${body}`).digest('base64')
}

export function verifyWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now: number = Date.now(),
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false
  const ts = Number(headers.timestamp)
  if (!Number.isInteger(ts) || Math.abs(now / 1000 - ts) > TOLERANCE_SECONDS) return false
  const expected = Buffer.from(signWebhook(secret, headers.id, ts, body), 'base64')
  return headers.signature.split(' ').some((part) => {
    const [version, sig] = part.split(',', 2)
    if (version !== 'v1' || !sig) return false
    const given = Buffer.from(sig, 'base64')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}
