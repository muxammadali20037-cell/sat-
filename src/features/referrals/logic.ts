/**
 * Invite-a-friend rules (pure, unit-tested). The server applies them; nothing here trusts the browser.
 */

export const REFERRAL_COOKIE = 'sm_ref'
export const REFERRAL_COOKIE_DAYS = 30
export const REFERRAL_CODE_RE = /^[a-z0-9]{8}$/
/** Letters and digits that cannot be confused when typed (no 0/o, 1/l/i). */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
/** An invite can only be attached to an account this young (it must be a NEW friend). */
export const CLAIM_MAX_ACCOUNT_AGE_DAYS = 7
/** A diagnostic with fewer scored answers than this does not qualify the invite. */
export const MIN_DIAGNOSTIC_ANSWERS = 10
export const MAX_REWARD_DAYS = 366

export function newReferralCode(randomBytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[randomBytes[i % randomBytes.length] % CODE_ALPHABET.length]
  return out
}

export function normalizeCode(raw: string | null | undefined): string | null {
  const c = (raw ?? '').trim().toLowerCase()
  return REFERRAL_CODE_RE.test(c) ? c : null
}

export type ClaimCheck =
  | { ok: true }
  | { ok: false; reason: 'self' | 'account_too_old' | 'already_referred' | 'unknown_code' }

export function canClaim(input: {
  referrerId: string | null
  referredId: string
  referredCreatedAt: string
  alreadyReferred: boolean
  now: Date
}): ClaimCheck {
  if (!input.referrerId) return { ok: false, reason: 'unknown_code' }
  if (input.referrerId === input.referredId) return { ok: false, reason: 'self' }
  if (input.alreadyReferred) return { ok: false, reason: 'already_referred' }
  const ageMs = input.now.getTime() - new Date(input.referredCreatedAt).getTime()
  if (!(ageMs <= CLAIM_MAX_ACCOUNT_AGE_DAYS * 86_400_000)) return { ok: false, reason: 'account_too_old' }
  return { ok: true }
}

export type RewardSettings = { referrerDays: number; friendDays: number; monthlyCap: number }

/** Reads the admin settings defensively: anything that is not a sane whole number means 0 / off. */
export function rewardSettings(values: Record<string, unknown>): RewardSettings {
  const days = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_REWARD_DAYS ? v : 0)
  const cap = values['referrals.monthly_cap']
  return {
    referrerDays: days(values['referrals.referrer_days']),
    friendDays: days(values['referrals.friend_days']),
    monthlyCap: typeof cap === 'number' && Number.isInteger(cap) && cap >= 0 && cap <= 1000 ? cap : 0,
  }
}

export type RewardDecision =
  | { give: true; referrerDays: number; friendDays: number }
  | { give: false; reason: 'rewards_off' | 'monthly_cap' }

export function rewardDecision(settings: RewardSettings, rewardedThisMonth: number): RewardDecision {
  if (settings.referrerDays === 0 && settings.friendDays === 0) return { give: false, reason: 'rewards_off' }
  if (rewardedThisMonth >= settings.monthlyCap) return { give: false, reason: 'monthly_cap' }
  return { give: true, referrerDays: settings.referrerDays, friendDays: settings.friendDays }
}

export function monthStartUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/** Only a friend's first name is ever shown to the inviter. */
export function firstName(fullName: string | null | undefined): string | null {
  const f = (fullName ?? '').trim().split(/\s+/)[0]
  return f ? f.slice(0, 40) : null
}

export function inviteUrl(siteUrl: string, code: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/r/${code}`
}

export function telegramShareUrl(url: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
}
