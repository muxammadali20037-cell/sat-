import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/env'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/admin', '/api', '/auth', '/account-suspended', '/reset-password', '/verify-email'],
    },
    sitemap: siteUrl('/sitemap.xml'),
  }
}
