'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api/client'
import { useDict } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/dict'
import { practiceDict } from '@/lib/i18n/dictionaries/practice'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { NativeSelect, Label } from '@/components/ui/input'
import { Alert } from '@/components/ui/card'
import { UpgradeNotice } from '@/components/subscription/upgrade-notice'
import type { SubjectCode } from '@/types/questions'
import { errorDetails, isPlanLimit, practiceErrorMessage } from './error-message'

export type BuilderTaxonomy = {
  subjects: Array<{ code: SubjectCode; name: string }>
  domains: Array<{ id: string; subjectCode: SubjectCode; name: string }>
  skills: Array<{ id: string; domainId: string; name: string }>
}

/** Published question counts keyed by `${skillId}:${difficulty}` (no ids or content). */
export type AvailabilityIndex = Record<string, number>

type Difficulty = 'mixed' | 'easy' | 'medium' | 'hard'
const DIFFICULTIES: Difficulty[] = ['mixed', 'easy', 'medium', 'hard']

export function PracticeBuilder({
  taxonomy,
  availability,
  lengths,
  remainingToday,
  initial,
}: {
  taxonomy: BuilderTaxonomy
  availability: AvailabilityIndex
  lengths: number[]
  /** null = unlimited */
  remainingToday: number | null
  initial: { subject: SubjectCode; domainId: string; skillId: string }
}) {
  const t = useDict(practiceDict)
  const router = useRouter()
  const [subject, setSubject] = React.useState<SubjectCode>(initial.subject)
  const [domainId, setDomainId] = React.useState(initial.domainId)
  const [skillId, setSkillId] = React.useState(initial.skillId)
  const [difficulty, setDifficulty] = React.useState<Difficulty>('mixed')
  const [count, setCount] = React.useState(() => lengths.find((n) => n === 10) ?? lengths[0] ?? 10)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [limit, setLimit] = React.useState<{ used: number; limit: number } | null>(null)

  const domains = taxonomy.domains.filter((d) => d.subjectCode === subject)
  const skills = taxonomy.skills.filter((s) => (domainId ? s.domainId === domainId : domains.some((d) => d.id === s.domainId)))

  const levels: Array<'easy' | 'medium' | 'hard'> = difficulty === 'mixed' ? ['easy', 'medium', 'hard'] : [difficulty]
  let available = 0
  for (const s of skillId ? [skillId] : skills.map((x) => x.id)) for (const d of levels) available += availability[`${s}:${d}`] ?? 0

  const effective = Math.min(count, available, remainingToday ?? Number.POSITIVE_INFINITY)

  async function start(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await apiFetch<{ attemptId: string }>('/api/practice/start', {
        method: 'POST',
        body: {
          mode: 'custom',
          subjectCode: subject,
          ...(domainId ? { domainId } : {}),
          ...(skillId ? { skillId } : {}),
          difficulty,
          count,
        },
      })
      router.push(`/dashboard/practice/${res.attemptId}`)
    } catch (err) {
      setPending(false)
      if (isPlanLimit(err)) {
        const d = errorDetails<{ used: number; limit: number }>(err)
        setLimit({ used: d.used ?? 0, limit: d.limit ?? 0 })
      } else {
        setError(practiceErrorMessage(err, t.errors))
      }
    }
  }

  return (
    <form onSubmit={start} className="space-y-5">
      <fieldset>
        <legend className="text-sm font-medium">{t.builder.subject}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-md">
          {taxonomy.subjects.map((s) => (
            <label
              key={s.code}
              className={cn(
                'flex h-11 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                subject === s.code ? 'border-primary bg-primary-soft text-primary' : 'border-border hover:bg-muted',
              )}
            >
              <input
                type="radio"
                name="subject"
                value={s.code}
                checked={subject === s.code}
                onChange={() => {
                  setSubject(s.code)
                  setDomainId('')
                  setSkillId('')
                }}
                className="sr-only"
              />
              {t.subjects[s.code]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid grid-cols-1 gap-1.5">
          <Label htmlFor="practice-domain">{t.builder.domain}</Label>
          <NativeSelect
            id="practice-domain"
            value={domainId}
            onChange={(e) => {
              setDomainId(e.target.value)
              setSkillId('')
            }}
          >
            <option value="">{t.builder.allDomains}</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <Label htmlFor="practice-skill">{t.builder.skill}</Label>
          <NativeSelect
            id="practice-skill"
            value={skillId}
            onChange={(e) => {
              const next = e.target.value
              setSkillId(next)
              const owner = taxonomy.skills.find((s) => s.id === next)
              if (owner) setDomainId(owner.domainId)
            }}
          >
            <option value="">{t.builder.allSkills}</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">{t.builder.difficulty}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DIFFICULTIES.map((d) => (
            <label
              key={d}
              className={cn(
                'flex h-10 min-w-20 cursor-pointer items-center justify-center rounded-md border px-3 text-sm transition-colors',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                difficulty === d ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-border hover:bg-muted',
              )}
            >
              <input type="radio" name="difficulty" value={d} checked={difficulty === d} onChange={() => setDifficulty(d)} className="sr-only" />
              {t.difficulty[d]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">{t.builder.length}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {lengths.map((n) => (
            <label
              key={n}
              className={cn(
                'flex h-10 min-w-14 cursor-pointer items-center justify-center rounded-md border px-3 text-sm tabular transition-colors',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                count === n ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-border hover:bg-muted',
              )}
            >
              <input type="radio" name="count" value={n} checked={count === n} onChange={() => setCount(n)} className="sr-only" />
              <span aria-hidden>{n}</span>
              <span className="sr-only">{format(t.builder.lengthOption, { n })}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1 text-[13px] text-muted-foreground" aria-live="polite">
        {available === 0 ? (
          <p className="text-warning-foreground">{t.builder.noneAvailable}</p>
        ) : (
          <>
            <p className="tabular">{available === 1 ? t.builder.availableOne : format(t.builder.available, { n: available })}</p>
            {remainingToday !== null && remainingToday < count && remainingToday <= available ? (
              <p>{format(t.builder.cappedByLimit, { n: remainingToday })}</p>
            ) : available < count ? (
              <p>{format(t.builder.shorter, { n: available })}</p>
            ) : null}
          </>
        )}
      </div>

      {limit && <UpgradeNotice title={t.usage.limitTitle} description={format(t.usage.limitBody, { limit: limit.limit })} actionLabel={t.usage.seePlans} />}
      {error && (
        <Alert variant="destructive" className="py-3">
          {error}
        </Alert>
      )}

      <Button type="submit" size="lg" loading={pending} disabled={available === 0 || effective <= 0 || remainingToday === 0} className="w-full sm:w-auto">
        {t.builder.start}
      </Button>
    </form>
  )
}
