import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { parsePricing, PRICING_SETTING_KEY, type PricingTable } from './cost'
import type { UsageSink } from './run'

const PRICING_TTL_MS = 60_000
let pricingCache: { at: number; table: PricingTable } | null = null

/** Pricing from platform_settings (60 s in-process cache). Failures → {} (cost 0, logged by run.ts). */
export async function loadPricing(admin: Db, options: { fresh?: boolean } = {}): Promise<PricingTable> {
  if (!options.fresh && pricingCache && Date.now() - pricingCache.at < PRICING_TTL_MS) return pricingCache.table
  try {
    const { data, error } = await admin.from('platform_settings').select('value').eq('key', PRICING_SETTING_KEY).maybeSingle()
    if (error) throw error
    const table = parsePricing(data?.value)
    pricingCache = { at: Date.now(), table }
    return table
  } catch (err) {
    console.error('[ai] could not load AI pricing settings', err)
    return pricingCache?.table ?? {}
  }
}

/** ai_usage writer (service role, called only after the request was authorized). */
export function createUsageSink(admin: Db): UsageSink {
  return {
    async record(row) {
      const { data, error } = await admin
        .from('ai_usage')
        .insert({
          user_id: row.userId,
          session_id: row.sessionId,
          endpoint: row.endpoint,
          provider: row.provider,
          model: row.model.slice(0, 120),
          input_tokens: row.inputTokens,
          output_tokens: row.outputTokens,
          cost_micros: row.costMicros,
          status: row.status,
          latency_ms: Math.max(0, Math.round(row.latencyMs)),
          error_code: row.errorCode,
        })
        .select('id')
        .single()
      if (error) {
        console.error('[ai] failed to record ai_usage', { endpoint: row.endpoint, status: row.status, error })
        return null
      }
      return data.id
    },
    async updateStatus(id, status, errorCode) {
      const { error } = await admin.from('ai_usage').update({ status, error_code: errorCode }).eq('id', id)
      if (error) console.error('[ai] failed to update ai_usage status', { id, error })
    },
  }
}
