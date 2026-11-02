'use server'

import { revalidatePath } from 'next/cache'
import { getApiContext } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'

/** Marks all of the user's unread notifications as read (RLS + column grant allow only read_at). */
export async function markAllNotificationsReadAction(): Promise<void> {
  const { profile } = await getApiContext()
  const db = await createServerSupabase()
  await db.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', profile.id).is('read_at', null)
  revalidatePath('/dashboard', 'layout')
}
