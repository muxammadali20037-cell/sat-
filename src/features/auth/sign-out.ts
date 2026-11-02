'use server'

import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { isMiniAppRequest } from '@/features/telegram/server'

/** Secure logout: revokes this device's session server-side and clears cookies. */
export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = await createServerSupabase()
    await supabase.auth.signOut({ scope: 'local' })
  }
  // In the Telegram Mini App the entry screen offers to continue with Telegram or another account.
  redirect((await isMiniAppRequest()) ? '/tg?signed_out=1' : '/login')
}
