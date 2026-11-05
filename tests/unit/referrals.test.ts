import { describe, expect, it } from 'vitest'
import { canClaim, firstName, inviteUrl, monthStartUtc, newReferralCode, normalizeCode, REFERRAL_CODE_RE, rewardDecision, rewardSettings, telegramShareUrl } from '@/features/referrals/logic'

const now = new Date('2026-11-05T12:00:00Z')

describe('invite codes', () => {
  it('new codes match the stored format and avoid look-alike characters', () => {
    for (let i = 0; i < 50; i++) {
      const c = newReferralCode(crypto.getRandomValues(new Uint8Array(8)))
      expect(c).toMatch(REFERRAL_CODE_RE)
      expect(c).not.toMatch(/[01ilo]/)
    }
  })
  it('normalizes case and rejects anything else', () => {
    expect(normalizeCode(' AbCd2345 ')).toBe('abcd2345')
    expect(normalizeCode('abc')).toBeNull()
    expect(normalizeCode("abcd234'; drop")).toBeNull()
    expect(normalizeCode(undefined)).toBeNull()
  })
})

describe('claiming an invite', () => {
  const ok = { referrerId: 'a', referredId: 'b', referredCreatedAt: '2026-11-04T12:00:00Z', alreadyReferred: false, now }
  it('accepts a new account', () => expect(canClaim(ok)).toEqual({ ok: true }))
  it('refuses unknown codes, self-invites, second inviters and old accounts', () => {
    expect(canClaim({ ...ok, referrerId: null })).toEqual({ ok: false, reason: 'unknown_code' })
    expect(canClaim({ ...ok, referredId: 'a' })).toEqual({ ok: false, reason: 'self' })
    expect(canClaim({ ...ok, alreadyReferred: true })).toEqual({ ok: false, reason: 'already_referred' })
    expect(canClaim({ ...ok, referredCreatedAt: '2026-10-20T12:00:00Z' })).toEqual({ ok: false, reason: 'account_too_old' })
    expect(canClaim({ ...ok, referredCreatedAt: 'not a date' })).toEqual({ ok: false, reason: 'account_too_old' })
  })
})

describe('rewards', () => {
  it('settings: anything but a sane whole number means off', () => {
    expect(rewardSettings({})).toEqual({ referrerDays: 0, friendDays: 0, monthlyCap: 0 })
    expect(rewardSettings({ 'referrals.referrer_days': 7, 'referrals.friend_days': 3, 'referrals.monthly_cap': 10 })).toEqual({ referrerDays: 7, friendDays: 3, monthlyCap: 10 })
    expect(rewardSettings({ 'referrals.referrer_days': -1, 'referrals.friend_days': 2.5, 'referrals.monthly_cap': '10' })).toEqual({ referrerDays: 0, friendDays: 0, monthlyCap: 0 })
    expect(rewardSettings({ 'referrals.referrer_days': 9999 }).referrerDays).toBe(0)
  })
  it('no reward until an admin sets days; the monthly cap is respected', () => {
    expect(rewardDecision({ referrerDays: 0, friendDays: 0, monthlyCap: 10 }, 0)).toEqual({ give: false, reason: 'rewards_off' })
    expect(rewardDecision({ referrerDays: 7, friendDays: 3, monthlyCap: 10 }, 9)).toEqual({ give: true, referrerDays: 7, friendDays: 3 })
    expect(rewardDecision({ referrerDays: 7, friendDays: 3, monthlyCap: 10 }, 10)).toEqual({ give: false, reason: 'monthly_cap' })
    expect(rewardDecision({ referrerDays: 7, friendDays: 0, monthlyCap: 0 }, 0)).toEqual({ give: false, reason: 'monthly_cap' })
  })
  it('month start is UTC', () => expect(monthStartUtc(now)).toBe('2026-11-01T00:00:00.000Z'))
})

describe('display helpers', () => {
  it('shows only a first name', () => {
    expect(firstName('Aziza Karimova')).toBe('Aziza')
    expect(firstName('  ')).toBeNull()
    expect(firstName(null)).toBeNull()
  })
  it('builds links', () => {
    expect(inviteUrl('https://x.uz/', 'abcd2345')).toBe('https://x.uz/r/abcd2345')
    expect(telegramShareUrl('https://x.uz/r/abcd2345', 'Salom & qo‘shil')).toBe('https://t.me/share/url?url=https%3A%2F%2Fx.uz%2Fr%2Fabcd2345&text=Salom%20%26%20qo%E2%80%98shil')
  })
})
