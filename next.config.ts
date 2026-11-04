import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV !== 'production'
const supabaseUrl = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null
  } catch {
    return null
  }
})()
// Origin keeps the real scheme (https in production, http for a local Supabase stack).
const supabaseOrigin = supabaseUrl ? supabaseUrl.origin : ''
const supabaseWs = supabaseUrl ? supabaseOrigin.replace(/^http/, 'ws') : ''
const videoHost = process.env.BUNNY_STREAM_CDN_HOST ?? ''
// LiveKit signalling (wss) and its HTTP validation endpoint, only when live lessons are configured.
const livekit = (() => {
  try {
    if (!process.env.LIVEKIT_URL) return ''
    const u = new URL(process.env.LIVEKIT_URL)
    const http = u.protocol === 'ws:' ? 'http:' : 'https:'
    return ` ${u.protocol}//${u.host} ${http}//${u.host}`
  } catch {
    return ''
  }
})()
// Desmos graphing calculator script + assets, only when a key is configured.
const desmos = process.env.NEXT_PUBLIC_DESMOS_API_KEY ? ' https://www.desmos.com' : ''

// Content Security Policy. Next.js hydration requires inline scripts without a nonce pipeline,
// so script-src keeps 'unsafe-inline'; everything else is locked to known origins.
const csp = [
  "default-src 'self'",
  // telegram.org: the Telegram Mini App script, loaded only when the site runs inside Telegram.
  `script-src 'self' 'unsafe-inline' https://telegram.org${isDev ? " 'unsafe-eval'" : ''}${process.env.STRIPE_SECRET_KEY ? ' https://js.stripe.com' : ''}${desmos}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ''}${desmos}`,
  `font-src 'self' data:${desmos}`,
  `media-src 'self' blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ''}${videoHost ? ` https://${videoHost}` : ''}`,
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin} ${supabaseWs}` : ''}${videoHost ? ` https://${videoHost}` : ''}${desmos}${livekit}`,
  "worker-src 'self' blob:", // hls.js transmuxing worker
  // Telegram Web shows Mini Apps in a frame; no other site may frame these pages.
  "frame-ancestors 'self' https://web.telegram.org",
  "form-action 'self' https://checkout.paycom.uz https://checkout.test.paycom.uz https://my.click.uz https://checkout.stripe.com",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // No X-Frame-Options: it cannot allow a single origin; CSP frame-ancestors above is the control.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
]

const nextConfig: NextConfig = {
  // Decision D1 (docs/DEVELOPMENT_ROADMAP.md): Cache Components off — nearly every route is per-student.
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  images: {
    remotePatterns: supabaseUrl
      ? [{ protocol: supabaseUrl.protocol === 'http:' ? 'http' : 'https', hostname: supabaseUrl.hostname }]
      : [],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Live lessons are the only pages that may use the camera, microphone and screen sharing.
      { source: '/live/:path*', headers: [{ key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()' }] },
    ]
  },
}

export default nextConfig
