/**
 * Telegram Mini App initData validation. The fixed vector was computed independently with Python's
 * hmac module (not with the code under test), following core.telegram.org/bots/webapps.
 */
import { describe, expect, it } from 'vitest'
import { dataCheckString, initDataHash, telegramDisplayName, validateInitData } from '@/lib/telegram/init-data'

const TOKEN = '1234567890:AAH-test_token_for_unit_tests_only'
const AUTH_DATE = 1793640000
const NOW = AUTH_DATE * 1000 + 5 * 60 * 1000 // five minutes after launch
const RAW =
  'auth_date=1793640000&query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A279058397%2C%22first_name%22%3A%22Muhammadali%22%2C%22last_name%22%3A%22Ikromov%22%2C%22username%22%3A%22mali_test%22%2C%22language_code%22%3A%22uz%22%2C%22allows_write_to_pm%22%3Atrue%7D&signature=ZmFrZS1zaWduYXR1cmU&start_param=guides&hash=296ffb12d4eff82d5d2ae4e75a1abce327305fdde16d1b7a5404cdfd4b34250f'

describe('validateInitData', () => {
  it('accepts the independently computed vector (signature is part of the data-check-string)', () => {
    const res = validateInitData(RAW, TOKEN, { now: NOW })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.user.id).toBe(279058397)
    expect(res.data.user.username).toBe('mali_test')
    expect(res.data.startParam).toBe('guides')
    expect(res.data.authDate.toISOString()).toBe(new Date(AUTH_DATE * 1000).toISOString())
    expect(telegramDisplayName(res.data.user)).toBe('Muhammadali Ikromov')
  })

  it('rejects a wrong bot token', () => {
    expect(validateInitData(RAW, '1234567890:another-token', { now: NOW })).toEqual({ ok: false, reason: 'bad_hash' })
  })

  it('rejects any tampered field', () => {
    const tampered = RAW.replace('279058397', '279058398')
    expect(validateInitData(tampered, TOKEN, { now: NOW })).toEqual({ ok: false, reason: 'bad_hash' })
    const extra = `${RAW}&is_admin=true`
    expect(validateInitData(extra, TOKEN, { now: NOW })).toEqual({ ok: false, reason: 'bad_hash' })
  })

  it('rejects old launch data and data from the future', () => {
    expect(validateInitData(RAW, TOKEN, { now: AUTH_DATE * 1000 + 2 * 3600 * 1000 })).toEqual({ ok: false, reason: 'expired' })
    expect(validateInitData(RAW, TOKEN, { now: AUTH_DATE * 1000 - 5 * 60 * 1000 })).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects missing, malformed and duplicated hashes', () => {
    expect(validateInitData('', TOKEN)).toEqual({ ok: false, reason: 'missing' })
    expect(validateInitData('auth_date=1&user=%7B%7D', TOKEN)).toEqual({ ok: false, reason: 'malformed' })
    expect(validateInitData(`${RAW}&hash=${'0'.repeat(64)}`, TOKEN, { now: NOW })).toEqual({ ok: false, reason: 'malformed' })
    expect(validateInitData('x'.repeat(9000), TOKEN)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('requires a user with a numeric id, even when the hash is valid', () => {
    const params = new URLSearchParams({ auth_date: String(AUTH_DATE), query_id: 'q', user: JSON.stringify({ first_name: 'No id' }) })
    params.set('hash', initDataHash(params, TOKEN))
    expect(validateInitData(params.toString(), TOKEN, { now: NOW })).toEqual({ ok: false, reason: 'no_user' })
  })

  it('builds the data-check-string sorted by key, without hash', () => {
    const params = new URLSearchParams('b=2&hash=x&a=1&c=3')
    expect(dataCheckString(params)).toBe('a=1\nb=2\nc=3')
  })
})
