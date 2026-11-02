import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { requireRole } from '@/lib/auth/session'
import { ADMIN_ROLES } from '@/config/roles'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { aiAvailability, aiModels } from '@/lib/ai/provider'
import { loadPricing } from '@/lib/ai/usage'
import { formatUsdMicros, PRICING_SETTING_KEY } from '@/lib/ai/cost'
import { aggregateUsage, rate, usageDays, type UsageRecord } from '@/lib/ai/usage-report'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatCard } from '@/components/ui/progress'
import { DataTable } from '@/components/ui/data-table'
import { DailyUsageChart } from '@/components/ai/usage-chart'
import { cn, formatPercent } from '@/lib/utils'

export const metadata: Metadata = { title: 'AI usage' }

const MAX_ROWS = 50_000
const ENDPOINT_LABELS: Record<string, string> = {
  chat: 'Concept chat',
  explain: 'Explain',
  hint: 'Hint',
  generate_practice: 'Generate practice',
  verify_practice: 'Verify practice',
  study_plan: 'Study plan',
}

const fmtInt = (n: number) => n.toLocaleString('en-US')
const fmtMs = (total: number, count: number) => (count > 0 ? `${fmtInt(Math.round(total / count))} ms` : '—')

export default async function AiUsagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(ADMIN_ROLES, { next: '/admin/ai-usage' })
  const sp = await searchParams
  const days = sp.days === '7' ? 7 : 30
  const admin = createAdminSupabase()
  const since = `${usageDays(days)[0]}T00:00:00Z`

  // ai_usage has no aggregate RPC: page through rows (PostgREST caps responses at 1,000).
  const rows: UsageRecord[] = []
  let truncated = false
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('ai_usage')
      .select('created_at, endpoint, model, provider, input_tokens, output_tokens, cost_micros, status, latency_ms, user_id')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(from, from + 999)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
    if (rows.length >= MAX_ROWS) {
      truncated = true
      break
    }
  }

  const [failuresRes, pricing] = await Promise.all([
    admin
      .from('ai_usage')
      .select('id, created_at, endpoint, model, provider, status, error_code, latency_ms, user_id')
      .neq('status', 'ok')
      .order('created_at', { ascending: false })
      .limit(25),
    loadPricing(admin, { fresh: true }),
  ])
  if (failuresRes.error) throw failuresRes.error

  const report = aggregateUsage(rows, { days })
  const userIds = [...new Set([...report.topUsers.map((u) => u.key), ...(failuresRes.data ?? []).map((f) => f.user_id).filter((x): x is string => !!x)])]
  const { data: people } = userIds.length
    ? await admin.from('profiles').select('id, full_name, email').in('id', userIds)
    : { data: [] as { id: string; full_name: string; email: string }[] }
  const personById = new Map((people ?? []).map((p) => [p.id, p]))

  const availability = aiAvailability()
  const models = aiModels()
  const tot = report.totals
  const tokens = tot.inputTokens + tot.outputTokens
  const priced = Object.entries(pricing)

  const periodLink = (d: 7 | 30) => (
    <Link
      href={`/admin/ai-usage?days=${d}`}
      aria-current={days === d ? 'page' : undefined}
      className={cn(
        'inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium',
        days === d ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      Last {d} days
    </Link>
  )

  const bucketColumns = (keyHeader: string, keyCell: (k: string) => ReactNode) => [
    { key: 'k', header: keyHeader, cell: (r: (typeof report.byModel)[number]) => keyCell(r.key) },
    { key: 'req', header: 'Requests', align: 'right' as const, cell: (r: (typeof report.byModel)[number]) => fmtInt(r.requests) },
    {
      key: 'tok',
      header: 'Tokens (in / out)',
      align: 'right' as const,
      hideBelow: 'md' as const,
      cell: (r: (typeof report.byModel)[number]) => `${fmtInt(r.inputTokens)} / ${fmtInt(r.outputTokens)}`,
    },
    { key: 'cost', header: 'Cost', align: 'right' as const, cell: (r: (typeof report.byModel)[number]) => formatUsdMicros(r.costMicros) },
    {
      key: 'err',
      header: 'Error · invalid',
      align: 'right' as const,
      cell: (r: (typeof report.byModel)[number]) =>
        `${formatPercent(rate(r.errors + r.blocked, r.requests), 1)} · ${formatPercent(rate(r.invalid, r.requests), 1)}`,
    },
    { key: 'lat', header: 'Avg latency', align: 'right' as const, hideBelow: 'lg' as const, cell: (r: (typeof report.byModel)[number]) => fmtMs(r.latencyTotal, r.requests) },
  ]

  return (
    <>
      <PageHeader
        title="AI usage"
        description="Requests, tokens and cost of the AI tutor, generated practice and study plans. Days are in UTC."
        actions={
          <nav aria-label="Period" className="flex gap-1">
            {periodLink(7)}
            {periodLink(30)}
          </nav>
        }
      />

      <div className="space-y-8">
        <Alert
          variant={availability === 'none' ? 'warning' : availability === 'mock' ? 'warning' : 'neutral'}
          title={
            availability === 'anthropic'
              ? `Provider: Anthropic · tutor model ${models.tutor} · fast model ${models.fast}`
              : availability === 'mock'
                ? 'Provider: Mock AI (development) — responses are not from a real model'
                : 'AI is not configured for this deployment (no ANTHROPIC_API_KEY). Students see a "not configured" state.'
          }
        >
          Cost is computed per request from token counts and the <code className="text-[12px]">{PRICING_SETTING_KEY}</code> platform
          setting (USD per million tokens). Change prices in{' '}
          <Link href="/admin/settings" className="text-primary underline-offset-4 hover:underline">
            Settings
          </Link>
          ; past rows keep the cost recorded at request time.
        </Alert>

        {truncated && <Alert variant="warning" title={`Showing the most recent ${fmtInt(MAX_ROWS)} requests of this period.`} />}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Requests" value={fmtInt(tot.requests)} hint={`${fmtInt(tot.ok)} successful`} />
          <StatCard label="Tokens" value={fmtInt(tokens)} hint={`${fmtInt(tot.inputTokens)} in · ${fmtInt(tot.outputTokens)} out`} />
          <StatCard label="Cost" value={formatUsdMicros(tot.costMicros)} hint={`Last ${days} days`} />
          <StatCard label="Error rate" value={tot.requests ? formatPercent(rate(tot.errors + tot.blocked, tot.requests), 1) : null} hint="Provider errors and blocked" />
          <StatCard label="Invalid output" value={tot.requests ? formatPercent(rate(tot.invalid, tot.requests), 1) : null} hint="Retried or rejected outputs" />
          <StatCard label="Avg latency" value={tot.requests ? fmtMs(tot.latencyTotal, tot.requests) : null} hint="Per provider call" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Requests per day</CardTitle>
            </CardHeader>
            <CardContent>
              <DailyUsageChart label="Requests per day" data={report.byDay.map((d) => ({ date: d.date, value: d.requests }))} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Cost per day (USD)</CardTitle>
            </CardHeader>
            <CardContent>
              <DailyUsageChart label="Cost per day in USD" valueFormat="usd" data={report.byDay.map((d) => ({ date: d.date, value: d.costMicros / 1_000_000 }))} />
            </CardContent>
          </Card>
        </div>

        <details className="rounded-lg border border-border bg-card px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Daily table</summary>
          <DataTable
            className="mt-3"
            caption="AI usage by day"
            rowKey={(r) => r.date}
            rows={[...report.byDay].reverse()}
            columns={[
              { key: 'date', header: 'Day (UTC)', cell: (r) => <span className="tabular">{r.date}</span> },
              { key: 'req', header: 'Requests', align: 'right', cell: (r) => fmtInt(r.requests) },
              { key: 'tok', header: 'Tokens', align: 'right', cell: (r) => fmtInt(r.inputTokens + r.outputTokens) },
              { key: 'cost', header: 'Cost', align: 'right', cell: (r) => formatUsdMicros(r.costMicros) },
              { key: 'err', header: 'Errors', align: 'right', cell: (r) => fmtInt(r.errors + r.blocked) },
              { key: 'inv', header: 'Invalid', align: 'right', cell: (r) => fmtInt(r.invalid) },
            ]}
          />
        </details>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Section title="By model">
            <DataTable
              caption="AI usage by model"
              rowKey={(r) => r.key}
              rows={report.byModel}
              empty={{ title: 'No AI requests in this period.' }}
              columns={bucketColumns('Model', (k) => {
                const [provider, model] = k.split(/:(.*)/s)
                return (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{model}</span>
                    {provider === 'mock' && <Badge variant="warning">mock</Badge>}
                  </span>
                )
              })}
            />
          </Section>
          <Section title="By endpoint">
            <DataTable
              caption="AI usage by endpoint"
              rowKey={(r) => r.key}
              rows={report.byEndpoint}
              empty={{ title: 'No AI requests in this period.' }}
              columns={bucketColumns('Endpoint', (k) => ENDPOINT_LABELS[k] ?? k)}
            />
          </Section>
        </div>

        <Section title="Top students by cost" description={`Last ${days} days`}>
          <DataTable
            caption="Top students by AI cost"
            rowKey={(r) => r.key}
            rows={report.topUsers}
            empty={{ title: 'No student AI usage in this period.' }}
            columns={[
              {
                key: 'who',
                header: 'Student',
                cell: (r) => {
                  const p = personById.get(r.key)
                  return (
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p?.full_name || '—'}</p>
                      <p className="truncate text-xs text-muted-foreground">{p?.email ?? r.key}</p>
                    </div>
                  )
                },
              },
              { key: 'req', header: 'Requests', align: 'right', cell: (r) => fmtInt(r.requests) },
              { key: 'tok', header: 'Tokens', align: 'right', hideBelow: 'md', cell: (r) => fmtInt(r.inputTokens + r.outputTokens) },
              { key: 'cost', header: 'Cost', align: 'right', cell: (r) => formatUsdMicros(r.costMicros) },
            ]}
          />
        </Section>

        <Section title="Recent failures" description="Latest 25 requests that did not succeed (all time)">
          <DataTable
            caption="Recent AI failures"
            rowKey={(r) => r.id}
            rows={failuresRes.data ?? []}
            empty={{ title: 'No failed AI requests.' }}
            columns={[
              { key: 'when', header: 'When (UTC)', cell: (r) => <span className="whitespace-nowrap tabular">{r.created_at.slice(0, 16).replace('T', ' ')}</span> },
              { key: 'ep', header: 'Endpoint', cell: (r) => ENDPOINT_LABELS[r.endpoint] ?? r.endpoint },
              {
                key: 'status',
                header: 'Status',
                cell: (r) => <Badge variant={r.status === 'invalid_output' ? 'warning' : 'destructive'}>{r.status.replace('_', ' ')}</Badge>,
              },
              { key: 'code', header: 'Error code', cell: (r) => <code className="text-[12px]">{r.error_code ?? '—'}</code> },
              { key: 'model', header: 'Model', hideBelow: 'lg', cell: (r) => r.model },
              {
                key: 'who',
                header: 'Student',
                hideBelow: 'md',
                cell: (r) => (r.user_id ? (personById.get(r.user_id)?.email ?? r.user_id) : '—'),
              },
            ]}
          />
        </Section>

        <Section title="Configured prices" description={`From the ${PRICING_SETTING_KEY} setting, USD per million tokens`}>
          {priced.length === 0 ? (
            <Alert variant="warning" title="No valid prices configured — every request is recorded with cost 0." />
          ) : (
            <DataTable
              caption="Configured AI prices"
              rowKey={(r) => r[0]}
              rows={priced}
              columns={[
                { key: 'model', header: 'Model', cell: (r) => <span className="font-medium">{r[0]}</span> },
                { key: 'in', header: 'Input / MTok', align: 'right', cell: (r) => `$${r[1].input}` },
                { key: 'out', header: 'Output / MTok', align: 'right', cell: (r) => `$${r[1].output}` },
              ]}
            />
          )}
        </Section>
      </div>
    </>
  )
}
