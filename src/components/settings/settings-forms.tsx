'use client'

import * as React from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { FormField, Input, NativeSelect } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { useDict, useLocale } from '@/lib/i18n/client'
import { format, resolveDict } from '@/lib/i18n/dict'
import { LOCALE_NAMES } from '@/lib/i18n/config'
import { setLocaleAction } from '@/lib/i18n/actions'
import { settingsDict } from '@/lib/i18n/dictionaries/settings'
import { authDict } from '@/lib/i18n/dictionaries/auth'
import type { ActionResult } from '@/lib/api/errors'
import { changePasswordSchema, type ChangePasswordInput } from '@/features/auth/schemas'
import { goalsSectionSchema, profileSectionSchema, TIME_ZONES, type ProfileSectionInput } from '@/features/profile/schemas'
import { changePasswordAction, updateGoalsSectionAction, updateProfileSectionAction } from '@/features/profile/actions'
import { examDateSchema, type Subject } from '@/features/onboarding/schemas'
import { ChoiceCards } from '@/components/onboarding/choice-cards'
import {
  DailyMinutesField,
  ExamDateField,
  SubjectsField,
  TargetScoreField,
  useGoalMessages,
} from '@/components/onboarding/goal-fields'
import { PasswordChecklist, PasswordInput } from '@/components/auth/password-input'

function firstErrors(result: ActionResult): Record<string, string> {
  if (result.ok) return {}
  return Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k, v[0] ?? '']))
}

function FormMessage({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive-soft px-3.5 py-2.5 text-sm text-foreground">
      {message}
    </p>
  )
}

// Profile ------------------------------------------------------------------------------------------

export function ProfileSettingsForm({ fullName, email, timezone }: { fullName: string; email: string; timezone: string }) {
  const t = useDict(settingsDict)
  const { message } = useGoalMessages()
  const [pending, startTransition] = React.useTransition()
  const [formError, setFormError] = React.useState<string | null>(null)
  const knownZone = (TIME_ZONES as readonly string[]).includes(timezone)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileSectionInput>({
    resolver: zodResolver(profileSectionSchema),
    defaultValues: { fullName, timezone: (knownZone ? timezone : 'Asia/Tashkent') as ProfileSectionInput['timezone'] },
  })

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const result = await updateProfileSectionAction(values)
      if (result.ok) {
        toast.success(result.message ?? t.profile.saved)
        reset(values)
      } else {
        for (const [field, msg] of Object.entries(firstErrors(result))) {
          if (field === 'fullName' || field === 'timezone') setError(field, { message: msg })
        }
        setFormError(result.error)
      }
    })
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-5">
      <FormMessage message={formError} />
      <FormField id="settings-name" label={t.profile.fullName} error={message(errors.fullName?.message)}>
        {(aria) => <Input {...aria} {...register('fullName')} autoComplete="name" />}
      </FormField>
      <FormField id="settings-email" label={t.profile.email} description={t.profile.emailHint}>
        {(aria) => <Input {...aria} value={email} readOnly className="bg-muted/60 text-muted-foreground" />}
      </FormField>
      <FormField id="settings-timezone" label={t.profile.timezone} description={t.profile.timezoneHint} error={message(errors.timezone?.message)}>
        {(aria) => (
          <NativeSelect {...aria} {...register('timezone')}>
            {!knownZone && (
              <option value="" disabled>
                {format(t.profile.currentZone, { zone: timezone })}
              </option>
            )}
            {TIME_ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, ' ')}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <div>
        <Button type="submit" loading={pending} disabled={!isDirty && knownZone}>
          {t.profile.save}
        </Button>
      </div>
    </form>
  )
}

// Learning goals -----------------------------------------------------------------------------------

export function GoalsSettingsForm({
  today,
  initial,
}: {
  today: string
  initial: { targetScore: number | null; examDate: string | null; dailyStudyMinutes: number | null; preferredSubjects: Subject[] }
}) {
  const t = useDict(settingsDict)
  const [pending, startTransition] = React.useTransition()
  const [formError, setFormError] = React.useState<string | null>(null)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [targetScore, setTargetScore] = React.useState<number>(initial.targetScore ?? 1200)
  const [examText, setExamText] = React.useState(initial.examDate && initial.examDate > today ? initial.examDate : '')
  const [undecided, setUndecided] = React.useState(!initial.examDate || initial.examDate <= today)
  const [minutes, setMinutes] = React.useState<number | null>(initial.dailyStudyMinutes)
  const [subjects, setSubjects] = React.useState<Subject[]>(initial.preferredSubjects)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const examDate = undecided ? null : examText || null
    const local: Record<string, string> = {}
    const parsed = goalsSectionSchema.safeParse({ targetScore, examDate, dailyStudyMinutes: minutes, preferredSubjects: subjects })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) local[String(issue.path[0])] ??= issue.message
    }
    if (!undecided && !examText) local.examDate = 'dateRequired'
    else if (examDate && !local.examDate) {
      const dateCheck = examDateSchema(today).safeParse(examDate)
      if (!dateCheck.success) local.examDate = dateCheck.error.issues[0]?.message ?? 'dateInvalid'
    }
    setErrors(local)
    if (Object.keys(local).length > 0) return
    setFormError(null)
    startTransition(async () => {
      const result = await updateGoalsSectionAction({
        targetScore,
        examDate,
        dailyStudyMinutes: minutes as number,
        preferredSubjects: subjects,
      })
      if (result.ok) toast.success(result.message ?? t.goals.saved)
      else {
        setErrors(firstErrors(result))
        setFormError(result.error)
      }
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-8">
      <FormMessage message={formError} />
      <TargetScoreField id="settings-target" value={targetScore} onChange={setTargetScore} error={errors.targetScore} />
      <ExamDateField
        id="settings-exam"
        today={today}
        date={examText}
        undecided={undecided}
        onDateChange={setExamText}
        onUndecidedChange={setUndecided}
        error={errors.examDate}
      />
      <DailyMinutesField id="settings-minutes" value={minutes} onChange={setMinutes} error={errors.dailyStudyMinutes} />
      <SubjectsField id="settings-subjects" value={subjects} onChange={setSubjects} error={errors.preferredSubjects} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" loading={pending}>
          {t.goals.save}
        </Button>
        <p className="text-[13px] text-muted-foreground">
          {t.goals.planNote}{' '}
          <Link href="/dashboard/study-plan" className="font-medium text-primary underline-offset-4 hover:underline">
            {t.goals.planLink}
          </Link>
        </p>
      </div>
    </form>
  )
}

