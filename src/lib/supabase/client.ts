'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

/** Browser client (anon key, user session). RLS applies. Used sparingly — prefer server APIs. */
export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase is not configured')
  return createBrowserClient<Database>(url, key)
}
