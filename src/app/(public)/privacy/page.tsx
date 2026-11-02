import type { Metadata } from 'next'
import { LegalDocument } from '@/components/marketing/legal-document'
import { getDict } from '@/lib/i18n/server'
import { publicDict } from '@/lib/i18n/dictionaries/public'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(publicDict, { public: true })
  return { title: t.meta.privacyTitle }
}

export default async function PrivacyPage() {
  const t = await getDict(publicDict, { public: true })
  return (
    <LegalDocument
      title={t.meta.privacyTitle}
      updated={t.legal.updated}
      contentsLabel={t.legal.contents}
      sections={t.legal.privacy}
      questions={t.legal.questions}
      contactLabel={t.legal.contact}
    />
  )
}
