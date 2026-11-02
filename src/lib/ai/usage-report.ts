/** Pure aggregation of ai_usage rows for the admin AI usage screen (UTC days). */

export type UsageRecord = {
  created_at: string
  endpoint: string
  model: string
  provider: string
  input_tokens: number
  output_tokens: number
  cost_micros: number
  status: string
  latency_ms: number
  user_id: string | null
}

export type UsageBucket = {
  requests: number
  ok: number
  errors: number
  invalid: number
  blocked: number
  inputTokens: number
  outputTokens: number
  costMicros: number
  latencyTotal: number
}

const empty = (): UsageBucket => ({
  requests: 0,
  ok: 0,
  errors: 0,
  invalid: 0,
  blocked: 0,
  inputTokens: 0,
  outputTokens: 0,
  costMicros: 0,
  latencyTotal: 0,
})

function add(b: UsageBucket, r: UsageRecord) {
  b.requests += 1
  if (r.status === 'ok') b.ok += 1
  else if (r.status === 'invalid_output') b.invalid += 1
  else if (r.status === 'blocked') b.blocked += 1
  else b.errors += 1
  b.inputTokens += r.input_tokens
  b.outputTokens += r.output_tokens
  b.costMicros += Number(r.cost_micros)
  b.latencyTotal += r.latency_ms
}

export function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}

export function usageDays(days: number, now = new Date()): string[] {
  const out: string[] = []
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  for (let i = days - 1; i >= 0; i--) out.push(new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10))
  return out
}

export function aggregateUsage(rows: UsageRecord[], options: { days: number; now?: Date }) {
  const totals = empty()
  const byDay = new Map(usageDays(options.days, options.now).map((d) => [d, empty()]))
  const byModel = new Map<string, UsageBucket>()
  const byEndpoint = new Map<string, UsageBucket>()
  const byUser = new Map<string, UsageBucket>()

  for (const r of rows) {
    add(totals, r)
    const day = byDay.get(r.created_at.slice(0, 10))
    if (day) add(day, r)
    const modelKey = `${r.provider}:${r.model}`
    if (!byModel.has(modelKey)) byModel.set(modelKey, empty())
    add(byModel.get(modelKey)!, r)
    if (!byEndpoint.has(r.endpoint)) byEndpoint.set(r.endpoint, empty())
    add(byEndpoint.get(r.endpoint)!, r)
    if (r.user_id) {
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, empty())
      add(byUser.get(r.user_id)!, r)
    }
  }

  const sorted = (m: Map<string, UsageBucket>) =>
    [...m.entries()].map(([key, b]) => ({ key, ...b })).sort((a, b) => b.costMicros - a.costMicros || b.requests - a.requests)

  return {
    totals,
    byDay: [...byDay.entries()].map(([date, b]) => ({ date, ...b })),
    byModel: sorted(byModel),
    byEndpoint: sorted(byEndpoint),
    topUsers: sorted(byUser).slice(0, 10),
  }
}
