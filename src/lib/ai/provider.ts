import 'server-only'
import { serverEnv, type ServerEnv } from '@/lib/env'
import { ApiError } from '@/lib/api/errors'
import { AnthropicProvider } from './anthropic'
import { MockAiProvider } from './mock'
import type { AiProvider } from './types'

export type AiAvailability = 'anthropic' | 'mock' | 'none'

export const AI_NOT_CONFIGURED_MESSAGE = 'The AI tutor is not configured for this deployment yet.'

/**
 * - `mock` only when AI_PROVIDER=mock AND NODE_ENV !== 'production' (never silently in prod)
 * - `anthropic` when ANTHROPIC_API_KEY is set
 * - otherwise `none` → endpoints answer 503 AI_NOT_CONFIGURED
 */
export function resolveAiAvailability(env: Pick<ServerEnv, 'AI_PROVIDER' | 'ANTHROPIC_API_KEY' | 'NODE_ENV'>): AiAvailability {
  if (env.AI_PROVIDER === 'mock') return env.NODE_ENV === 'production' ? 'none' : 'mock'
  return env.ANTHROPIC_API_KEY ? 'anthropic' : 'none'
}

export function aiAvailability(): AiAvailability {
  return resolveAiAvailability(serverEnv())
}

export function aiModels(): { tutor: string; fast: string } {
  const env = serverEnv()
  return { tutor: env.AI_MODEL_TUTOR, fast: env.AI_MODEL_FAST }
}

export function aiNotConfiguredError(): ApiError {
  return new ApiError(503, 'AI_NOT_CONFIGURED', AI_NOT_CONFIGURED_MESSAGE)
}

let anthropic: AnthropicProvider | null = null
let mock: MockAiProvider | null = null

/** Throws ApiError(503, 'AI_NOT_CONFIGURED') when no provider is available. */
export function getAiProvider(): AiProvider {
  const availability = aiAvailability()
  if (availability === 'mock') return (mock ??= new MockAiProvider())
  if (availability === 'anthropic') return (anthropic ??= new AnthropicProvider(serverEnv().ANTHROPIC_API_KEY!))
  throw aiNotConfiguredError()
}
