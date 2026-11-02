import { ApiError } from '@/lib/api/errors'
import { computeCostMicros, type PricingTable } from './cost'
import { PROMPT_CANARY } from './prompts'
import {
  AiCallError,
  type AiEndpoint,
  type AiProvider,
  type AiProviderId,
  type AiUsageStatus,
  type GenerateStructuredRequest,
  type TokenUsage,
} from './types'

/**
 * One metered structured AI call with policy:
 * - every provider call writes one ai_usage row (ok | invalid_output | blocked | error), failures included
 * - invalid output (bad JSON, schema mismatch, failed server validation) → one retry, then 502 AI_UNAVAILABLE
 * - refusals / prompt-canary leaks → 'blocked' + 422, provider failures → 'error' + 502 with a friendly message
 * Pure apart from the injected sink, so it is unit-tested with fakes.
 */

export type UsageRow = {
  userId: string | null
  sessionId: string | null
  endpoint: AiEndpoint
  provider: AiProviderId
  model: string
  inputTokens: number
  outputTokens: number
  costMicros: number
  status: AiUsageStatus
  latencyMs: number
  errorCode: string | null
}

export interface UsageSink {
  /** Returns the ai_usage id (null if the write failed — metering failures never fail the request). */
  record(row: UsageRow): Promise<string | null>
  /** Re-label an earlier row, e.g. a draft that later failed verification. */
  updateStatus(id: string, status: AiUsageStatus, errorCode: string | null): Promise<void>
}

export type RunStructuredOptions<T> = {
  provider: AiProvider
  sink: UsageSink
  pricing: PricingTable
  endpoint: AiEndpoint
  userId: string | null
  sessionId: string | null
  request: GenerateStructuredRequest<T>
  /** Server-side validation beyond the schema. Return an error code to treat the output as invalid. */
  validate?: (data: T) => string | null
  maxAttempts?: number
}

export type RunStructuredResult<T> = { data: T; usageId: string | null; model: string; provider: AiProviderId }

export const AI_MESSAGES = {
  unavailable: 'The AI tutor is temporarily unavailable. Please try again in a moment.',
  invalid: 'The AI tutor could not produce a usable answer. Please try again.',
  blocked: 'The AI tutor can only help with SAT preparation. Try rephrasing your question.',
} as const

export async function runStructured<T>(opts: RunStructuredOptions<T>): Promise<RunStructuredResult<T>> {
  const maxAttempts = opts.maxAttempts ?? 2
  const base = { userId: opts.userId, sessionId: opts.sessionId, endpoint: opts.endpoint, provider: opts.provider.id }

  const record = (model: string, usage: TokenUsage, status: AiUsageStatus, latencyMs: number, errorCode: string | null) => {
    const { costMicros, priced } = computeCostMicros(usage, model, opts.pricing)
    if (!priced && opts.provider.id !== 'mock' && (usage.inputTokens > 0 || usage.outputTokens > 0)) {
      console.warn(`[ai] no price configured for model "${model}" in ai.pricing_usd_per_mtok — cost recorded as 0`)
    }
    return opts.sink.record({
      ...base,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costMicros,
      status,
      latencyMs,
      errorCode,
    })
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await opts.provider.generateStructured(opts.request)
      if (JSON.stringify(result.data).includes(PROMPT_CANARY)) {
        await record(result.model, result.usage, 'blocked', result.latencyMs, 'prompt_leak')
        throw new ApiError(422, 'AI_UNAVAILABLE', AI_MESSAGES.blocked)
      }
      const invalid = opts.validate?.(result.data) ?? null
      if (invalid) {
        await record(result.model, result.usage, 'invalid_output', result.latencyMs, invalid)
        if (attempt < maxAttempts) continue
        throw new ApiError(502, 'AI_UNAVAILABLE', AI_MESSAGES.invalid)
      }
      const usageId = await record(result.model, result.usage, 'ok', result.latencyMs, null)
      return { data: result.data, usageId, model: result.model, provider: opts.provider.id }
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (err instanceof AiCallError) {
        const model = err.model ?? opts.request.model
        if (err.kind === 'invalid_output') {
          await record(model, err.usage, 'invalid_output', err.latencyMs, err.code)
          if (attempt < maxAttempts) continue
          throw new ApiError(502, 'AI_UNAVAILABLE', AI_MESSAGES.invalid)
        }
        if (err.kind === 'refusal') {
          await record(model, err.usage, 'blocked', err.latencyMs, err.code)
          throw new ApiError(422, 'AI_UNAVAILABLE', AI_MESSAGES.blocked)
        }
        await record(model, err.usage, 'error', err.latencyMs, err.code)
        throw new ApiError(502, 'AI_UNAVAILABLE', AI_MESSAGES.unavailable)
      }
      console.error('[ai] unexpected error during AI call', err)
      await record(opts.request.model, { inputTokens: 0, outputTokens: 0 }, 'error', 0, 'unexpected')
      throw new ApiError(502, 'AI_UNAVAILABLE', AI_MESSAGES.unavailable)
    }
  }
  // Unreachable: the loop either returns or throws.
  throw new ApiError(502, 'AI_UNAVAILABLE', AI_MESSAGES.invalid)
}
