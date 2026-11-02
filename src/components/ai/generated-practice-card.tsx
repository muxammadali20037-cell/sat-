'use client'

import * as React from 'react'
import { CheckCircle2, WandSparkles, XCircle } from 'lucide-react'
import { RichText } from '@/components/learning/rich-text'
import { AnswerOption, type AnswerOptionState } from '@/components/learning/answer-option'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { useDict } from '@/lib/i18n/client'
import { tutorDict } from '@/lib/i18n/dictionaries/tutor'
import { cn } from '@/lib/utils'
import type { GenerateAnswerResponse, GeneratedReveal, SafeGeneratedQuestion } from '@/features/ai-tutor/schemas'
import type { OptionLabel } from '@/types/questions'

const LABELS: OptionLabel[] = ['A', 'B', 'C', 'D']

/** AI-generated practice question answered inline; the key arrives only after submission. */
export function GeneratedPracticeCard({
  generated,
  initialReveal,
  mock,
}: {
  generated: SafeGeneratedQuestion
  initialReveal: GeneratedReveal | null
  mock?: boolean
}) {
  const t = useDict(tutorDict)
  const [selected, setSelected] = React.useState<number | null>(initialReveal?.selectedIndex ?? null)
  const [reveal, setReveal] = React.useState<GeneratedReveal | null>(initialReveal)
  const [pending, setPending] = React.useState(false)

  const options = generated.options.map((content, i) => ({ id: String(i), label: LABELS[i]!, content }))

  const stateFor = (i: number): AnswerOptionState => {
    if (reveal) {
      if (i === reveal.correctIndex) return i === reveal.selectedIndex ? 'correct' : 'missed'
      return i === reveal.selectedIndex ? 'incorrect' : 'idle'
    }
    return selected === i ? 'selected' : 'idle'
  }

  async function check() {
    if (selected === null) return
    setPending(true)
    try {
      const res = await apiFetch<GenerateAnswerResponse>('/api/ai/generate-practice/answer', {
        body: { generatedId: generated.id, selectedIndex: selected },
      })
      setReveal(res)
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : t.errors.generic)
    } finally {
      setPending(false)
    }
  }

  return (
    <article className="min-w-0 rounded-xl border border-border bg-card" aria-label={t.generated.badge}>
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Badge variant="warning">
          <WandSparkles aria-hidden /> {t.generated.badge}
        </Badge>
        {generated.skillName && <Badge variant="outline">{generated.skillName}</Badge>}
        {mock && <Badge variant="warning">{t.mockLabel}</Badge>}
      </header>
      <div className="space-y-4 p-4 sm:p-5">
        {generated.passage && (
          <div className="reading rounded-lg bg-muted/50 p-4 text-foreground">
            <RichText source={generated.passage} />
          </div>
        )}
        <RichText source={generated.stem} className="reading text-[16px] text-foreground" />
        <fieldset className="grid grid-cols-1 gap-2.5" disabled={Boolean(reveal) || pending}>
          <legend className="sr-only">{t.generated.choices}</legend>
          {options.map((o, i) => (
            <AnswerOption
              key={o.id}
              option={o}
              name={`gen-${generated.id}`}
              state={stateFor(i)}
              disabled={Boolean(reveal) || pending}
              onSelect={() => setSelected(i)}
            />
          ))}
        </fieldset>
        {!reveal && (
          <Button onClick={check} disabled={selected === null} loading={pending}>
            {t.generated.check}
          </Button>
        )}
        {reveal && (
          <div
            className={cn(
              'rounded-lg border p-4',
              reveal.isCorrect ? 'border-success/30 bg-success-soft/60' : 'border-destructive/30 bg-destructive-soft/60',
            )}
            role="status"
          >
            <p className="flex items-center gap-2 font-medium">
              {reveal.isCorrect ? (
                <CheckCircle2 className="size-4 text-success" aria-hidden />
              ) : (
                <XCircle className="size-4 text-destructive" aria-hidden />
              )}
              {reveal.isCorrect ? t.generated.correct : t.generated.incorrect}
            </p>
            <p className="mt-2 text-[13px] font-medium text-muted-foreground">{t.generated.explanation}</p>
            <RichText source={reveal.explanation} className="reading mt-1 text-[15px] text-foreground" />
          </div>
        )}
      </div>
    </article>
  )
}
