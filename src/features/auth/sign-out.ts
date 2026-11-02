'use server'

import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'

/** Secure logout: revokes this device's session server-side and clears cookies. */
export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = await createServerSupabase()
    await supabase.auth.signOut({ scope: 'local' })
  }
  redirect('/login')
}
