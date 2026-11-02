'use client'

import Link from 'next/link'
import { ArrowLeft, Coffee, Loader2 } from 'lucide-react'
import { formatClock } from '@/lib/utils'
import { format } from '@/lib/i18n/dict'
import { useDict } from '@/lib/i18n/client'
import { examsDict } from '@/lib/i18n/dictionaries/exams'
import { Button } from '@/components/ui/button'
import { Alert, Badge } from '@/components/ui/card'
import { Logo } from '@/components/layout/logo'
import type { ExamOverview } from '@/features/exams/queries'
import type { ExamSection } from '@/features/exams/machine'

export type RunnerError = { message: string; upgrade?: boolean }

function Frame({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex h-14 items-center border-b border-border px-4 sm:px-6">
        <Logo href="/dashboard" />
      </header>
      <main className="flex flex-1 justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="w-full max-w-2xl">{children}</div>
      </main>
      {footer}
    </div>
  )
}

function questionsLabel(t: typeof examsDict.en, min: number, max: number) {
  return min === max ? format(t.common.questions, { n: max }) : format(t.common.questionsRange, { min, max })
}

export function InstructionsScreen({
  overview,
  resuming,
  busy,
  error,
  onStart,
}: {
  overview: ExamOverview
  resuming: boolean
  busy: boolean
  error: RunnerError | null
  onStart: () => void
}) {
  const t = useDict(examsDict)
  const r = t.runner
  const notes = [
    r.intro,
    overview.isAdaptive ? r.adaptiveNote : r.fixedNote,
    ...(overview.isFullLength ? [] : [r.shortenedNote]),
    r.calculatorNote,
    overview.breakSeconds > 0 ? format(r.breakNote, { minutes: Math.round(overview.breakSeconds / 60) }) : r.noBreakNote,
    r.timeNote,
    r.savingNote,
  ]
  return (
    <Frame>
      <Link href="/dashboard/mock-exams" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden /> {r.backToList}
      </Link>
      <h1 className="mt-4 text-[28px] font-semibold leading-tight sm:text-[32px]">{overview.title}</h1>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="navy">{overview.isFullLength ? t.common.fullLength : t.common.shortened}</Badge>
        <Badge variant="outline">{overview.isAdaptive ? t.common.adaptive : t.common.fixed}</Badge>
      </div>
      {overview.description && <p className="mt-4 text-[15px] text-muted-foreground">{overview.description}</p>}

      <section className="mt-8">
        <h2 className="text-[19px] font-semibold">{r.structureTitle}</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <tbody>
              {overview.structure.sections.map((s, i) => (
                <tr key={s.section} className="border-b border-border last:border-0">
                  <th scope="row" className="w-2/5 px-4 py-3 text-left align-top font-medium">
                    <span className="mr-2 inline-flex size-6 items-center justify-center rounded-md bg-navy-900 text-xs font-semibold text-white tabular dark:bg-primary">
                      {i + 1}
                    </span>
                    {t.sections[s.section]}
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">
                    <p>
                      <span className="text-foreground">{format(r.module, { n: 1 })}</span> ·{' '}
                      {format(r.sectionRow, {
                        questions: format(t.common.questions, { n: s.module1.questions }),
                        minutes: format(t.common.minutes, { n: s.module1.minutes }),
                      })}
                    </p>
                    <p className="mt-0.5">
                      <span className="text-foreground">{format(r.module, { n: 2 })}</span> ·{' '}
                      {format(r.sectionRow, {
                        questions: questionsLabel(t, s.module2.minQuestions, s.module2.maxQuestions),
                        minutes: format(t.common.minutes, { n: s.module2.minutes }),
                      })}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground tabular">
          {format(t.list.totalLine, { questions: overview.structure.totalQuestions, minutes: overview.structure.totalMinutes })}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-[19px] font-semibold">{r.howTitle}</h2>
        <ul className="mt-3 space-y-2 text-[15px] leading-relaxed">
          {notes.map((n) => (
            <li key={n} className="flex gap-3">
              <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <Alert
          className="mt-6"
          variant={error.upgrade ? 'primary' : 'destructive'}
          title={error.message}
          action={
            error.upgrade ? (
              <Button asChild size="sm">
                <Link href="/dashboard/subscription">{t.list.seePlans}</Link>
              </Button>
            ) : undefined
          }
        />
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={onStart} loading={busy} className="sm:min-w-52">
          {resuming ? r.resume : r.start}
        </Button>
      </div>
    </Frame>
  )
}

export function BreakScreen({
  remaining,
  nextSection,
  questions,
  minutes,
  busy,
  onResume,
}: {
  remaining: number
  nextSection: ExamSection
  questions: number
  minutes: number
  busy: boolean
  onResume: () => void
}) {
  const t = useDict(examsDict)
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-navy-900 px-4 text-center text-white">
      <Coffee className="size-7 text-accent" aria-hidden />
      <h1 className="mt-4 text-[28px] font-semibold">{t.runner.breakTitle}</h1>
      <p className="mt-6 font-sans text-6xl font-semibold tabular" role="timer" aria-live="off">
        {formatClock(remaining)}
      </p>
      <p className="mt-6 max-w-md text-[15px] text-white/75">{t.runner.breakBody}</p>
      <p className="mt-3 text-sm text-white/60">
        {format(t.runner.breakNext, {
          questions: format(t.common.questions, { n: questions }),
          minutes: format(t.common.minutes, { n: minutes }),
        })}
        {nextSection !== 'math' && ` · ${t.sections[nextSection]}`}
      </p>
      <Button size="lg" className="mt-8" onClick={onResume} loading={busy}>
        {t.runner.resumeTesting}
      </Button>
    </div>
  )
}

export function ReadyScreen({
  section,
  minutes,
  questions,
  busy,
  onBegin,
}: {
  section: ExamSection
  minutes: number
  questions: number
  busy: boolean
  onBegin: () => void
}) {
  const t = useDict(examsDict)
  return (
    <Frame>
      <div className="flex flex-col items-start">
        <Badge variant="outline">{format(t.common.questions, { n: questions })}</Badge>
        <h1 className="mt-4 text-[28px] font-semibold">{format(t.runner.readyTitle, { section: t.sections[section] })}</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{format(t.runner.readyBody, { minutes })}</p>
        <Button size="lg" className="mt-8 sm:min-w-52" onClick={onBegin} loading={busy}>
          {t.runner.beginSection}
        </Button>
      </div>
    </Frame>
  )
}

export function CenterMessage({ title, body, spinner, action }: { title: string; body?: string; spinner?: boolean; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-surface px-4 text-center" role="status">
      {spinner && <Loader2 className="size-6 animate-spin text-primary" aria-hidden />}
      <p className="text-lg font-semibold">{title}</p>
      {body && <p className="max-w-md text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}
