'use client'

import { createContext, use, type ReactNode } from 'react'
import { DEFAULT_LOCALE, type Locale } from './config'
import { resolveDict, type Dict } from './dict'

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>
}

export function useLocale(): Locale {
  return use(LocaleContext)
}

export function useDict<T>(dict: Dict<T>): T {
  return resolveDict(dict, use(LocaleContext))
}
