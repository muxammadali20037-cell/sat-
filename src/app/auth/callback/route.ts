import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { isSupabaseConfigured } from '@/lib/env'
import { createServerSupabase } from '@/lib/supabase/server'
import { postAuthRedirect } from '@/features/auth/errors'

/** OAuth (Google) return URL: exchanges the PKCE code for a session, then continues to `next`. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')

  if (!isSupabaseConfigured || !code || searchParams.get('error')) {
    redirect('/login?error=oauth_failed')
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('[auth] exchangeCodeForSession failed', { code: error.code, status: error.status })
    redirect('/login?error=oauth_failed')
  }

  // New Google accounts have no onboarding yet; the student app layout sends them there.
  redirect(postAuthRedirect(searchParams.get('next'), '/dashboard'))
}