// Language -----------------------------------------------------------------------------------------

export function LanguageSettingsForm() {
  const t = useDict(settingsDict)
  const locale = useLocale()
  const [pending, startTransition] = React.useTransition()
  return (
    <div aria-busy={pending || undefined}>
      <ChoiceCards<'en' | 'uz'>
        name="settings-locale"
        legend={t.language.title}
        value={locale === 'uz' ? 'uz' : 'en'}
        columns={2}
        onChange={(value) =>
          startTransition(async () => {
            await setLocaleAction(value)
            toast.success(resolveDict(settingsDict, value).language.saved)
          })
        }
        options={[
          { value: 'en', title: LOCALE_NAMES.en, body: 'English interface and explanations' },
          { value: 'uz', title: LOCALE_NAMES.uz, body: "O'zbekcha interfeys va tushuntirishlar" },
        ]}
      />
    </div>
  )
}

// Security -----------------------------------------------------------------------------------------

export function ChangePasswordForm({ hasPassword, noPasswordNote }: { hasPassword: boolean; noPasswordNote?: string }) {
  const t = useDict(settingsDict)
  const a = useDict(authDict)
  const authErrors = a.errors as Record<string, string>
  const translate = (m?: string) => (m ? (authErrors[m] ?? m) : undefined)
  const [pending, startTransition] = React.useTransition()
  const [formError, setFormError] = React.useState<string | null>(null)
  const [newPassword, setNewPassword] = React.useState('')
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  if (!hasPassword) return <p className="text-sm text-muted-foreground">{noPasswordNote ?? t.security.googleNote}</p>

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const result = await changePasswordAction(values)
      if (result.ok) {
        toast.success(result.message ?? t.security.changed)
        reset()
        setNewPassword('')
      } else {
        for (const [field, msg] of Object.entries(firstErrors(result))) {
          if (field === 'currentPassword' || field === 'newPassword' || field === 'confirmPassword') setError(field, { message: msg })
        }
        setFormError(result.error)
      }
    })
  })

  const newField = register('newPassword')
  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 max-w-md gap-4">
      <FormMessage message={formError} />
      <FormField id="settings-current-password" label={t.security.currentPassword} error={translate(errors.currentPassword?.message)}>
        {(aria) => (
          <PasswordInput
            {...aria}
            {...register('currentPassword')}
            autoComplete="current-password"
            showLabel={a.fields.showPassword}
            hideLabel={a.fields.hidePassword}
          />
        )}
      </FormField>
      <div className="grid grid-cols-1 gap-2">
        <FormField id="settings-new-password" label={t.security.newPassword} error={translate(errors.newPassword?.message)}>
          {(aria) => (
            <PasswordInput
              {...aria}
              aria-describedby={[aria['aria-describedby'], 'settings-password-rules'].filter(Boolean).join(' ')}
              {...newField}
              onChange={(e) => {
                setNewPassword(e.target.value)
                void newField.onChange(e)
              }}
              autoComplete="new-password"
              showLabel={a.fields.showPassword}
              hideLabel={a.fields.hidePassword}
            />
          )}
        </FormField>
        <PasswordChecklist id="settings-password-rules" password={newPassword} labels={a.passwordRules} />
      </div>
      <FormField id="settings-confirm-password" label={t.security.confirmPassword} error={translate(errors.confirmPassword?.message)}>
        {(aria) => (
          <PasswordInput
            {...aria}
            {...register('confirmPassword')}
            autoComplete="new-password"
            showLabel={a.fields.showPassword}
            hideLabel={a.fields.hidePassword}
          />
        )}
      </FormField>
      <div>
        <Button type="submit" loading={pending}>
          {t.security.submit}
        </Button>
      </div>
    </form>
  )
}
