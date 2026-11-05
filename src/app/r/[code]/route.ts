import { NextResponse, type NextRequest } from 'next/server'
import { normalizeCode, REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS } from '@/features/referrals/logic'

/**
 * A friend's invite link. Remembers the code in an httpOnly cookie and sends the visitor to sign
 * up. The code is only attached when a NEW account finishes onboarding, and is checked on the
 * server there; this route trusts nothing.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeCode((await params).code)
  const url = request.nextUrl.clone()
  url.pathname = '/register'
  url.search = code ? '?invited=1' : ''
  const res = NextResponse.redirect(url)
  if (code) {
    res.cookies.set(REFERRAL_COOKIE, code, {
      path: '/',
      maxAge: REFERRAL_COOKIE_DAYS * 86_400,
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    })
  }
  return res
}
