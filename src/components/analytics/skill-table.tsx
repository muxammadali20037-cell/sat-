'use client'

import * as React from 'react'
import Link from 'next/link'
import { ProgressBar } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { format } from '@/lib/i18n/dict'
import { useDict } from '@/lib/i18n/client'
import { analyticsDict } from '@/lib/i18n/dictionaries/analytics'
import { percent } from '@/features/dashboard/format'
import { compareFramework, compareWeakest, practiceHref, type SkillStat, type Tally } from '@/features/analytics/aggregate'

type DomainRow = { id: string; name: string; subjectCode: 'math' | 'reading_writing'; tally: Tally }

const thCls = 'h-10 whitespace-nowrap px-4 text-left text-xs font-medium text-muted-foreground'

/** Per-domain and per-skill accuracy, sortable by weakest first or course order. */
export function SkillAccuracyTable({ domains, skills, lastPractised }: { domains: DomainRow[]; skills: SkillStat[]; lastPractised: Record<string, string> }) {
  const t = useDict(analyticsDict)
  const [sort, setSort] = React.useState<'weakest' | 'framework'>('weakest')
  const [onlyPractised, setOnlyPractised] = React.useState(true)
  const practisedCount = skills.filter((s) => s.answered > 0).length

  const sortedDomains = React.useMemo(() => {
    const list = [...domains]
    if (sort === 'weakest') {
      list.sort((a, b) => (a.tally.accuracy ?? Number.POSITIVE_INFINITY) - (b.tally.accuracy ?? Number.POSITIVE_INFINITY))
    }
    return list
  }, [domains, sort])

  const sortedSkills = React.useMemo(() => {
    const list = skills.filter((s) => !onlyPractised || s.answered > 0)
    return list.sort(sort === 'weakest' ? compareWeakest : compareFramework)
  }, [skills, sort, onlyPractised])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <fieldset className="flex items-center gap-1">
          <legend className="sr-only">{t.skills.sortLabel}</legend>
          <span className="mr-2 text-[13px] text-muted-foreground" aria-hidden>
            {t.skills.sortLabel}
          </span>
          {(['weakest', 'framework'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={sort === value}
              onClick={() => setSort(value)}
              className={cn(
                'h-8 rounded-md border px-3 text-[13px] font-medium transition-colors',
                sort === value ? 'border-primary bg-primary-soft text-primary' : 'border-border text-foreground hover:bg-muted',
              )}
            >
              {value === 'weakest' ? t.skills.sortWeakest : t.skills.sortFramework}
            </button>
          ))}
        </fieldset>
        {practisedCount < skills.length && (
          <label className="flex items-center gap-2 text-[13px] text-foreground">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={!onlyPractised} onChange={(e) => setOnlyPractised(!e.target.checked)} />
            {t.skills.showAll}
          </label>
        )}
      </div>

      <div>
        <h3 className="mb-2 font-sans text-sm font-semibold text-foreground">{t.skills.domainsTitle}</h3>
        <ul className="grid grid-cols-1 gap-x-8 gap-y-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
          {sortedDomains.map((d) => (
            <li key={d.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-foreground">{d.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {d.tally.answered > 0 ? (
                    <>
                      <span className="font-semibold tabular text-foreground">{percent(d.tally.accuracy)}</span> · {d.tally.answered}
                    </>
                  ) : (
                    t.skills.notPractised
                  )}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{t.subjects[d.subjectCode]}</p>
              {d.tally.answered > 0 && <ProgressBar value={(d.tally.accuracy ?? 0) * 100} size="sm" className="mt-1.5" label={`${d.name} ${percent(d.tally.accuracy)}`} />}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-sans text-sm font-semibold text-foreground">{t.skills.skillsTitle}</h3>
        <div className="overflow-x-auto relative rounded-lg border border-border bg-card">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <caption className="sr-only">{t.skills.title}</caption>
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th scope="col" className={thCls}>
                  {t.skills.skill}
                </th>
                <th scope="col" className={cn(thCls, 'hidden md:table-cell')}>
                  {t.skills.domain}
                </th>
                <th scope="col" className={cn(thCls, 'text-right')} aria-sort={sort === 'weakest' ? 'ascending' : 'none'}>
                  {t.skills.accuracy}
                </th>
                <th scope="col" className={cn(thCls, 'text-right')}>
                  {t.skills.answered}
                </th>
                <th scope="col" className={cn(thCls, 'hidden lg:table-cell')}>
                  {t.skills.lastPractised}
                </th>
                <th scope="col" className={thCls}>
                  <span className="sr-only">{t.skills.practise}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedSkills.map((s) => (
                <tr key={s.skillId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 align-middle">
                    <p className="font-medium text-foreground">{s.skillName}</p>
                    <p className="text-xs text-muted-foreground md:hidden">{s.domainName}</p>
                    {s.answered > 0 && <ProgressBar value={(s.accuracy ?? 0) * 100} size="sm" className="mt-1.5 max-w-48" label={`${s.skillName} ${percent(s.accuracy)}`} />}
                  </td>
                  <td className="hidden px-4 py-3 align-middle text-muted-foreground md:table-cell">{s.domainName}</td>
                  <td className="px-4 py-3 text-right align-middle font-semibold tabular text-foreground">{s.answered > 0 ? percent(s.accuracy) : '—'}</td>
                  <td className="px-4 py-3 text-right align-middle tabular text-muted-foreground">{s.answered}</td>
                  <td className="hidden px-4 py-3 align-middle text-muted-foreground lg:table-cell">{lastPractised[s.skillId] ?? '—'}</td>
                  <td className="px-4 py-3 text-right align-middle">
                    <Link
                      href={practiceHref(s)}
                      className="text-[13px] font-medium text-primary hover:underline"
                      aria-label={format(t.skills.practiseSkill, { skill: s.skillName })}
                    >
                      {t.skills.practise}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
