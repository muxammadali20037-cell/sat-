import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { isSupabaseConfigured } from '@/lib/env'
import { createServerSupabase } from '@/lib/supabase/server'
import { isConfirmType, postAuthRedirect, RECOVERY_COOKIE, RECOVERY_WINDOW_SECONDS } from '@/features/auth/errors'

/**
 * Email link landing (sign-up confirmation, password recovery, email change).
 * Email templates link here as `/auth/confirm?token_hash=…&type=…&next=…` (see docs/AUTH_SETUP.md).
 * verifyOtp sets the session cookies; redirect() keeps them on the response.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (!isSupabaseConfigured || !tokenHash || !isConfirmType(type)) {
    redirect('/login?error=link_expired')
  }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
  if (error || !data.user) {
    redirect('/login?error=link_expired')
  }

  if (type === 'recovery') {
    // Proof that this browser opened a valid recovery link; updatePasswordAction requires it.
    const cookieStore = await cookies()
    cookieStore.set(RECOVERY_COOKIE, data.user.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: RECOVERY_WINDOW_SECONDS,
    })
    redirect('/reset-password')
  }

  redirect(postAuthRedirect(searchParams.get('next'), '/dashboard'))
}
