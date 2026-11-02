import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { publicEnv, serverEnv } from '@/lib/env'
import { SupabaseNotConfiguredError, type Db } from './server'

let adminClient: Db | null = null

/**
 * Service-role client. BYPASSES RLS. Use only on the server AFTER an explicit authorization
 * check (DAL), for: answer keys, scoring writes, attempt creation, payments, cross-user admin ops.
 * Never import this module from a Client Component.
 */
export function createAdminSupabase(): Db {
  if (adminClient) return adminClient
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL
  const key = serverEnv().SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new SupabaseNotConfiguredError()
  adminClient = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-application-name': 'sat-master-server' } },
  })
  return adminClient
}
