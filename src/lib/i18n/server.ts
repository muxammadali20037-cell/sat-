import 'server-only'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { DEFAULT_LOCALE, isUiLocale, LOCALE_COOKIE, type Locale } from './config'
import { resolveDict, type Dict } from './dict'
import { getCurrentProfile } from '@/lib/auth/session'

/** profile.locale → sm_locale cookie → Accept-Language → en */
export const getLocale = cache(async (): Promise<Locale> => {
  const profile = await getCurrentProfile().catch(() => null)
  if (profile && isUiLocale(profile.locale)) return profile.locale
  const cookieStore = await cookies()
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value
  if (isUiLocale(fromCookie)) return fromCookie
  return fromAcceptLanguage((await headers()).get('accept-language') ?? '')
})

/** Locale for public (non-personalized) pages: cookie → Accept-Language → en. Avoids an auth call. */
export const getPublicLocale = cache(async (): Promise<Locale> => {
  const cookieStore = await cookies()
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value
  if (isUiLocale(fromCookie)) return fromCookie
  return fromAcceptLanguage((await headers()).get('accept-language') ?? '')
})

/** First of uz / ru / en named in Accept-Language (in the browser's order); English otherwise. */
export function fromAcceptLanguage(accept: string): Locale {
  for (const part of accept.split(',')) {
    const tag = part.trim().toLowerCase()
    if (tag.startsWith('uz')) return 'uz'
    if (tag.startsWith('ru')) return 'ru'
    if (tag.startsWith('en')) return 'en'
  }
  return DEFAULT_LOCALE
}

export async function getDict<T>(dict: Dict<T>, options: { public?: boolean } = {}): Promise<T> {
  const locale = options.public ? await getPublicLocale() : await getLocale()
  return resolveDict(dict, locale)
}
