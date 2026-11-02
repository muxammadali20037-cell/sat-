'use client'

import * as React from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { FormField, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { format } from '@/lib/i18n/dict'
import { CONTACT_TOPICS, contactSchema, type ContactInput } from './contact-schema'

export type ContactFormLabels = {
  name: string
  email: string
  topic: string
  topics: Record<(typeof CONTACT_TOPICS)[number], string>
  message: string
  messageHint: string
  website: string
  submit: string
  sentTitle: string
  sentBody: string
  another: string
  errors: Record<string, string>
}

export function ContactForm({ labels, defaultEmail, defaultName }: { labels: ContactFormLabels; defaultEmail?: string; defaultName?: string }) {
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const [formError, setFormError] = React.useState<string | null>(null)
  const msg = (key?: string) => (key ? (labels.errors[key] ?? key) : undefined)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: defaultName ?? '', email: defaultEmail ?? '', topic: 'general', message: '', website: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await apiFetch<{ received: boolean }>('/api/contact', { method: 'POST', body: values })
      setSentTo(values.email.trim())
      reset({ name: values.name, email: values.email, topic: 'general', message: '', website: '' })
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'RATE_LIMITED') setFormError(labels.errors.rateLimited ?? err.message)
        else if (err.code === 'SERVICE_NOT_CONFIGURED') setFormError(labels.errors.notConfigured ?? err.message)
        else setFormError(labels.errors.generic ?? err.message)
      } else {
        setFormError(labels.errors.generic ?? 'Error')
      }
    }
  })

  if (sentTo) {
    return (
      <div role="status" className="rounded-xl border border-success/25 bg-success-soft p-6">
        <p className="flex items-center gap-2 font-semibold text-foreground">
          <CheckCircle2 className="size-5 text-success" aria-hidden />
          {labels.sentTitle}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{format(labels.sentBody, { email: sentTo })}</p>
        <Button variant="secondary" className="mt-5" onClick={() => setSentTo(null)}>
          {labels.another}
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-5 rounded-xl border border-border bg-card p-5 sm:p-6">
      {formError && (
        <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive-soft px-3.5 py-3 text-sm text-foreground">
          {formError}
        </p>
      )}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormField id="contact-name" label={labels.name} error={msg(errors.name?.message)} required>
          {(aria) => <Input {...aria} {...register('name')} autoComplete="name" />}
        </FormField>
        <FormField id="contact-email" label={labels.email} error={msg(errors.email?.message)} required>
          {(aria) => <Input {...aria} {...register('email')} type="email" autoComplete="email" inputMode="email" />}
        </FormField>
      </div>
      <FormField id="contact-topic" label={labels.topic} error={msg(errors.topic?.message)}>
        {(aria) => (
          <NativeSelect {...aria} {...register('topic')}>
            {CONTACT_TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {labels.topics[topic]}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField id="contact-message" label={labels.message} description={labels.messageHint} error={msg(errors.message?.message)} required>
        {(aria) => <Textarea {...aria} {...register('message')} rows={6} maxLength={4000} />}
      </FormField>
      {/* Honeypot: visually hidden and skipped by keyboard and screen readers. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="contact-website">{labels.website}</label>
        <input id="contact-website" type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
      </div>
      <div>
        <Button type="submit" size="lg" loading={isSubmitting}>
          {labels.submit}
        </Button>
      </div>
    </form>
  )
}
