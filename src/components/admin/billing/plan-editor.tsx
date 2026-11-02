'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Checkbox, Switch } from '@/components/ui/controls'
import { FormField, Input, Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { minorToMajorString } from '@/lib/payments/purpose'
import { updatePlanAction } from '@/features/subscriptions/admin-actions'

const FEATURES = [
  { key: 'diagnostic', label: 'Diagnostic', limited: false },
  { key: 'video_lessons', label: 'Video lessons (full course)', limited: false },
  { key: 'practice_questions_daily', label: 'Practice questions / day', limited: true },
  { key: 'ai_requests_daily', label: 'AI tutor requests / day', limited: true },
  { key: 'mock_exams_monthly', label: 'Mock exams / month', limited: true },
  { key: 'analytics_full', label: 'Full analytics', limited: false },
  { key: 'study_plan', label: 'Study plan', limited: false },
] as const

type FeatureKey = (typeof FEATURES)[number]['key']

export type EditablePlan = {
  id: string
  code: string
  name: string
  description: string
  priceMinor: number
  currency: string
  isActive: boolean
  isPublic: boolean
  highlight: boolean
  usdPrice: { amountMinor: number; isActive: boolean } | null
  features: Record<FeatureKey, { enabled: boolean; limit: number | null }>
}

export function PlanEditor({ plan }: { plan: EditablePlan }) {
  const router = useRouter()
  const isFree = plan.code === 'free'
  const [pending, startTransition] = React.useTransition()
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({})
  const [flags, setFlags] = React.useState({ isActive: plan.isActive, isPublic: plan.isPublic, highlight: plan.highlight })
  const [features, setFeatures] = React.useState(() =>
    Object.fromEntries(
      FEATURES.map((f) => [f.key, { enabled: plan.features[f.key]?.enabled ?? false, limit: plan.features[f.key]?.limit === null ? '' : String(plan.features[f.key]?.limit ?? 0) }]),
    ) as Record<FeatureKey, { enabled: boolean; limit: string }>,
  )

  function submit(form: FormData) {
    startTransition(async () => {
      const result = await updatePlanAction({
        planId: plan.id,
        name: String(form.get('name') ?? ''),
        description: String(form.get('description') ?? ''),
        price: String(form.get('price') ?? '0'),
        usdPrice: String(form.get('usdPrice') ?? ''),
        ...flags,
        features,
      })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      setErrors({})
      toast.success('Plan saved')
      router.refresh()
    })
  }

  const id = (s: string) => `plan-${plan.code}-${s}`
  return (
    <Card className="p-5">
      <form action={submit} className="grid grid-cols-1 gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{plan.name}</h3>
          <Badge variant="outline" className="font-mono">
            {plan.code}
          </Badge>
          {!plan.isActive && <Badge>Inactive</Badge>}
          {plan.isActive && !plan.isPublic && <Badge variant="warning">Hidden</Badge>}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <FormField id={id('name')} label="Name" required error={errors.name}>
            {(a) => <Input {...a} name="name" defaultValue={plan.name} maxLength={60} required />}
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField id={id('price')} label={`Price / month (${plan.currency})`} required error={errors.price} description={isFree ? 'Free plan stays at 0.' : undefined}>
              {(a) => <Input {...a} name="price" defaultValue={minorToMajorString(plan.priceMinor).replace(/\.00$/, '')} inputMode="decimal" readOnly={isFree} />}
            </FormField>
            <FormField id={id('usd')} label="Card price (USD)" error={errors.usdPrice} description="Blank = not sold by card.">
              {(a) => (
                <Input
                  {...a}
                  name="usdPrice"
                  defaultValue={plan.usdPrice?.isActive ? minorToMajorString(plan.usdPrice.amountMinor) : ''}
                  inputMode="decimal"
                  disabled={isFree}
                />
              )}
            </FormField>
          </div>
        </div>
        <FormField id={id('description')} label="Description" error={errors.description}>
          {(a) => <Textarea {...a} name="description" defaultValue={plan.description} maxLength={500} className="min-h-16" />}
        </FormField>
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          {(
            [
              ['isActive', 'Active (can be bought)'],
              ['isPublic', 'Public (shown on pricing)'],
              ['highlight', 'Highlighted'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <Switch
                checked={flags[key]}
                onCheckedChange={(v) => setFlags((f) => ({ ...f, [key]: v }))}
                disabled={isFree && key === 'isActive'}
                aria-label={label}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="overflow-x-auto relative rounded-lg border border-border">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="h-9 px-3 font-medium">Feature</th>
                <th className="h-9 px-3 font-medium">Included</th>
                <th className="h-9 px-3 font-medium">Limit (blank = unlimited)</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.key} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{f.label}</td>
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={features[f.key].enabled}
                      onCheckedChange={(v) => setFeatures((s) => ({ ...s, [f.key]: { ...s[f.key], enabled: v === true } }))}
                      aria-label={`${f.label} included`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {f.limited ? (
                      <Input
                        className="h-8 w-28"
                        value={features[f.key].limit}
                        onChange={(e) => setFeatures((s) => ({ ...s, [f.key]: { ...s[f.key], limit: e.target.value } }))}
                        inputMode="numeric"
                        aria-label={`${f.label} limit`}
                        placeholder="Unlimited"
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Prices are hypotheses. Changes apply to new checkouts; paid periods are not affected.</p>
          <Button type="submit" loading={pending}>
            Save plan
          </Button>
        </div>
      </form>
    </Card>
  )
}
