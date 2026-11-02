'use client'

import * as React from 'react'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { useLocale } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/dict'
import { LOCALE_NAMES } from '@/lib/i18n/config'
import { setLocaleAction } from '@/lib/i18n/actions'
import { saveOnboardingAction } from '@/features/onboarding/actions'
import {
  ONBOARDING_STEP_FIELDS,
  validateOnboardingStep,
  type OnboardingDraft,
  type SatLevel,
} from '@/features/onboarding/schemas'
import { ChoiceCards } from './choice-cards'
import { DailyMinutesField, ExamDateField, SubjectsField, TargetScoreField, useGoalMessages } from './goal-fields'

type Initial = Omit<OnboardingDraft, 'examDate'> & { examDate: string | null }

const TOTAL = ONBOARDING_STEP_FIELDS.length

/** Seven-step onboarding with per-step validation (same Zod schema as the server action). */
export function OnboardingWizard({ initial, today, next }: { initial: Initial; today: string; next?: string }) {
  const { t, message } = useGoalMessages()
  const locale = useLocale()
  const [step, setStep] = React.useState(0)
  const [draft, setDraft] = React.useState<OnboardingDraft>({ ...initial, locale: locale === 'uz' ? 'uz' : 'en' })
  const [examText, setExamText] = React.useState(initial.examDate ?? '')
  const [undecided, setUndecided] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [localePending, startLocaleTransition] = React.useTransition()
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  const firstRender = React.useRef(true)

  // Move focus to the new step's heading so keyboard and screen-reader users follow along.
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [step])

  const update = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((e) => {
      if (!(key in e)) return e
      const rest = { ...e }
      delete rest[key]
      return rest
    })
  }

  const currentDraft = (): OnboardingDraft => ({ ...draft, examDate: undecided ? null : examText || null })

  const validateStep = (index: number): Record<string, string> => {
    const value = currentDraft()
    if (index === 4 && !undecided && !examText) return { examDate: 'dateRequired' }
    return validateOnboardingStep(index, value, today)
  }

  const goNext = () => {
    const stepErrors = validateStep(step)
    setErrors(stepErrors)
    if (Object.keys(stepErrors).length > 0) return
    if (step < TOTAL - 1) {
      setStep(step + 1)
      return
    }
    // Final step: validate everything once more, then save.
    for (let i = 0; i < TOTAL; i++) {
      const e = validateStep(i)
      if (Object.keys(e).length > 0) {
        setErrors(e)
        setStep(i)
        return
      }
    }
    setFormError(null)
    const payload = currentDraft()
    startTransition(async () => {
      const result = await saveOnboardingAction({
        fullName: payload.fullName,
        locale: payload.locale,
        satLevel: payload.satLevel as SatLevel,
        targetScore: payload.targetScore,
        examDate: payload.examDate,
        dailyStudyMinutes: payload.dailyStudyMinutes as number,
        preferredSubjects: payload.preferredSubjects,
        next,
      })
      if (!result.ok) {
        const fieldErrors = Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k, v[0] ?? '']))
        setErrors(fieldErrors)
        setFormError(result.error)
        const firstBad = ONBOARDING_STEP_FIELDS.findIndex((fields) => fields.some((f) => f in fieldErrors))
        if (firstBad >= 0) setStep(firstBad)
      }
    })
  }

  const chooseLocale = (value: 'en' | 'uz') => {
    update('locale', value)
    // Apply immediately: the whole wizard re-renders in the chosen language, keeping its state.
    startLocaleTransition(() => setLocaleAction(value))
  }

  const steps = t.steps
  const titles = [steps.name.title, steps.language.title, steps.level.title, steps.target.title, steps.examDate.title, steps.minutes.title, steps.subjects.title]
  const descriptions = [
    steps.name.description,
    steps.language.description,
    steps.level.description,
    steps.target.description,
    steps.examDate.description,
    steps.minutes.description,
    steps.subjects.description,
  ]

  return (
    <div className="w-full">
      <div className="mb-8">
        <p className="text-[13px] font-medium text-muted-foreground tabular" aria-live="polite">
          {format(t.progress, { step: step + 1, total: TOTAL })}
        </p>
        <ol className="mt-2.5 grid grid-cols-7 gap-1.5" aria-hidden>
          {Array.from({ length: TOTAL }).map((_, i) => (
            <li key={i} className={cn('h-1.5 rounded-full transition-colors duration-150', i <= step ? 'bg-primary' : 'bg-muted')} />
          ))}
        </ol>
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          goNext()
        }}
      >
        <h1 ref={headingRef} tabIndex={-1} className="text-[24px] font-semibold leading-tight text-foreground focus:outline-none sm:text-[28px]">
          {titles[step]}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{descriptions[step]}</p>

        <div className="mt-7 min-h-48">
          {step === 0 && (
            <div className="grid grid-cols-1 max-w-md gap-1.5">
              <Label htmlFor="onb-name">{steps.name.label}</Label>
              <Input
                id="onb-name"
                value={draft.fullName}
                autoComplete="name"
                onChange={(e) => update('fullName', e.target.value)}
                aria-invalid={errors.fullName ? true : undefined}
                aria-describedby={errors.fullName ? 'onb-name-error' : undefined}
              />
              {errors.fullName && (
                <p id="onb-name-error" role="alert" className="text-[13px] text-destructive">
                  {message(errors.fullName)}
                </p>
              )}
            </div>
          )}

          {step === 1 && (
            <ChoiceCards<'en' | 'uz'>
              name="onb-locale"
              legend={steps.language.title}
              value={draft.locale}
              columns={2}
              onChange={chooseLocale}
              options={[
                { value: 'en', title: LOCALE_NAMES.en, body: 'Interface in English' },
                { value: 'uz', title: LOCALE_NAMES.uz, body: "Interfeys o'zbek tilida" },
              ]}
            />
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 gap-3">
              <ChoiceCards<SatLevel>
                name="onb-level"
                legend={steps.level.title}
                value={draft.satLevel}
                invalid={Boolean(errors.satLevel)}
                describedBy={errors.satLevel ? 'onb-level-error' : undefined}
                onChange={(v) => update('satLevel', v)}
                options={(['new', 'some_prep', 'experienced'] as const).map((level) => ({
                  value: level,
                  title: steps.level.options[level].title,
                  body: steps.level.options[level].body,
                }))}
              />
              {errors.satLevel && (
                <p id="onb-level-error" role="alert" className="text-[13px] text-destructive">
                  {message(errors.satLevel)}
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <TargetScoreField id="onb-target" value={draft.targetScore} onChange={(v) => update('targetScore', v)} error={errors.targetScore} />
          )}

          {step === 4 && (
            <ExamDateField
              id="onb-exam"
              today={today}
              date={examText}
              undecided={undecided}
              onDateChange={(v) => {
                setExamText(v)
                update('examDate', v || null)
              }}
              onUndecidedChange={(v) => {
                setUndecided(v)
                update('examDate', v ? null : examText || null)
              }}
              error={errors.examDate}
            />
          )}

          {step === 5 && (
            <DailyMinutesField
              id="onb-minutes"
              value={draft.dailyStudyMinutes}
              onChange={(v) => update('dailyStudyMinutes', v)}
              error={errors.dailyStudyMinutes}
            />
          )}

          {step === 6 && (
            <SubjectsField
              id="onb-subjects"
              value={draft.preferredSubjects}
              onChange={(v) => update('preferredSubjects', v)}
              error={errors.preferredSubjects}
            />
          )}
        </div>

        {formError && (
          <p role="alert" className="mt-6 rounded-lg border border-destructive/25 bg-destructive-soft px-3.5 py-3 text-sm text-foreground">
            {formError}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
          {step > 0 ? (
            <Button type="button" variant="ghost" onClick={() => setStep(step - 1)} disabled={pending}>
              <ArrowLeft aria-hidden />
              {t.back}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" size="lg" loading={pending} disabled={localePending && step === 1}>
            {pending ? t.saving : step === TOTAL - 1 ? t.finish : t.next}
          </Button>
        </div>
      </form>
    </div>
  )
}
