/**
 * Launch checklist (pure, unit-tested). Turns what the server can detect (keys present, content
 * published, Telegram webhook, sign-in providers, settings) into a short Uzbek to-do list for the
 * owner. Items the app cannot see (SMTP, Vercel plan, licences, legal review) are marked "manual" and
 * never shown as done, so the page cannot claim more than it knows.
 */

export type LaunchInputs = {
  siteUrl: string
  desmosKey: boolean
  anthropicKey: boolean
  clickConfigured: boolean
  paymeConfigured: boolean
  telegramToken: boolean
  /** null when the bot could not be asked. */
  telegramWebhookOk: boolean | null
  googleEnabled: boolean
  referralDays: number
  publishedQuestions: { math: number; reading_writing: number }
  /** Bundled packs with questions not yet published. */
  unpublishedPacks: Array<{ id: string; unpublished: number }>
  publishedMocks: number
  draftMocks: number
  publishedLessons: number
}

export type LaunchStatus = 'done' | 'todo' | 'manual'
export type LaunchGroup = 'must' | 'soon' | 'later'
export type LaunchItem = {
  id: string
  group: LaunchGroup
  status: LaunchStatus
  title: string
  why: string
  steps: string[]
  link?: { href: string; label: string; external?: boolean }
}

/** Full-length mock exam: RW 27 × 3 modules + Math 22 × 3 modules. */
export const RW_PER_MOCK = 81
export const MATH_PER_MOCK = 66

export function distinctMocksPossible(q: { math: number; reading_writing: number }): number {
  return Math.max(0, Math.min(Math.floor(q.reading_writing / RW_PER_MOCK), Math.floor(q.math / MATH_PER_MOCK)))
}

