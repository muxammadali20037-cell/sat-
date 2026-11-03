/**
 * Country rules for pricing and payment methods (SAT MASTER 2.0: Uzbekistan and international
 * markets in parallel). A student's country is self-declared in Settings, so these rules shape
 * what is offered; they are not an access control.
 *
 *   UZ → prices in UZS, Click and Payme (local cards: Uzcard, Humo).
 *   Countries where our card processor cannot accept payments → nothing to buy; the page says so.
 *   Everyone else → prices in USD, card payment through Stripe (needs a non-Uzbek legal entity;
 *   until it is configured the page honestly shows that no payment method is available).
 */

import type { ProviderId } from '@/lib/payments/types'

export type PaymentProviderId = ProviderId

/** Offered in Settings, in this order; names come from Intl.DisplayNames. 'ZZ' (ISO "unknown") means another country. */
export const COUNTRY_CODES = [
  'UZ', 'KZ', 'KG', 'TJ', 'TM', 'AZ', 'AF', 'TR', 'AE', 'SA', 'QA', 'KR', 'JP', 'CN', 'IN', 'PK', 'MY', 'SG',
  'GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'PL', 'CZ', 'LV', 'LT', 'EE', 'GE', 'AM', 'UA', 'US', 'CA', 'AU', 'RU', 'BY', 'ZZ',
] as const
export type CountryCode = (typeof COUNTRY_CODES)[number]

/** Where Stripe cannot take payments (sanctions / unsupported): no checkout is offered. */
const NO_CARD_PROCESSING = new Set(['RU', 'BY', 'IR', 'KP', 'SY', 'CU'])

export type CountryRules = { currency: 'UZS' | 'USD'; providers: PaymentProviderId[] }

export function countryRules(code: string | null | undefined): CountryRules | null {
  if (!code) return null // not set: offer every configured method (previous behaviour)
  if (code === 'UZ') return { currency: 'UZS', providers: ['click', 'payme', 'test'] }
  if (NO_CARD_PROCESSING.has(code)) return { currency: 'USD', providers: ['test'] }
  return { currency: 'USD', providers: ['stripe', 'test'] }
}

/** Filters configured providers to the student's country (unchanged when the country is not set). */
export function providersForCountry<T extends { id: PaymentProviderId }>(code: string | null | undefined, providers: T[]): T[] {
  const rules = countryRules(code)
  return rules ? providers.filter((p) => rules.providers.includes(p.id)) : providers
}

/** Best guess for a new profile from its time zone (Settings lets the student change it). */
export function guessCountry(timeZone: string | null | undefined): CountryCode | null {
  if (timeZone === 'Asia/Tashkent' || timeZone === 'Asia/Samarkand') return 'UZ'
  return null
}

export function isCountryCode(v: unknown): v is CountryCode {
  return typeof v === 'string' && (COUNTRY_CODES as readonly string[]).includes(v)
}

export function countryName(code: string, locale: string): string {
  if (code === 'ZZ') return locale === 'uz' ? 'Boshqa davlat' : locale === 'ru' ? 'Другая страна' : 'Other country'
  try {
    return new Intl.DisplayNames([locale === 'uz' ? 'uz-Latn' : locale, 'en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}
