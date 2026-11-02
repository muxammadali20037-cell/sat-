import { z } from 'zod'
import type { TokenUsage } from './types'

/**
 * AI cost accounting. Prices come from platform_settings 'ai.pricing_usd_per_mtok'
 * (`{ "<model>": { "input": USD per million input tokens, "output": USD per million output tokens } }`).
 *
 * cost (USD) = tokens × price / 1e6, and cost_micros = USD × 1e6, so
 * cost_micros = inputTokens × inputPrice + outputTokens × outputPrice (rounded).
 */

export const PRICING_SETTING_KEY = 'ai.pricing_usd_per_mtok'

export type ModelPricing = { input: number; output: number }
export type PricingTable = Record<string, ModelPricing>

const PricingTableSchema = z.record(
  z.string(),
  z.object({ input: z.number().nonnegative().finite(), output: z.number().nonnegative().finite() }),
)

/** Invalid settings → empty table (every call then costs 0 and is logged as unpriced). */
export function parsePricing(value: unknown): PricingTable {
  const parsed = PricingTableSchema.safeParse(value)
  return parsed.success ? parsed.data : {}
}

/** Exact model id first, then the longest configured id the model starts with (dated snapshots). */
export function findModelPricing(table: PricingTable, model: string): ModelPricing | null {
  if (table[model]) return table[model]
  let best: string | null = null
  for (const key of Object.keys(table)) {
    if (model.startsWith(key) && (!best || key.length > best.length)) best = key
  }
  return best ? table[best]! : null
}

export function computeCostMicros(
  usage: TokenUsage,
  model: string,
  table: PricingTable,
): { costMicros: number; priced: boolean } {
  const price = findModelPricing(table, model)
  if (!price) return { costMicros: 0, priced: false }
  const input = Math.max(0, Math.floor(usage.inputTokens))
  const output = Math.max(0, Math.floor(usage.outputTokens))
  return { costMicros: Math.max(0, Math.round(input * price.input + output * price.output)), priced: true }
}

/** USD display for admin screens: small amounts keep 4 decimals. */
export function formatUsdMicros(micros: number): string {
  const usd = micros / 1_000_000
  const digits = usd !== 0 && Math.abs(usd) < 1 ? 4 : 2
  return `$${usd.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}
