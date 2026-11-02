import type { Metadata } from 'next'
import { Mail } from 'lucide-react'
import { z } from 'zod'
import { ContactForm } from '@/components/marketing/contact-form'
import { isSupabaseConfigured } from '@/lib/env'
import { createServerSupabase } from '@/lib/supabase/server'
import { getDict } from '@/lib/i18n/server'
import { publicDict } from '@/lib/i18n/dictionaries/public'
import { Alert } from '@/components/ui/card'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(publicDict, { public: true })
  return { title: t.meta.contactTitle, description: t.meta.contactDescription }
}

/** Public support email from platform_settings ('contact.support_email'); hidden when empty or invalid. */
async function getSupportEmail(): Promise<string | null> {
  if (!isSupabaseConfigured) return null
  try {
    const db = await createServerSupabase()
    const { data } = await db.from('platform_settings').select('value').eq('key', 'contact.support_email').maybeSingle()
    const parsed = z.email().safeParse(typeof data?.value === 'string' ? data.value.trim() : '')
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export default async function ContactPage() {
  const [t, supportEmail] = await Promise.all([getDict(publicDict, { public: true }), getSupportEmail()])
  const c = t.contactPage
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
        <header>
          <h1 className="text-[32px] font-semibold leading-tight text-foreground sm:text-[40px]">{c.title}</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">{c.description}</p>
          {supportEmail && (
            <div className="mt-8 flex gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Mail className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">{c.supportEmail}</p>
                <a href={`mailto:${supportEmail}`} className="font-medium text-primary underline-offset-4 hover:underline">
                  {supportEmail}
                </a>
              </div>
            </div>
          )}
          <p className="mt-6 text-sm text-muted-foreground">{c.responseNote}</p>
        </header>
        <div className="relative">
          {!isSupabaseConfigured && <Alert variant="warning" title={c.errors.notConfigured} className="mb-5" />}
          <ContactForm labels={{ ...c.form, errors: c.errors }} />
        </div>
      </div>
    </div>
  )
}
