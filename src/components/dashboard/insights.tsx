import Link from 'next/link'
import { Lightbulb, Sparkles, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { format, plural } from '@/lib/i18n/dict'
import type { intelligenceDict } from '@/lib/i18n/dictionaries/intelligence'
import { percent } from '@/features/dashboard/format'
import { MIN_ANSWERS, type Insight, type InsightAction, type IntelligenceResult } from '@/features/intelligence/engine'

type T = (typeof intelligenceDict)['en']

/** Title and evidence line for one insight, in the student's language. Exported for tests. */
export function insightText(insight: Insight, t: T): { title: string; evidence: string } {
  const k = t.kinds
  switch (insight.kind) {
    case 'repeated_mistakes': {
      const e = insight.evidence
      return { title: format(k.repeated_mistakes.title, { skill: e.skillName }), evidence: format(k.repeated_mistakes.evidence, { wrong: e.wrong, answered: e.answered, days: e.days }) }
    }
    case 'fundamentals_first': {
      const e = insight.evidence
      return {
        title: format(k.fundamentals_first.title, { subject: t.subjects[e.subject] }),
        evidence: format(k.fundamentals_first.evidence, { hardShare: percent(e.hardShare), hardAccuracy: percent(e.hardAccuracy), basicsAccuracy: percent(e.basicsAccuracy) }),
      }
    }
    case 'slow_pace': {
      const e = insight.evidence
      return {
        title: format(k.slow_pace.title, { subject: t.subjects[e.subject] }),
        evidence: format(k.slow_pace.evidence, { median: e.medianSeconds, pace: e.paceSeconds, answered: e.answered }),
      }
    }
    case 'rushing': {
      const e = insight.evidence
      return {
        title: format(k.rushing.title, { subject: t.subjects[e.subject] }),
        evidence: format(k.rushing.evidence, { median: e.medianSeconds, pace: e.paceSeconds, accuracy: percent(e.accuracy) }),
      }
    }
    case 'weak_domain': {
      const e = insight.evidence
      return { title: format(k.weak_domain.title, { domain: e.domainName }), evidence: format(k.weak_domain.evidence, { accuracy: percent(e.accuracy), answered: e.answered }) }
    }
    case 'declined':
    case 'improved': {
      const e = insight.evidence
      const copy = k[insight.kind]
      return { title: format(copy.title, { subject: t.subjects[e.subject] }), evidence: format(copy.evidence, { before: percent(e.before), after: percent(e.after) }) }
    }
    case 'target_gap': {
      const e = insight.evidence
      return {
        title: e.gap > 0 ? format(k.target_gap.title, { gap: e.gap }) : k.target_gap.titleWithin,
        evidence: format(k.target_gap.evidence, { low: e.low, high: e.high, target: e.target }),
      }
    }
    case 'on_track': {
      const e = insight.evidence
      return { title: k.on_track.title, evidence: format(k.on_track.evidence, { low: e.low, high: e.high, target: e.target }) }
    }
    case 'no_estimate':
      return { title: k.no_estimate.title, evidence: format(k.no_estimate.evidence, { target: insight.evidence.target }) }
    case 'mock_ready': {
      const e = insight.evidence
      return {
        title: k.mock_ready.title,
        evidence: e.daysSince === null ? format(k.mock_ready.evidenceFirst, { n: e.answeredSince }) : format(k.mock_ready.evidence, { days: e.daysSince, n: e.answeredSince }),
      }
    }
    case 'flashcards_due':
      return { title: plural(insight.evidence.due, k.flashcards_due.title), evidence: k.flashcards_due.evidence }
    case 'consistency_low':
    case 'consistency_strong': {
      const e = insight.evidence
      const copy = k[insight.kind]
      return { title: copy.title, evidence: format(copy.evidence, { active: e.activeDays, days: e.days }) }
    }
  }
}

function actionLabel(action: InsightAction, t: T): string {
  return action.kind === 'lesson' ? format(t.actions.lesson, { n: action.minutes }) : t.actions[action.kind]
}

function Row({ insight, t }: { insight: Insight; t: T }) {
  const { title, evidence } = insightText(insight, t)
  const positive = insight.tone === 'positive'
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-full [&_svg]:size-3.5', positive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}
        aria-hidden
      >
        {positive ? <TrendingUp /> : <Lightbulb />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{evidence}</p>
        {insight.action && (
          <Link href={insight.action.href} className="mt-1 inline-block text-[13px] font-medium text-primary hover:underline">
            {actionLabel(insight.action, t)}
          </Link>
        )}
      </div>
    </li>
  )
}

export function InsightsCard({ t, data, className }: { t: T; data: IntelligenceResult; className?: string }) {
  const next = data.next
  const nextText = next ? insightText(next, t) : null
  const rest = data.insights.slice(0, 4)
  return (
    <Card className={cn('p-5', className)} data-testid="insights-card">
      <h2 className="flex items-center gap-2 font-sans text-[15px] font-semibold text-foreground">
        <Sparkles className="size-4 text-muted-foreground" aria-hidden />
        {t.title}
      </h2>
      <p className="mt-0.5 text-[13px] text-muted-foreground">{t.description}</p>

      {next && nextText && next.action ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4 sm:flex-row sm:items-center" data-insight={next.kind}>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-foreground">{nextText.title}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">{nextText.evidence}</p>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link href={next.action.href}>{actionLabel(next.action, t)}</Link>
          </Button>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {data.enoughData ? t.nothing : format(t.notEnough, { n: MIN_ANSWERS, answered: data.answered })}
        </p>
      )}

      {rest.length > 0 && (
        <>
          <h3 className="mt-5 text-[13px] font-medium text-muted-foreground">{t.more}</h3>
          <ul className="divide-y divide-border">
            {rest.map((i) => (
              <Row key={`${i.kind}-${insightText(i, t).title}`} insight={i} t={t} />
            ))}
          </ul>
        </>
      )}
      <p className="mt-4 text-xs text-muted-foreground">{t.howItWorks}</p>
    </Card>
  )
}
