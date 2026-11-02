import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/env'

/** Public, indexable routes only. Student, admin, API and auth pages are excluded. */
const PUBLIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }> = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/features', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/faq', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.2, changeFrequency: 'yearly' },
]

const LAST_CONTENT_UPDATE = new Date('2026-11-02T00:00:00Z')

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: siteUrl(route.path),
    lastModified: LAST_CONTENT_UPDATE,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
