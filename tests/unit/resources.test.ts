/**
 * Resource Hub: links must be https, on the chosen provider's domain, never an IP or internal
 * host; the link checker refuses private addresses (SSRF); default credit lines follow each
 * provider's published terms.
 */
import { describe, expect, it } from 'vitest'
import { hostMatches, linkWorks, PROVIDER_DEFAULTS, ResourceInputSchema, validateResourceUrl } from '@/features/resources/rules'
import { checkLink, isPublicAddress } from '@/features/resources/link-check'

describe('resource URL rules', () => {
  it('accepts provider links, including subdomains', () => {
    expect(validateResourceUrl('https://satsuite.collegeboard.org/sat', 'college_board', null)).toBeNull()
    expect(validateResourceUrl('https://www.khanacademy.org/test-prep', 'khan_academy', null)).toBeNull()
    expect(validateResourceUrl('https://youtu.be/abc', 'youtube', null)).toBeNull()
    expect(validateResourceUrl('https://example.edu/notes', 'other', null)).toBeNull()
    expect(validateResourceUrl('https://sat.example.uz/guides', 'sat_master', 'sat.example.uz')).toBeNull()
  })
  it('rejects look-alike domains, http, IPs, credentials and internal hosts', () => {
    expect(validateResourceUrl('https://collegeboard.org.evil.com/x', 'college_board', null)).toBe('host_not_allowed')
    expect(validateResourceUrl('https://notkhanacademy.org/', 'khan_academy', null)).toBe('host_not_allowed')
    expect(validateResourceUrl('http://www.desmos.com/calculator', 'desmos', null)).toBe('https_only')
    expect(validateResourceUrl('https://10.0.0.1/admin', 'other', null)).toBe('ip_literal')
    expect(validateResourceUrl('https://[::1]/', 'other', null)).toBe('ip_literal')
    expect(validateResourceUrl('https://user:pw@desmos.com/', 'desmos', null)).toBe('invalid_url')
    expect(validateResourceUrl('https://localhost/', 'other', null)).toBe('host_not_allowed')
    expect(validateResourceUrl('https://metadata.internal/', 'other', null)).toBe('host_not_allowed')
    expect(validateResourceUrl('javascript:alert(1)', 'other', null)).toBe('https_only')
    expect(validateResourceUrl('https://sat.example.uz/x', 'sat_master', null)).toBe('host_not_allowed')
    expect(hostMatches('WWW.Desmos.com.', 'desmos.com')).toBe(true)
  })
  it('only 2xx/3xx count as a working link', () => {
    expect([200, 301, 399, 404, 500, null].map(linkWorks)).toEqual([true, true, true, false, false, false])
  })
  it('defaults carry the credit lines the providers ask for', () => {
    expect(PROVIDER_DEFAULTS.khan_academy.attribution).toBe('All Khan Academy content is available for free at www.khanacademy.org')
    expect(PROVIDER_DEFAULTS.college_board.usageTerms).toMatch(/not affiliated/)
  })
  it('input schema bounds every field', () => {
    const ok = { provider: 'desmos', providerName: 'Desmos', kind: 'tool', title: 'Graphing calculator', url: 'https://www.desmos.com/calculator', language: 'en', usageTerms: 'Link only.', attribution: 'Desmos' }
    expect(ResourceInputSchema.safeParse(ok).success).toBe(true)
    expect(ResourceInputSchema.safeParse({ ...ok, provider: 'wikipedia' }).success).toBe(false)
    expect(ResourceInputSchema.safeParse({ ...ok, attribution: '' }).success).toBe(false)
    expect(ResourceInputSchema.safeParse({ ...ok, title: 'x'.repeat(161) }).success).toBe(false)
  })
})

describe('link checker SSRF guard', () => {
  it('classifies addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', 'not-an-ip']) {
      expect(isPublicAddress(ip), ip).toBe(false)
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700:4700::1111']) expect(isPublicAddress(ip), ip).toBe(true)
  })
  it('refuses hosts that resolve to private addresses without making a request', async () => {
    expect((await checkLink('https://localhost/')).error).toBe('unsafe_host')
    expect((await checkLink('http://example.com/')).error).toBe('unsafe_host')
  })
})
