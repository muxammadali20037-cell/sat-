import 'server-only'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Server-side link check for staff-entered resource URLs. Guarded against SSRF: HTTPS only, the
 * host must resolve exclusively to public addresses, every redirect hop is re-checked, and the
 * request has a short timeout and reads no body.
 */

const TIMEOUT_MS = 6000
const MAX_REDIRECTS = 3

/** Private, loopback, link-local, CGNAT, multicast and reserved ranges (IPv4 and IPv6). */
export function isPublicAddress(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number]
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    if (a === 192 && b === 0) return false
    if (a === 198 && (b === 18 || b === 19)) return false
    return true
  }
  if (v === 6) {
    const x = ip.toLowerCase()
    if (x === '::' || x === '::1') return false
    if (x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb')) return false // link-local
    if (x.startsWith('fc') || x.startsWith('fd')) return false // unique local
    if (x.startsWith('ff')) return false // multicast
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x)
    if (mapped) return isPublicAddress(mapped[1]!)
    return true
  }
  return false
}

export type LinkCheck = { status: number | null; finalUrl: string | null; error: 'unsafe_host' | 'timeout' | 'network' | 'too_many_redirects' | null }

async function hostIsPublic(host: string): Promise<boolean> {
  try {
    const addrs = await lookup(host, { all: true, verbatim: true })
    return addrs.length > 0 && addrs.every((a) => isPublicAddress(a.address))
  } catch {
    return false
  }
}

/** A YouTube video id from a watch, short or youtu.be link; null for anything else. */
export function youtubeVideoId(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, '')
  const id = host === 'youtu.be' ? url.pathname.slice(1) : host === 'youtube.com' ? (url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1]) : null
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
}

/**
 * What to request to check a link. A YouTube watch page answers 200 even for a removed or private
 * video, so YouTube links are checked through oEmbed, which answers 200 only for a public video.
 */
export function linkCheckTarget(raw: string): string {
  const id = youtubeVideoId(raw)
  return id ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}` : raw
}

export async function checkLink(raw: string): Promise<LinkCheck> {
  let current = linkCheckTarget(raw)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let url: URL
    try {
      url = new URL(current)
    } catch {
      return { status: null, finalUrl: null, error: 'network' }
    }
    if (url.protocol !== 'https:' || !(await hostIsPublic(url.hostname))) return { status: null, finalUrl: url.toString(), error: 'unsafe_host' }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      // GET (some sites reject HEAD); the body is never read and the connection is cancelled.
      const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': 'SAT-MASTER-link-check/1.0' } })
      void res.body?.cancel().catch(() => undefined)
      const location = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && location) {
        current = new URL(location, url).toString()
        continue
      }
      return { status: res.status, finalUrl: url.toString(), error: null }
    } catch (err) {
      return { status: null, finalUrl: url.toString(), error: (err as Error).name === 'AbortError' ? 'timeout' : 'network' }
    } finally {
      clearTimeout(timer)
    }
  }
  return { status: null, finalUrl: current, error: 'too_many_redirects' }
}
