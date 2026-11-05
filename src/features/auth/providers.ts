import 'server-only'
import { z } from 'zod'
import { isSupabaseConfigured, publicEnv } from '@/lib/env'

/**
 * Social sign-in providers this site offers. A button appears only when Supabase Auth reports the
 * provider as enabled (Dashboard → Authentication → Sign In / Providers), so a provider without
 * credentials is never shown. The answer is cached for 5 minutes; any error means "not available".
 */
export const OAUTH_PROVIDERS = ['google', 'apple'] as const
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]
export type OAuthAvailability = Record<OAuthProvider, boolean>

export const oauthProviderSchema = z.enum(OAUTH_PROVIDERS)

const settingsSchema = z.object({ external: z.record(z.string(), z.unknown()) })

/** Pure: which of our providers a Supabase `/auth/v1/settings` body enables. */
export function parseAuthSettings(body: unknown): OAuthAvailability {
  const parsed = settingsSchema.safeParse(body)
  const ext = parsed.success ? parsed.data.external : {}
  return { google: ext.google === true, apple: ext.apple === true }
}

const NONE: OAuthAvailability = { google: false, apple: false }

export async function oauthAvailability(): Promise<OAuthAvailability> {
  if (!isSupabaseConfigured) return NONE
  try {
    const res = await fetch(`${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return NONE
    return parseAuthSettings(await res.json())
  } catch (e) {
    console.warn('[auth] could not read auth settings', { message: (e as Error).message })
    return NONE
  }
}
