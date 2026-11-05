import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { isSupabaseConfigured } from '@/lib/env'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getPublicLocale } from '@/lib/i18n/server'
import { postAuthRedirect } from '@/features/auth/errors'
import { oauthProviderSchema } from '@/features/auth/providers'
import { rememberAuthMethod } from '@/features/auth/last-method'

/**
 * OAuth (Google, Apple) return URL: exchanges the PKCE code for a session, then continues to `next`.
 * A brand-new account gets the language the person was using on the site (the provider sends none).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const providerError = searchParams.get('error')

  if (providerError === 'access_denied' || searchParams.get('error_code') === 'access_denied') redirect('/login?error=oauth_cancelled')
  if (!isSupabaseConfigured || !code || providerError) {
    if (providerError) console.warn('[auth] OAuth provider returned an error', { error: providerError, code: searchParams.get('error_code') })
    redirect('/login?error=oauth_failed')
  }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    console.error('[auth] exchangeCodeForSession failed', { code: error?.code, status: error?.status })
    redirect('/login?error=oauth_failed')
  }

  const via = oauthProviderSchema.safeParse(searchParams.get('via'))
  if (via.success) await rememberAuthMethod(via.data)

  // Only an account that has not finished onboarding yet (i.e. was just created) gets the UI language.
  const locale = await getPublicLocale()
  const { error: localeError } = await createAdminSupabase()
    .from('profiles')
    .update({ locale })
    .eq('id', data.user.id)
    .is('onboarding_completed_at', null)
    .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
  if (localeError) console.warn('[auth] could not set the new account language', { code: localeError.code })

  // New accounts have no onboarding yet; the student app layout sends them there.
  redirect(postAuthRedirect(searchParams.get('next'), '/dashboard'))
}
