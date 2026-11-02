import type { ZodType } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

/**
 * Zod → JSON schema for `output_config.format`.
 *
 * The SDK helper (`zodOutputFormat`) already applies the structured-output rules: every object gets
 * `additionalProperties: false`, and unsupported constraints (minLength/maxLength/minimum/maximum,
 * minItems > 1, …) are moved into `description` as hints. We additionally rewrite nullable type
 * arrays (`type: ["string","null"]`) into `anyOf`, the explicitly supported form, and drop the
 * `$schema` hint the helper folds into the root description.
 *
 * The constraints removed here are still enforced: every response is re-validated with the
 * original Zod schema on the server.
 */

const cache = new WeakMap<object, Record<string, unknown>>()

function normalize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalize)
  if (!node || typeof node !== 'object') return node
  const obj: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) obj[k] = normalize(v)

  const type = obj.type
  if (Array.isArray(type) && type.includes('null') && type.length === 2) {
    const other = type.find((t) => t !== 'null')
    const { type: _omit, description, title, ...rest } = obj
    void _omit
    const out: Record<string, unknown> = { anyOf: [{ ...rest, type: other }, { type: 'null' }] }
    if (description !== undefined) out.description = description
    if (title !== undefined) out.title = title
    return out
  }
  return obj
}

export function toProviderJsonSchema(schema: ZodType): Record<string, unknown> {
  const hit = cache.get(schema)
  if (hit) return hit
  const raw = zodOutputFormat(schema as never).schema as Record<string, unknown>
  const out = normalize(raw) as Record<string, unknown>
  if (typeof out.description === 'string' && /^\{\$schema: "[^"]*"\}$/.test(out.description)) delete out.description
  cache.set(schema, out)
  return out
}
