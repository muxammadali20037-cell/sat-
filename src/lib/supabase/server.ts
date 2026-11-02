import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { publicEnv } from '@/lib/env'

export type Db = SupabaseClient<Database>

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
    this.name = 'SupabaseNotConfiguredError'
  }
}

/**
 * User-scoped client (anon key + the user's session cookie). RLS applies.
 * Use this by default for anything the current user may legitimately read.
 */
export async function createServerSupabase(): Promise<Db> {
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL
  const key = publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new SupabaseNotConfiguredError()

  const cookieStore = await cookies()
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        } catch {
          // Called from a Server Component: cookies are read-only there. proxy.ts refreshes sessions.
        }
      },
    },
  })
}
