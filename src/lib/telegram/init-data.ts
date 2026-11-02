import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Telegram Mini App launch data (`Telegram.WebApp.initData`) validation.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 *   secret_key       = HMAC_SHA256(key = "WebAppData", message = bot_token)
 *   data_check_string = every received field except `hash`, sorted by key, as "key=value", joined by "\n"
 *   valid             = hex(HMAC_SHA256(key = secret_key, message = data_check_string)) == hash
 *
 * Only `hash` is excluded: newer clients also send `signature` (for third-party Ed25519 validation),
 * and it is part of the data-check-string. Never trust `initDataUnsafe` — only fields validated here.
 */

export type TelegramUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
  allows_write_to_pm?: boolean
  photo_url?: string
}

export type ValidInitData = {
  user: TelegramUser
  authDate: Date
  startParam: string | null
  queryId: string | null
}

export type InitDataFailure = 'missing' | 'malformed' | 'bad_hash' | 'expired' | 'no_user'

export type InitDataResult = { ok: true; data: ValidInitData } | { ok: false; reason: InitDataFailure }

/** Launch data older than this is refused (a fresh value is generated every time the app opens). */
export const INIT_DATA_MAX_AGE_SECONDS = 60 * 60
/** Tolerated clock difference for auth_date slightly in the future. */
const FUTURE_SKEW_SECONDS = 60
const MAX_LENGTH = 8192

export function dataCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

export function initDataHash(params: URLSearchParams, botToken: string): string {
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  return createHmac('sha256', secret).update(dataCheckString(params)).digest('hex')
}

export function validateInitData(
  raw: string | null | undefined,
  botToken: string,
  options: { maxAgeSeconds?: number; now?: number } = {},
): InitDataResult {
  if (!raw || !raw.trim()) return { ok: false, reason: 'missing' }
  if (raw.length > MAX_LENGTH || !botToken) return { ok: false, reason: 'malformed' }

  let params: URLSearchParams
  try {
    params = new URLSearchParams(raw)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  const hash = params.get('hash')
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: 'malformed' }
  if (params.getAll('hash').length !== 1) return { ok: false, reason: 'malformed' }

  const expected = Buffer.from(initDataHash(params, botToken), 'hex')
  const given = Buffer.from(hash, 'hex')
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'bad_hash' }

  const authDateSeconds = Number(params.get('auth_date'))
  if (!Number.isInteger(authDateSeconds) || authDateSeconds <= 0) return { ok: false, reason: 'malformed' }
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000)
  const maxAge = options.maxAgeSeconds ?? INIT_DATA_MAX_AGE_SECONDS
  if (nowSeconds - authDateSeconds > maxAge || authDateSeconds - nowSeconds > FUTURE_SKEW_SECONDS) {
    return { ok: false, reason: 'expired' }
  }

  let user: TelegramUser
  try {
    user = JSON.parse(params.get('user') ?? '') as TelegramUser
  } catch {
    return { ok: false, reason: 'no_user' }
  }
  if (!user || typeof user !== 'object' || !Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.first_name !== 'string') {
    return { ok: false, reason: 'no_user' }
  }

  return {
    ok: true,
    data: {
      user,
      authDate: new Date(authDateSeconds * 1000),
      startParam: params.get('start_param'),
      queryId: params.get('query_id'),
    },
  }
}

/** Display name from Telegram profile fields (first + last), trimmed to the profile limit. */
export function telegramDisplayName(user: TelegramUser): string {
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim().slice(0, 120)
}
