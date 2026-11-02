'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { FormField, Input, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/controls'
import { Alert } from '@/components/ui/card'
import { toast } from '@/components/ui/toast'
import { createExamAction, updateExamAction } from '@/features/exams/admin-actions'

type Values = {
  title: string
  slug: string
  description: string
  isAdaptive: boolean
  isFullLength: boolean
  routingThresholdPercent: string
  breakMinutes: string
  rwModuleMinutes: string
  mathModuleMinutes: string
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

/** Create (all fields) or edit (settings only; structure locked unless the exam is a draft). */
export function ExamForm({
  mode,
  examId,
  initial,
  structureLocked = false,
  canEdit = true,
}: {
  mode: 'create' | 'edit'
  examId?: string
  initial?: Partial<Values>
  structureLocked?: boolean
  canEdit?: boolean
}) {
  const router = useRouter()
  const [values, setValues] = React.useState<Values>({
    title: '',
    slug: '',
    description: '',
    isAdaptive: true,
    isFullLength: true,
    routingThresholdPercent: '60',
    breakMinutes: '10',
    rwModuleMinutes: '32',
    mathModuleMinutes: '35',
    ...initial,
  })
  const [slugTouched, setSlugTouched] = React.useState(mode === 'edit')
  const [errors, setErrors] = React.useState<Record<string, string[]>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const disabled = !canEdit || pending

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((v) => ({ ...v, [key]: value, ...(key === 'title' && !slugTouched ? { slug: slugify(String(value)) } : {}) }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const payload = {
      title: values.title,
      slug: values.slug,
      description: values.description,
      routingThreshold: Number(values.routingThresholdPercent) / 100,
      breakMinutes: values.breakMinutes,
      isFullLength: values.isFullLength,
      isAdaptive: values.isAdaptive,
      rwModuleMinutes: values.rwModuleMinutes,
      mathModuleMinutes: values.mathModuleMinutes,
    }
    startTransition(async () => {
      const res = mode === 'create' ? await createExamAction(payload) : await updateExamAction(examId!, payload)
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {})
        setFormError(res.error)
        return
      }
      setErrors({})
      toast.success(res.message ?? 'Saved')
      if (mode === 'create' && res.data && 'id' in res.data) router.push(`/admin/exams/${res.data.id}`)
      else router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-5" noValidate>
      {formError && <Alert variant="destructive" title={formError} />}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <FormField id="title" label="Title" required error={errors.title}>
          {(aria) => <Input {...aria} value={values.title} disabled={disabled} onChange={(e) => set('title', e.target.value)} maxLength={160} />}
        </FormField>
        <FormField id="slug" label="Slug" required error={errors.slug} description="Lowercase letters, numbers and hyphens.">
          {(aria) => (
            <Input
              {...aria}
              value={values.slug}
              disabled={disabled}
              onChange={(e) => {
                setSlugTouched(true)
                set('slug', e.target.value)
              }}
            />
          )}
        </FormField>
      </div>
      <FormField id="description" label="Description" error={errors.description} description="Shown to students on the mock exams page.">
        {(aria) => <Textarea {...aria} value={values.description} disabled={disabled} onChange={(e) => set('description', e.target.value)} maxLength={2000} />}
      </FormField>

      <fieldset className="grid grid-cols-1 gap-5 rounded-lg border border-border p-4" disabled={disabled || structureLocked}>
        <legend className="px-1 text-sm font-medium">Format {structureLocked && <span className="font-normal text-muted-foreground">(locked while not a draft)</span>}</legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex items-start gap-3">
            <Switch
              checked={values.isAdaptive}
              onCheckedChange={(c) => set('isAdaptive', c)}
              disabled={mode === 'edit' || disabled}
              aria-describedby="adaptive-help"
            />
            <span>
              <span className="text-sm font-medium">Adaptive</span>
              <span id="adaptive-help" className="block text-[13px] text-muted-foreground">
                {mode === 'edit' ? 'Fixed at creation. Create a new exam to change it.' : 'Module 2 has an easier and a harder version.'}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <Switch checked={values.isFullLength} onCheckedChange={(c) => set('isFullLength', c)} disabled={disabled || structureLocked} />
            <span>
              <span className="text-sm font-medium">Full-length</span>
              <span className="block text-[13px] text-muted-foreground">Requires exactly 27 (RW) / 22 (Math) questions per module.</span>
            </span>
          </label>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField id="routingThreshold" label="Routing threshold (%)" error={errors.routingThreshold} description="Module 1 accuracy for the harder module 2.">
            {(aria) => (
              <Input
                {...aria}
                type="number"
                min={5}
                max={95}
                value={values.routingThresholdPercent}
                disabled={!values.isAdaptive}
                onChange={(e) => set('routingThresholdPercent', e.target.value)}
              />
            )}
          </FormField>
          <FormField id="breakMinutes" label="Break (minutes)" error={errors.breakMinutes} description="0–30; 0 means no break.">
            {(aria) => <Input {...aria} type="number" min={0} max={30} value={values.breakMinutes} onChange={(e) => set('breakMinutes', e.target.value)} />}
          </FormField>
          {mode === 'create' && (
            <>
              <FormField id="rwModuleMinutes" label="RW module (minutes)" error={errors.rwModuleMinutes}>
                {(aria) => (
                  <Input {...aria} type="number" min={1} max={120} value={values.rwModuleMinutes} onChange={(e) => set('rwModuleMinutes', e.target.value)} />
                )}
              </FormField>
              <FormField id="mathModuleMinutes" label="Math module (minutes)" error={errors.mathModuleMinutes}>
                {(aria) => (
                  <Input {...aria} type="number" min={1} max={120} value={values.mathModuleMinutes} onChange={(e) => set('mathModuleMinutes', e.target.value)} />
                )}
              </FormField>
            </>
          )}
        </div>
      </fieldset>

      {canEdit && (
        <div>
          <Button type="submit" loading={pending}>
            {mode === 'create' ? 'Create exam' : 'Save settings'}
          </Button>
        </div>
      )}
    </form>
  )
}
