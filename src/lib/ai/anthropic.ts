import 'server-only'
import Anthropic, { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from '@anthropic-ai/sdk'
import { toProviderJsonSchema } from './json-schema'
import { AiCallError, type AiProvider, type GenerateStructuredRequest, type GenerateStructuredResult } from './types'

const DEFAULT_TIMEOUT_MS = 45_000

/** Maps SDK failures to stable error codes (stored in ai_usage.error_code; never shown raw to students). */
function mapError(err: unknown, model: string, latencyMs: number): AiCallError {
  const make = (code: string, message: string) => new AiCallError('provider', code, message, undefined, model, latencyMs)
  if (err instanceof AiCallError) return err
  if (err instanceof APIConnectionTimeoutError) return make('timeout', 'AI provider timed out')
  if (err instanceof APIUserAbortError) return make('aborted', 'AI request aborted')
  if (err instanceof APIConnectionError) return make('provider_connection', 'AI provider unreachable')
  if (err instanceof APIError) {
    const status = err.status ?? 0
    if (status === 401 || status === 403) {
      console.error('[ai] Anthropic rejected the API key — check ANTHROPIC_API_KEY', { status })
      return make('provider_auth', 'AI provider rejected credentials')
    }
    if (status === 429) return make('provider_rate_limited', 'AI provider rate limit')
    if (status === 404) {
      console.error('[ai] Anthropic model not found — check AI_MODEL_TUTOR / AI_MODEL_FAST', { model })
      return make('provider_model_not_found', 'Model not found')
    }
    if (status === 400) {
      console.error('[ai] Anthropic bad request', { model, message: err.message })
      return make('provider_bad_request', 'AI request rejected')
    }
    if (status >= 500) return make('provider_unavailable', `AI provider error ${status}`)
    return make(`provider_${status || 'error'}`, 'AI provider error')
  }
  console.error('[ai] unexpected provider error', err)
  return make('provider_unknown', 'Unexpected AI provider error')
}

export class AnthropicProvider implements AiProvider {
  readonly id = 'anthropic' as const
  private readonly client: Anthropic

  constructor(apiKey: string) {
    // One SDK-level retry for transient network/5xx errors; run.ts adds one retry for invalid output.
    this.client = new Anthropic({ apiKey, maxRetries: 1, timeout: DEFAULT_TIMEOUT_MS })
  }

  async generateStructured<T>(req: GenerateStructuredRequest<T>): Promise<GenerateStructuredResult<T>> {
    const started = Date.now()
    let message: Anthropic.Message
    try {
      message = await this.client.messages.create(
        {
          model: req.model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
          output_config: { format: { type: 'json_schema', schema: toProviderJsonSchema(req.schema) } },
        },
        { timeout: req.timeoutMs ?? DEFAULT_TIMEOUT_MS },
      )
    } catch (err) {
      throw mapError(err, req.model, Date.now() - started)
    }

    const latencyMs = Date.now() - started
    const u = message.usage
    const usage = {
      inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
      outputTokens: u.output_tokens ?? 0,
    }
    const model = message.model || req.model

    if (message.stop_reason === 'refusal') {
      throw new AiCallError('refusal', 'refusal', 'The model declined the request', usage, model, latencyMs)
    }
    const text = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim()
    if (message.stop_reason === 'max_tokens') {
      throw new AiCallError('invalid_output', 'max_tokens', 'Output truncated at max_tokens', usage, model, latencyMs)
    }
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new AiCallError('invalid_output', 'json_parse', 'Output is not valid JSON', usage, model, latencyMs)
    }
    const parsed = req.schema.safeParse(json)
    if (!parsed.success) {
      throw new AiCallError('invalid_output', 'schema_mismatch', 'Output does not match the schema', usage, model, latencyMs)
    }
    return { data: parsed.data, usage, model, latencyMs }
  }
}
