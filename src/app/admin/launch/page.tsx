import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2, CircleDashed, Hand } from 'lucide-react'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { ADMIN_ROLES } from '@/config/roles'
import { isDesmosConfigured, serverEnv, siteUrl } from '@/lib/env'
import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { callBot } from '@/lib/telegram/bot'
import { oauthAvailability } from '@/features/auth/providers'
import { bundledPacksStatus } from '@/features/content/question-pack'
import { loadRewardSettings } from '@/features/referrals/server'
import { getTaxonomy } from '@/features/taxonomy/server'
import { buildLaunchChecklist, launchSummary, type LaunchGroup, type LaunchItem } from '@/features/admin/launch-checklist'

export const metadata: Metadata = { title: 'Ishga tushirish' }

async function telegramWebhookOk(): Promise<boolean | null> {
  try {
    const info = await callBot<{ url: string; allowed_updates?: string[] }>('getWebhookInfo', {}, 5000)
    return info.url === siteUrl('/api/webhooks/telegram') && (info.allowed_updates ?? []).includes('callback_query')
  } catch {
    return null
  }
}

const GROUPS: Array<{ id: LaunchGroup; title: string; note: string }> = [
  { id: 'must', title: 'Odamlarni chaqirishdan oldin', note: 'Bularsiz ro‘yxatdan o‘tish, to‘lov yoki qonuniy tomonda muammo chiqadi.' },
  { id: 'soon', title: 'Birinchi hafta ichida', note: 'Ishlab turadi, lekin bular bilan ancha yaxshi bo‘ladi.' },
  { id: 'later', title: 'Keyinroq (pullik xizmatlar)', note: 'Ulanmaguncha sayt bu qismlarni “sozlanmagan” deb ochiq ko‘rsatadi.' },
]

export default async function LaunchChecklistPage() {
  await requireRole(ADMIN_ROLES)
  const db = await createServerSupabase()
  const env = serverEnv()
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const r = await q
    if (r.error) throw r.error
    return r.count ?? 0
  }
  const taxonomy = await getTaxonomy(db)
  const subjectId = (code: 'math' | 'reading_writing') => taxonomy.subjectByCode.get(code)?.id ?? '00000000-0000-0000-0000-000000000000'
  const [packs, rewards, webhookOk, oauth, math, rw, mocksPub, mocksDraft, lessons] = await Promise.all([
    bundledPacksStatus(db),
    loadRewardSettings(createAdminSupabase()),
    env.TELEGRAM_BOT_TOKEN ? telegramWebhookOk() : Promise.resolve(false),
    oauthAvailability(),
    count(db.from('questions').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('subject_id', subjectId('math'))),
    count(db.from('questions').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('subject_id', subjectId('reading_writing'))),
    count(db.from('mock_exams').select('id', { count: 'exact', head: true }).eq('status', 'published')),
    count(db.from('mock_exams').select('id', { count: 'exact', head: true }).eq('status', 'draft')),
    count(db.from('lessons').select('id', { count: 'exact', head: true }).eq('status', 'published')),
  ])
  const items = buildLaunchChecklist({
    siteUrl: siteUrl('/'),
    desmosKey: isDesmosConfigured,
    anthropicKey: Boolean(env.ANTHROPIC_API_KEY),
    clickConfigured: Boolean(env.CLICK_SERVICE_ID && env.CLICK_MERCHANT_ID && env.CLICK_MERCHANT_USER_ID && env.CLICK_SECRET_KEY),
    paymeConfigured: Boolean(env.PAYME_MERCHANT_ID && env.PAYME_KEY),
    telegramToken: Boolean(env.TELEGRAM_BOT_TOKEN),
    telegramWebhookOk: webhookOk,
    googleEnabled: oauth.google,
    referralDays: rewards.referrerDays,
    publishedQuestions: { math, reading_writing: rw },
    unpublishedPacks: packs.filter((p) => p.published < p.total).map((p) => ({ id: p.id, unpublished: p.total - p.published })),
    publishedMocks: mocksPub,
    draftMocks: mocksDraft,
    publishedLessons: lessons,
  })
  const sum = launchSummary(items)
  return (
    <>
      <PageHeader
        title="Ishga tushirish"
        description="Faqat siz qila oladigan ishlar. Sayt aniqlay oladiganlari avtomatik tekshiriladi; qolganlari “qo‘lda” deb belgilangan va bajarilgan deb ko‘rsatilmaydi."
      />
      <Card className="mb-6 p-4 sm:p-5" data-testid="launch-summary">
        <p className="text-sm">
          {sum.mustOpen === 0 ? (
            <span className="font-medium text-success">Majburiy ishlarning sayt ko‘ra oladigan qismi bajarilgan. Qo‘lda belgilanganlarini o‘zingiz tasdiqlang.</span>
          ) : (
            <>
              <span className="font-semibold">{sum.mustOpen} ta majburiy ish</span> qoldi. Chop etilgan savollar: Math {math}, English {rw}; darslar: {lessons}.
            </>
          )}
        </p>
      </Card>
      <div className="space-y-8">
        {GROUPS.map((g) => (
          <section key={g.id} aria-labelledby={`grp-${g.id}`}>
            <h2 id={`grp-${g.id}`} className="text-base font-semibold">
              {g.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{g.note}</p>
            <ol className="mt-3 space-y-3">
              {items
                .filter((x) => x.group === g.id)
                .map((x) => (
                  <ChecklistRow key={x.id} item={x} />
                ))}
            </ol>
          </section>
        ))}
      </div>
    </>
  )
}

function ChecklistRow({ item }: { item: LaunchItem }) {
  const Icon = item.status === 'done' ? CheckCircle2 : item.status === 'manual' ? Hand : CircleDashed
  const label = item.status === 'done' ? 'Bajarilgan' : item.status === 'manual' ? 'Qo‘lda tekshiring' : 'Qilish kerak'
  return (
    <li data-item={item.id} data-status={item.status}>
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <Icon
            aria-hidden
            className={cn('mt-0.5 size-5 shrink-0', item.status === 'done' ? 'text-success' : item.status === 'manual' ? 'text-warning' : 'text-muted-foreground')}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{item.why}</p>
            {item.steps.length > 0 && (
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                {item.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            )}
            {item.link &&
              (item.link.external ? (
                <a className="mt-2 inline-block text-sm font-medium text-primary hover:underline" href={item.link.href} target="_blank" rel="noopener noreferrer">
                  {item.link.label}
                </a>
              ) : (
                <Link className="mt-2 inline-block text-sm font-medium text-primary hover:underline" href={item.link.href}>
                  {item.link.label}
                </Link>
              ))}
          </div>
        </div>
      </Card>
    </li>
  )
}
