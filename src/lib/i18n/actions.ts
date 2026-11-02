'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { isUiLocale, LOCALE_COOKIE } from './config'
import { getCurrentUser } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'

/** Switch interface language: persists in a cookie and, for signed-in users, on the profile. */
export async function setLocaleAction(locale: string): Promise<void> {
  if (!isUiLocale(locale)) return
  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  const user = await getCurrentUser()
  if (user) {
    const supabase = await createServerSupabase()
    await supabase.from('profiles').update({ locale }).eq('id', user.id)
  }
  revalidatePath('/', 'layout')
}
