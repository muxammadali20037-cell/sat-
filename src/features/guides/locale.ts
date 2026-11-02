import { sectionSchema, type GuideLocale, type GuideSection } from './schema'

/** Locale preference: the student's language first, then Uzbek (the primary guide language), then English. */
export function localeOrder(locale: string): GuideLocale[] {
  const order: GuideLocale[] = []
  for (const l of [locale, 'uz', 'en', 'ru']) if ((l === 'uz' || l === 'en' || l === 'ru') && !order.includes(l)) order.push(l)
  return order
}

export function pickLocale<T extends { locale: string }>(rows: T[], locale: string): T | null {
  for (const l of localeOrder(locale)) {
    const hit = rows.find((r) => r.locale === l)
    if (hit) return hit
  }
  return rows[0] ?? null
}

/** Parses stored sections one by one; a malformed section is dropped (and logged) instead of breaking the page. */
export function parseSections(raw: unknown, slug: string): GuideSection[] {
  if (!Array.isArray(raw)) return []
  const out: GuideSection[] = []
  raw.forEach((s, i) => {
    const parsed = sectionSchema.safeParse(s)
    if (parsed.success) out.push(parsed.data)
    else console.warn(`[guides] ${slug}: dropping invalid section ${i}: ${parsed.error.issues[0]?.message}`)
  })
  return out
}
