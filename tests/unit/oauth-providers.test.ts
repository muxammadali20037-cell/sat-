import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { parseAuthSettings, oauthProviderSchema } = await import('@/features/auth/providers')

describe('social sign-in providers', () => {
  it('shows a provider only when Supabase reports it enabled', () => {
    expect(parseAuthSettings({ external: { google: true, apple: false, email: true } })).toEqual({ google: true, apple: false })
    expect(parseAuthSettings({ external: { google: true, apple: true } })).toEqual({ google: true, apple: true })
  })
  it('anything unexpected means "not available"', () => {
    for (const body of [null, {}, { external: null }, { external: { google: 'true', apple: 1 } }, 'oops'])
      expect(parseAuthSettings(body)).toEqual({ google: false, apple: false })
  })
  it('only google and apple can be requested', () => {
    expect(oauthProviderSchema.safeParse('google').success).toBe(true)
    expect(oauthProviderSchema.safeParse('apple').success).toBe(true)
    for (const p of ['github', 'GOOGLE', '', null, 'email']) expect(oauthProviderSchema.safeParse(p).success).toBe(false)
  })
})
