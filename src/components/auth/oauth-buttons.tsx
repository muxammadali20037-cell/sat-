'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { signInWithOAuthAction, type AuthActionResult } from '@/features/auth/actions'
import { useDict } from '@/lib/i18n/client'
import { authDict } from '@/lib/i18n/dictionaries/auth'
import { cn } from '@/lib/utils'

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

/** The glyph Apple asks "Sign in with Apple" buttons to show (HIG). */
function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]" fill="currentColor">
      <path d="M16.37 12.62c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.71-3.19-1.73-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.75 2.21 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.88.69 1.19-.02 1.94-1.08 2.67-2.15.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.31-.89-2.33-3.54zM14.18 6.15c.61-.74 1.02-1.76.91-2.78-.88.04-1.94.59-2.57 1.32-.56.65-1.06 1.69-.93 2.69.98.08 1.98-.5 2.59-1.23z" />
    </svg>
  )
}

function ProviderButton({ provider, next, disabled, last }: { provider: 'google' | 'apple'; next?: string; disabled?: boolean; last: boolean }) {
  const t = useDict(authDict).google
  const [state, formAction, pending] = useActionState<AuthActionResult | null, FormData>(signInWithOAuthAction, null)
  return (
    <form action={formAction} className="grid grid-cols-1 gap-2" data-provider={provider}>
      <input type="hidden" name="provider" value={provider} />
      {next && <input type="hidden" name="next" value={next} />}
      <Button
        type="submit"
        variant="secondary"
        size="lg"
        className={cn(
          'relative w-full',
          provider === 'apple' && 'border-transparent bg-black text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/85',
        )}
        loading={pending}
        disabled={disabled}
      >
        {!pending && (provider === 'google' ? <GoogleMark /> : <AppleMark />)}
        {provider === 'google' ? t.continue : t.apple}
        {last && (
          <span className="absolute -top-2 right-3 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm">{t.lastUsed}</span>
        )}
      </Button>
      {state && !state.ok && (
        <p role="alert" className="text-[13px] text-destructive">
          {state.error}
        </p>
      )}
    </form>
  )
}

/** "Continue with Google / Apple" for the providers Supabase has switched on. */
export function OAuthButtons({
  providers,
  next,
  disabled,
  last,
}: {
  providers: { google: boolean; apple: boolean }
  next?: string
  disabled?: boolean
  last?: string | null
}) {
  return (
    <>
      {providers.google && <ProviderButton provider="google" next={next} disabled={disabled} last={last === 'google'} />}
      {providers.apple && <ProviderButton provider="apple" next={next} disabled={disabled} last={last === 'apple'} />}
    </>
  )
}

export function OrDivider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
