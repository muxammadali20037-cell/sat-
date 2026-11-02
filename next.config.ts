import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV !== 'production'
const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : ''
  } catch {
    return ''
  }
})()
const videoHost = process.env.BUNNY_STREAM_CDN_HOST ?? ''

// Content Security Policy. Next.js hydration requires inline scripts without a nonce pipeline,
// so script-src keeps 'unsafe-inline'; everything else is locked to known origins.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}${process.env.STRIPE_SECRET_KEY ? ' https://js.stripe.com' : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${supabaseHost ? ` https://${supabaseHost}` : ''}`,
  "font-src 'self' data:",
  `media-src 'self' blob:${supabaseHost ? ` https://${supabaseHost}` : ''}${videoHost ? ` https://${videoHost}` : ''}`,
  `connect-src 'self'${supabaseHost ? ` https://${supabaseHost} wss://${supabaseHost}` : ''}${videoHost ? ` https://${videoHost}` : ''}`,
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.paycom.uz https://checkout.test.paycom.uz https://my.click.uz https://checkout.stripe.com",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
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
    remotePatterns: supabaseHost ? [{ protocol: 'https', hostname: supabaseHost }] : [],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
