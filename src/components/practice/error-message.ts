import { ApiClientError } from '@/lib/api/client'
import type { practiceDict } from '@/lib/i18n/dictionaries/practice'

type PracticeErrors = (typeof practiceDict)['en']['errors']

/** Server error `details.reason` → localized message key. */
const REASON_TO_KEY: Record<string, keyof PracticeErrors> = {
  no_questions: 'noQuestions',
  set_empty: 'setEmpty',
  nothing_to_retry: 'nothingToRetry',
  no_bookmarks: 'noBookmarks',
  no_mistakes: 'noMistakes',
  time_expired: 'timeExpired',
  source_in_progress: 'sourceInProgress',
  session_finished: 'sessionFinished',
  locked_by_test: 'lockedByTest',
  invalid_option: 'invalidOption',
  too_many: 'tooMany',
  invalid_taxonomy: 'invalidTaxonomy',
  spr_invalid: 'sprInvalid',
  spr_too_long: 'sprInvalid',
  spr_mixed_number: 'sprInvalid',
  spr_division_by_zero: 'sprInvalid',
  spr_empty: 'sprInvalid',
}

export function errorReason(err: unknown): string | null {
  if (!(err instanceof ApiClientError)) return null
  const details = err.details as { reason?: unknown } | undefined
  return typeof details?.reason === 'string' ? details.reason : null
}

export function errorDetails<T extends object>(err: unknown): Partial<T> {
  if (!(err instanceof ApiClientError) || !err.details || typeof err.details !== 'object') return {}
  return err.details as Partial<T>
}

export function practiceErrorMessage(err: unknown, t: PracticeErrors): string {
  if (!(err instanceof ApiClientError)) return t.generic
  if (err.code === 'NETWORK_ERROR') return t.network
  if (err.code === 'RATE_LIMITED') return t.rateLimited
  if (err.code === 'NOT_FOUND') return t.notFound
  const reason = errorReason(err)
  const key = reason ? REASON_TO_KEY[reason] : undefined
  if (key) return t[key]
  return t.generic
}

export function isPlanLimit(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError && (err.code === 'PLAN_LIMIT_REACHED' || err.code === 'PLAN_REQUIRED')
}
