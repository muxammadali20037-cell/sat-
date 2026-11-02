import type { ZodType } from 'zod'

/**
 * AI provider contract (SYSTEM_ARCHITECTURE §10). Providers only produce validated structured
 * data; metering, retries, error mapping and persistence live in `run.ts` and the features.
 */

export type AiProviderId = 'anthropic' | 'mock'

/** Mirrors the ai_usage.endpoint CHECK constraint. */
export type AiEndpoint = 'chat' | 'explain' | 'hint' | 'generate_practice' | 'verify_practice' | 'study_plan'

/** Mirrors the ai_usage.status CHECK constraint. */
export type AiUsageStatus = 'ok' | 'error' | 'blocked' | 'invalid_output'

export type AiMessage = { role: 'user' | 'assistant'; content: string }

export type TokenUsage = { inputTokens: number; outputTokens: number }

export type GenerateStructuredRequest<T> = {
  system: string
  messages: AiMessage[]
  /** Zod schema: converted to a JSON schema for the provider AND used to re-validate the output. */
  schema: ZodType<T>
  /** Stable name of the output shape (also selects the mock fixture). */
  jsonSchemaName: string
  model: string
  maxTokens: number
  /**
   * Accepted for interface compatibility. The Anthropic Messages API in SDK 1.3 has no sampling
   * parameters, so the Anthropic provider does not send it.
   */
  temperature?: number
  /** Per-call timeout (ms). Defaults to 45 s. */
  timeoutMs?: number
}

export type GenerateStructuredResult<T> = {
  data: T
  usage: TokenUsage
  model: string
  latencyMs: number
}

export interface AiProvider {
  readonly id: AiProviderId
  generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<GenerateStructuredResult<T>>
}

/**
 * Raised by providers. `kind`:
 * - `invalid_output`: the model answered but the output is not valid JSON for the schema (retryable once)
 * - `refusal`: the model declined (stop_reason "refusal")
 * - `provider`: transport/API failure (timeout, 429, 5xx, auth…)
 * Carries whatever usage is known so failed calls are still metered.
 */
export class AiCallError extends Error {
  constructor(
    public readonly kind: 'invalid_output' | 'refusal' | 'provider',
    public readonly code: string,
    message: string,
    public readonly usage: TokenUsage = { inputTokens: 0, outputTokens: 0 },
    public readonly model: string | null = null,
    public readonly latencyMs = 0,
  ) {
    super(message)
    this.name = 'AiCallError'
  }
}
