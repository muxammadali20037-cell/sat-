/**
 * Resource Hub rules (pure, client-safe, unit-tested): which hosts each provider may link to, the
 * default usage terms and credit lines (from each provider's published terms, checked 3 Nov 2026 —
 * see docs/COMPETITIVE_STRATEGY.md), and the input schema for staff edits.
 */
import { z } from 'zod'

export const PROVIDERS = ['sat_master', 'college_board', 'khan_academy', 'desmos', 'youtube', 'other'] as const
export type Provider = (typeof PROVIDERS)[number]
export const KINDS = ['lesson', 'video', 'practice', 'tool', 'official_info', 'article'] as const
export type ResourceKind = (typeof KINDS)[number]

/** Registrable domains per provider; subdomains are allowed. `null` = any public host. */
export const PROVIDER_HOSTS: Record<Provider, readonly string[] | null> = {
  sat_master: [], // filled with the site's own host at runtime
  college_board: ['collegeboard.org'],
  khan_academy: ['khanacademy.org'],
  desmos: ['desmos.com'],
  youtube: ['youtube.com', 'youtu.be'],
  other: null,
}

export const PROVIDER_DEFAULTS: Record<Provider, { name: string; usageTerms: string; attribution: string }> = {
  sat_master: { name: 'SAT MASTER', usageTerms: 'Original SAT MASTER material.', attribution: 'SAT MASTER' },
  college_board: {
    name: 'College Board',
    usageTerms: 'Link only. Content and trademarks belong to the College Board, which is not affiliated with SAT MASTER.',
    attribution: 'College Board',
  },
  khan_academy: {
    name: 'Khan Academy',
    usageTerms: 'Link only (CC BY-NC-SA content is not used inside SAT MASTER). Free on khanacademy.org; not affiliated with SAT MASTER.',
    attribution: 'All Khan Academy content is available for free at www.khanacademy.org',
  },
  desmos: { name: 'Desmos', usageTerms: 'Link only. A free tool by Desmos Studio, not affiliated with SAT MASTER.', attribution: 'Desmos' },
  youtube: { name: 'YouTube', usageTerms: 'Link only. The video belongs to its creator; we do not copy or embed it.', attribution: '' },
  other: { name: '', usageTerms: 'Link only.', attribution: '' },
}

/** True when `host` is `domain` or one of its subdomains. */
export function hostMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  return h === domain || h.endsWith(`.${domain}`)
}

/** Checks the URL shape and that it belongs to the chosen provider. Returns an error code or null. */
export function validateResourceUrl(raw: string, provider: Provider, siteHost: string | null): 'invalid_url' | 'https_only' | 'host_not_allowed' | 'ip_literal' | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return 'invalid_url'
  }
  if (url.protocol !== 'https:') return 'https_only'
  if (url.username || url.password || (url.port && url.port !== '443')) return 'invalid_url'
  const host = url.hostname.toLowerCase()
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[') || host.includes(':')) return 'ip_literal'
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return 'host_not_allowed'
  const allowed = provider === 'sat_master' ? (siteHost ? [siteHost] : []) : PROVIDER_HOSTS[provider]
  if (allowed !== null && !allowed.some((d) => hostMatches(host, d))) return 'host_not_allowed'
  return null
}

const id = z.guid()
export const ResourceInputSchema = z.object({
  id: id.optional(),
  provider: z.enum(PROVIDERS),
  providerName: z.string().trim().min(2).max(80),
  kind: z.enum(KINDS),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(600).default(''),
  url: z.string().trim().max(600),
  language: z.enum(['en', 'uz', 'ru']),
  subjectId: id.nullable().default(null),
  domainId: id.nullable().default(null),
  skillId: id.nullable().default(null),
  usageTerms: z.string().trim().min(3).max(300),
  attribution: z.string().trim().min(2).max(200),
  position: z.number().int().min(0).max(10_000).default(0),
})
export type ResourceInput = z.infer<typeof ResourceInputSchema>

export const ResourceStatusSchema = z.object({ id, status: z.enum(['draft', 'published', 'archived']) })

/** 2xx and 3xx answers count as a working link. */
export const linkWorks = (status: number | null | undefined) => typeof status === 'number' && status >= 200 && status <= 399
