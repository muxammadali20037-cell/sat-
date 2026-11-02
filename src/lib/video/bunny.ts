import { createHmac } from 'node:crypto'

/**
 * Bunny CDN **Advanced Token Authentication** (HMAC-SHA256, "HS256-" tokens), used to sign
 * Bunny Stream HLS playback URLs. Token authentication is enabled on the Stream library's pull
 * zone; the key is that pull zone's "URL Token Authentication Key".
 *
 * Source of truth (read 2026-11-02):
 *   https://bunny.net/docs/cdn/security/token-authentication/advanced
 *
 *   token = "HS256-" + flags + Base64URL(HMAC-SHA256(security_key, signature_path + expires + user_ip + signing_data))
 *
 *   - security_key is the HMAC key (not part of the message)
 *   - signature_path is the URL path, or the `token_path` override if set
 *   - user_ip is optional and omitted entirely when not set (we never IP-lock: students switch
 *     between mobile data and Wi-Fi, and IPv6 is disabled on token-authenticated zones)
 *   - signing_data is the alphabetically-sorted parameters joined as `key=value` pairs separated
 *     by `&`, excluding `token` and `expires` (so `token_path` itself is signed when present;
 *     values are signed raw and URL-encoded only in the URL)
 *   - flags is `1-` when an IP was signed, empty otherwise
 *   - Base64URL: base64, then `+` → `-`, `/` → `_`, strip `=` padding
 *
 * HLS needs a *directory* token so the player's segment requests are authorized too. The docs'
 * path-based form puts the token in the first path segment, which relative segment URLs in the
 * playlist inherit (this also works with Safari's native HLS, unlike a query-string token):
 *   https://myzone.b-cdn.net/bcdn_token=HS256-…&expires=1598024587&token_path=%2Fvideos%2F/videos/playlist.m3u8
 *
 * docs/SYSTEM_ARCHITECTURE.md §7 documents this scheme.
 */

export type BunnySignInput = {
  securityKey: string
  /** Absolute URL path of the signed resource, e.g. `/<videoId>/playlist.m3u8`. */
  path: string
  /** UNIX timestamp in seconds. */
  expires: number
  /** Directory prefix the token grants access to, e.g. `/<videoId>/`. */
  tokenPath?: string
  /** Extra signed parameters (e.g. `limit`, `token_countries`). */
  params?: Record<string, string>
}

export function base64Url(bytes: Buffer): string {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/** Alphabetically sorted `key=value` pairs joined by `&` (token and expires excluded). */
export function bunnySigningData(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => k !== 'token' && k !== 'expires')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
}

/** Signed parameters for a request (`token_path` included when set). */
function signedParams(input: BunnySignInput): Record<string, string> {
  const params: Record<string, string> = { ...(input.params ?? {}) }
  if (input.tokenPath) params.token_path = input.tokenPath
  return params
}

export function signBunnyToken(input: BunnySignInput): string {
  if (!input.securityKey) throw new Error('Bunny security key is required')
  if (!Number.isInteger(input.expires) || input.expires <= 0) throw new Error('expires must be a UNIX timestamp in seconds')
  const signaturePath = input.tokenPath ?? input.path
  const message = `${signaturePath}${input.expires}${bunnySigningData(signedParams(input))}`
  const digest = createHmac('sha256', input.securityKey).update(message, 'utf8').digest()
  return `HS256-${base64Url(digest)}`
}

/** Query-string form: `https://host/path?token=…&expires=…[&token_path=…]` */
export function signBunnyQueryUrl(host: string, input: BunnySignInput): string {
  const token = signBunnyToken(input)
  const extra = Object.entries(signedParams(input))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
    .join('')
  return `https://${normalizeBunnyHost(host)}${input.path}?token=${token}&expires=${input.expires}${extra}`
}

/** Directory (path-based) form: `https://host/bcdn_token=…&expires=…&token_path=…/path` */
export function signBunnyDirectoryUrl(host: string, input: BunnySignInput & { tokenPath: string }): string {
  const token = signBunnyToken(input)
  const extra = Object.entries(signedParams(input))
    .filter(([k]) => k !== 'token_path')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
    .join('')
  return `https://${normalizeBunnyHost(host)}/bcdn_token=${token}&expires=${input.expires}${extra}&token_path=${encodeURIComponent(input.tokenPath)}${input.path}`
}

/** Accepts `vz-xxxx.b-cdn.net`, `https://vz-xxxx.b-cdn.net/` → `vz-xxxx.b-cdn.net`. */
export function normalizeBunnyHost(host: string): string {
  return host.trim().replace(/^https?:\/\//i, '').replace(/\/+$/g, '')
}

/** Bunny Stream video ids are GUIDs; reject anything that could change the signed path. */
export const BUNNY_VIDEO_ID = /^[A-Za-z0-9-]{8,64}$/

/**
 * Signed HLS playlist URL for a Bunny Stream video: `/{videoId}/playlist.m3u8`, with a directory
 * token for `/{videoId}/` so the renditions and segments under it are authorized as well.
 */
export function bunnyStreamPlaylistUrl(options: { host: string; securityKey: string; videoId: string; expires: number }): string {
  if (!BUNNY_VIDEO_ID.test(options.videoId)) throw new Error('Invalid Bunny Stream video id')
  const dir = `/${options.videoId}/`
  return signBunnyDirectoryUrl(options.host, {
    securityKey: options.securityKey,
    path: `${dir}playlist.m3u8`,
    tokenPath: dir,
    expires: options.expires,
  })
}