export function buildLaunchChecklist(i: LaunchInputs): LaunchItem[] {
  const onVercelDomain = /\.vercel\.app(\/|$)/.test(i.siteUrl)
  const items: LaunchItem[] = [
    {
      id: 'smtp',
      group: 'must',
      status: 'manual',
      title: 'Email jo‘natishni ulash (SMTP)',
      why: 'Supabase’ning bepul jo‘natuvchisi soatiga juda oz xat yuboradi. Ko‘p odam birdan ro‘yxatdan o‘tsa, tasdiqlash xati kelmay qoladi.',
      steps: [
        'resend.com’da bepul hisob oching (oyiga 3 000 ta xat bepul).',
        'Resend → Domains: o‘z domeningizni qo‘shing va ko‘rsatilgan DNS yozuvlarini domen sozlamalariga kiriting.',
        'Resend → SMTP: host, port, foydalanuvchi va parolni ko‘chirib oling.',
        'Supabase → Authentication → Emails → SMTP Settings: shu ma’lumotlarni kiriting, jo‘natuvchi nomi “SAT MASTER”.',
        'Supabase → Authentication → URL Configuration: Site URL sayt manzili ekanini tekshiring.',
        'Yangi email bilan ro‘yxatdan o‘tib, xat kelishini sinang.',
      ],
      link: { href: 'https://supabase.com/dashboard/project/_/auth/smtp', label: 'Supabase SMTP sozlamalari', external: true },
    },
    {
      id: 'vercel-pro',
      group: 'must',
      status: 'manual',
      title: 'Vercel tarifini tekshirish',
      why: 'Bepul Hobby tarifi tijoriy loyihalarga ruxsat bermaydi. Pul olinadigan sayt Pro tarifida bo‘lishi kerak.',
      steps: ['Vercel → Settings → Billing’ni oching.', 'Tarif “Hobby” bo‘lsa, “Pro”ga o‘ting.'],
      link: { href: 'https://vercel.com/dashboard', label: 'Vercel', external: true },
    },
    {
      id: 'desmos',
      group: 'must',
      status: i.desmosKey ? 'manual' : 'done',
      title: i.desmosKey ? 'Desmos litsenziyasini tasdiqlash' : 'Desmos: tashqi havola rejimi',
      why: i.desmosKey
        ? 'Saytda Desmos kaliti bor. Sinov (trial) kaliti tijoriy foydalanish uchun emas: tijoriy litsenziya kerak yoki kalitni olib tashlang (unda “Desmos’da ochish” havolasi ishlaydi).'
        : 'Kalit yo‘q: kalkulyator Desmos saytida ochiladi. Bu litsenziyasiz ham to‘g‘ri ishlaydi.',
      steps: i.desmosKey
        ? ['desmos.com/partners orqali tijoriy foydalanish so‘rang.', 'Yoki Vercel → Settings → Environment Variables’dan NEXT_PUBLIC_DESMOS_API_KEY’ni o‘chiring va qayta deploy qiling.']
        : [],
      link: i.desmosKey ? { href: 'https://www.desmos.com/partners', label: 'Desmos partners', external: true } : undefined,
    },
    {
      id: 'payments',
      group: 'must',
      status: i.clickConfigured || i.paymeConfigured ? 'done' : 'todo',
      title: 'To‘lovni ulash (Click yoki Payme)',
      why:
        i.clickConfigured || i.paymeConfigured
          ? `Ulangan: ${[i.clickConfigured && 'Click', i.paymeConfigured && 'Payme'].filter(Boolean).join(', ')}. Sinov to‘lovini bir marta qilib ko‘ring.`
          : 'Narxlar ko‘rinadi, lekin hozir to‘lab bo‘lmaydi. Ungacha Pro’ni Admin → Subscriptions → Grant access orqali qo‘lda berasiz.',
      steps:
        i.clickConfigured || i.paymeConfigured
          ? []
          : [
              'YaTT yoki MChJ hujjatlari bilan Click (merchant.click.uz) yoki Payme Business’da merchant shartnomasi tuzing.',
              'Berilgan ID va kalitlarni Vercel → Environment Variables’ga kiriting (nomlari docs/PAYMENTS.md’da). Kalitlarni chatga yozmang.',
              'Qayta deploy qiling va kichik summada sinov to‘lovi qiling.',
            ],
    },
    {
      id: 'legal',
      group: 'must',
      status: 'manual',
      title: 'Foydalanish shartlari va maxfiylik siyosatini yuristga ko‘rsatish',
      why: 'Matnlar tayyor, lekin yurist ko‘rmagan. O‘zbekistonda shaxsiy ma’lumotlarni saqlash joyi bo‘yicha qonun talablari bor (baza Frankfurtda).',
      steps: ['/terms va /privacy sahifalarini yuristga yuboring.', 'O‘zgarishlarni menga yuboring — saytga kiritaman.'],
      link: { href: '/privacy', label: 'Maxfiylik siyosati' },
    },
    {
      id: 'packs',
      group: 'must',
      status: i.unpublishedPacks.length === 0 ? 'done' : 'todo',
      title: 'Tekshirilgan savollar to‘plamini chop etish',
      why:
        i.unpublishedPacks.length === 0
          ? 'Barcha tayyor to‘plamlar chop etilgan.'
          : `Chop etilmagan: ${i.unpublishedPacks.map((p) => `${p.id} (${p.unpublished} ta)`).join(', ')}.`,
      steps: i.unpublishedPacks.length === 0 ? [] : ['Import questions sahifasida har bir to‘plamda “Import and publish all” tugmasini bosing.'],
      link: { href: '/admin/question-import', label: 'Import questions' },
    },
    {
      id: 'mocks',
      group: 'must',
      status: i.publishedMocks >= 3 ? 'done' : 'todo',
      title: 'Sinov imtihonlari',
      why: `Chop etilgan: ${i.publishedMocks}, qoralama: ${i.draftMocks}. Hozirgi bank bilan savollari takrorlanmaydigan taxminan ${distinctMocksPossible(i.publishedQuestions)} ta to‘liq mock tuzish mumkin.`,
      steps: ['Mock exams → “Create and fill a full mock” → ochilgan imtihonda “Publish”.'],
      link: { href: '/admin/exams', label: 'Mock exams' },
    },
    {
      id: 'leaked-passwords',
      group: 'soon',
      status: 'manual',
      title: 'Oson buziladigan parollarni bloklash',
      why: 'Supabase oshkor bo‘lgan parollarni tekshirib, rad etishi mumkin. Bu bitta tugma.',
      steps: ['Supabase → Authentication → Sign In / Providers → Email → “Prevent use of leaked passwords”ni yoqing.'],
    },
    {
      id: 'domain',
      group: 'soon',
      status: onVercelDomain ? 'todo' : 'done',
      title: 'O‘z domeningiz',
      why: onVercelDomain ? `Hozir sayt ${i.siteUrl} manzilida. O‘z domeningiz ishonch beradi va email uchun ham kerak.` : `Sayt manzili: ${i.siteUrl}.`,
      steps: onVercelDomain
        ? [
            'Domen sotib oling (masalan, .uz ro‘yxatchisidan).',
            'Vercel → Project → Settings → Domains: domenni qo‘shing va ko‘rsatilgan DNS yozuvlarini kiriting.',
            'Vercel’da NEXT_PUBLIC_SITE_URL’ni yangi manzilga o‘zgartiring; Supabase Site URL’ni ham.',
          ]
        : [],
    },
    {
      id: 'telegram',
      group: 'soon',
      status: i.telegramToken && i.telegramWebhookOk ? 'done' : 'todo',
      title: 'Telegram bot',
      why: !i.telegramToken
        ? 'Bot tokeni yo‘q.'
        : i.telegramWebhookOk
          ? 'Bot ulangan: kirish, mashqlar va xabarlar ishlaydi.'
          : i.telegramWebhookOk === null
            ? 'Bot bilan bog‘lanib bo‘lmadi.'
            : 'Token bor, lekin webhook sozlanmagan.',
      steps: i.telegramToken && i.telegramWebhookOk ? [] : ['Admin → Telegram → “Configure bot” tugmasini bosing.', 'O‘zingiz botga /start yozib, sinab ko‘ring.'],
      link: { href: '/admin/telegram', label: 'Telegram' },
    },
    {
      id: 'google',
      group: 'soon',
      status: i.googleEnabled ? 'done' : 'todo',
      title: 'Google bilan kirish',
      why: i.googleEnabled ? 'Yoqilgan.' : 'Kod tayyor, faqat Google Cloud va Supabase’da yoqish kerak.',
      steps: i.googleEnabled ? [] : ['docs/AUTH_SETUP.md §5 dagi qadamlarni bajaring (Google Cloud’da OAuth client, Supabase’da Google provider).'],
    },
    {
      id: 'referrals',
      group: 'soon',
      status: i.referralDays > 0 ? 'done' : 'todo',
      title: 'Do‘st taklifi uchun mukofot',
      why: i.referralDays > 0 ? `Taklif qilganga ${i.referralDays} kun Pro beriladi.` : 'Hozir 0 kun — mukofot o‘chiq. Kun sonini o‘zingiz belgilaysiz.',
      steps: i.referralDays > 0 ? [] : ['Admin → Settings: referrals.referrer_days va referrals.friend_days qiymatlarini kiriting.'],
      link: { href: '/admin/settings', label: 'Settings' },
    },
    {
      id: 'pilot',
      group: 'soon',
      status: 'manual',
      title: '10–30 kishilik pilot',
      why: 'Ko‘p odam chaqirishdan oldin haqiqiy foydalanuvchilar bilan ro‘yxatdan o‘tish, diagnostika va mockni sinab ko‘ring. Ball o‘sishini o‘lchang — bu eng kuchli reklama.',
      steps: ['Tanishlaringizga havola yuboring.', '4 haftadan keyin diagnostika va mock natijalarini solishtiring (Admin → Analytics).'],
    },
    {
      id: 'ai',
      group: 'later',
      status: i.anthropicKey ? 'done' : 'todo',
      title: 'AI yordamchi',
      why: i.anthropicKey ? 'Kalit kiritilgan.' : 'Kalit yo‘q: AI tushuntirishlar “sozlanmagan” deb ko‘rsatiladi.',
      steps: i.anthropicKey ? [] : ['console.anthropic.com’da API kaliti oling.', 'Vercel → Environment Variables’ga ANTHROPIC_API_KEY nomi bilan kiriting (chatga yozmang) va qayta deploy qiling.'],
    },
  ]
  return items
}

export function launchSummary(items: LaunchItem[]): { mustOpen: number; total: number; done: number } {
  return {
    mustOpen: items.filter((x) => x.group === 'must' && x.status !== 'done').length,
    total: items.length,
    done: items.filter((x) => x.status === 'done').length,
  }
}
