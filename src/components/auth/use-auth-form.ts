'use client'

import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { useDict } from '@/lib/i18n/client'
import { authDict } from '@/lib/i18n/dictionaries/auth'

/** Translate a Zod message key (or an already-localized server message) for display. */
export function useAuthMessages() {
  const t = useDict(authDict)
  const errors = t.errors as Record<string, string>
  const translate = (message: string | undefined): string | undefined => (message ? (errors[message] ?? message) : undefined)
  return { t, translate }
}

/** Push server-side field errors (already localized) into React Hook Form. */
export function applyFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fieldErrors: Record<string, string[]> | undefined,
  fields: readonly string[],
) {
  if (!fieldErrors) return
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (fields.includes(field) && messages[0]) setError(field as Path<T>, { type: 'server', message: messages[0] })
  }
}
