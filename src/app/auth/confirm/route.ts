import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { isSupabaseConfigured } from '@/lib/env'
import { createServerSupabase } from '@/lib/supabase/server'
import { isConfirmType, postAuthRedirect, RECOVERY_COOKIE, RECOVERY_WINDOW_SECONDS } from '@/features/auth/errors'

/**
 * Email link landing (sign-up confirmation, password recovery, email change). Two link styles work:
 * - custom templates: `/auth/confirm?token_hash=…&type=…&next=…` (docs/AUTH_SETUP.md);
 * - Supabase's default templates: Supabase verifies the link, then redirects here with `?code=…`
 *   (PKCE). The code can only be exchanged in the browser that started the flow; elsewhere the
 *   email is still confirmed, so the student is sent to log in with a clear message.
 * Errors that Supabase reports on the redirect (`error`, `error_code`) end at the log-in page.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const code = searchParams.get('code')
  const next = searchParams.get('next')
  const isRecovery = type === 'recovery' || next === '/reset-password'

  if (!isSupabaseConfigured || searchParams.get('error') || searchParams.get('error_code')) {
    redirect('/login?error=link_expired')
  }

  const supabase = await createServerSupabase()
  let userId: string | null = null

  if (tokenHash && isConfirmType(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (error || !data.user) redirect('/login?error=link_expired')
    userId = data.user.id
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error || !data.user) {
      // Usually: the link was opened in another browser or app (no PKCE verifier there).
      console.warn('[auth] confirm: code exchange failed', { code: error?.code, status: error?.status })
      redirect(isRecovery ? '/login?error=link_expired' : '/login?error=link_other_browser')
    }
    userId = data.user.id
  } else {
    redirect('/login?error=link_expired')
  }

  if (isRecovery) {
    // Proof that this browser opened a valid recovery link; updatePasswordAction requires it.
    const cookieStore = await cookies()
    cookieStore.set(RECOVERY_COOKIE, userId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: RECOVERY_WINDOW_SECONDS,
    })
    redirect('/reset-password')
  }

  redirect(postAuthRedirect(next, '/dashboard'))
}
