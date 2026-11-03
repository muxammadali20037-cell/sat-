# SAT MASTER: joriy loyiha auditi (PHASE 0)

_Sana: 3-noyabr 2026. Audit kodga tegmasdan o'tkazildi. Faqat o'qish uchun tekshiruvlar va testlar ishga tushirildi._

Bog'liq hujjatlar:
- [PRODUCT_ARCHITECTURE.md](PRODUCT_ARCHITECTURE.md)
- [DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md)
- [SECURITY_MODEL.md](SECURITY_MODEL.md)
- [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)

## 1. Qisqa xulosa

SAT MASTER hozir **mustaqil o'qish platformasi (Learning)** sifatida texnik jihatdan to'liq qurilgan. Unda quyidagilar bor va lokal muhitda real auth, RLS va brauzer bilan tekshirilgan:
- diagnostika;
- darslar;
- mashq;
- adaptiv sinov imtihoni;
- AI ustoz;
- o'quv reja;
- tahlil;
- to'lov va obuna;
- admin panel;
- Telegram.

Biroq production'da ikkita katta bo'shliq bor:

1. **Production bazasida kontent yo'q.** 0 ta savol, 0 ta dars, 0 ta kurs, 0 ta sinov imtihoni va 0 ta chop etilgan qo'llanma. Shuning uchun o'quvchi paneli bo'sh ko'rinadi. Bu kod xatosi emas: real ma'lumot bo'lmasa, panel ataylab soxta raqam ko'rsatmaydi.
2. **Tashqi xizmatlar ulanmagan (NOT_CONFIGURED).** Production'da faqat 8 ta sozlama bor. AI (Anthropic), Desmos, Click, Payme, Stripe, Bunny video, SMS (Eskiz) va Google kalitlari yo'q.

SAT MASTER 2.0 ning ikkinchi va uchinchi ustunlari hali yo'q:
- **Classroom:** ustoz workspace'lari, jonli video dars, online doska.
- **Marketplace.**

Rus tili ham yo'q. Bularning hammasi **NOT_IMPLEMENTED**.

Foydalanuvchi savollariga javob:
- **"Online doska qani?"** Online doska ham, jonli dars ham hozir umuman yo'q (NOT_IMPLEMENTED). Ular Classroom ustunining asosiy qismi va yo'l xaritasida PHASE 4 da.
- **"Desmos qani?"** Desmos bor, lekin faqat Math mashqi va sinov imtihoni ichidagi kalkulyator panelida. Production'da `NEXT_PUBLIC_DESMOS_API_KEY` yo'q, shuning uchun "Desmos'ni yangi oynada ochish" havolasi chiqadi (NOT_CONFIGURED). Desmos'ni tijoriy mahsulotda ishlatish uchun Desmos bilan hamkorlik (partner) kaliti kerak. Batafsil: 8-bo'lim.

## 2. Qanday tekshirildi

| Tekshiruv | Natija (3-noyabr 2026) |
|---|---|
| `npm run typecheck` | 0 xato |
| `npm run lint` | 0 muammo |
| `npm test` (unit) | 508 ta test o'tdi (34 fayl) |
| `npm run test:db` | 79 ta test o'tdi (7 fayl), PostgreSQL 16 da 17 ta migratsiya bilan noldan qurilgan baza |
| GitHub Actions CI | Oxirgi 6 ta push muvaffaqiyatli o'tdi (typecheck, lint, unit, kontent, DB, build) |
| Vercel production | Oxirgi deploy `25b0510`: READY |
| Vercel runtime xatolari (24 soat) | Faqat 3-noyabrdagi `TELEGRAM_WEBHOOK_SECRET` hodisasi, oxirgisi 15:46 UTC da. Tuzatish deploy qilingandan keyin yangi xato yo'q |
| Hosted Supabase (`ncqqnjnozrymrmblixra`) | 49 jadval, hammasida RLS yoqilgan. 0015 va 0012 qo'llanmagan. Kontent sonlari 3-bo'limda |
| End-to-end (Playwright) | 2–3-noyabrda lokal muhitda o'tkazilgan: GoTrue + PostgREST + Postgres 16. Tafsilotlar: [STATUS.md](STATUS.md) |

**Dalil darajalari** (matritsadagi "Dalil" ustuni):
- **E2E**: real brauzerda, real auth va RLS bilan lokal tekshirilgan.
- **Test**: unit yoki DB testi bor.
- **Prod**: production'da kuzatilgan.
- **Stand-in**: tashqi xizmat o'rniga yozib oluvchi soxta server (Telegram, Eskiz) yoki dev mock (AI) bilan tekshirilgan. Real xizmat bilan sinalmagan.

## 3. Production holati (faqat o'qib tekshirildi)

| Ko'rsatkich | Qiymat |
|---|---|
| Profillar | 2 ta: 1 SUPER_ADMIN (egasi), 1 STUDENT. Onboarding'ni tugatganlar: 0 |
| Savollar (jami / chop etilgan) | 0 / 0 |
| Darslar, kurslar, mashq to'plamlari, sinov imtihonlari | 0 / 0 / 0 / 0 |
| Diagnostika testlari | 3 ta (reference data). Savol yo'qligi sababli boshlanmaydi: "not enough published questions" |
| Chop etilgan qo'llanmalar | 0. Admin → Study guides → "Import bundled guides" bosilmagan |
| Urinishlar, obunalar, to'lovlar, AI xabarlari, Telegram akkauntlari | 0 |
| Tariflar / ko'nikmalar | 4 / 30 |
| Storage bucket'lar | 3 ta, hammasi private |

Vercel production sozlamalari (faqat nomlari ko'rildi, qiymatlari ochilmadi):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (sensitive)
- `NEXT_PUBLIC_SITE_URL`
- `CRON_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`

Production'da **yo'q** sozlamalar:
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_DESMOS_API_KEY`
- `CLICK_*`, `PAYME_*`, `STRIPE_*`
- `BUNNY_*`
- `ESKIZ_*`, `SEND_SMS_HOOK_SECRET`
- `NEXT_PUBLIC_ENABLE_PHONE_AUTH`

Google provider Supabase Auth'da yoqilganmi, bu audit ichida tekshirilmadi (dashboard sozlamasi).

## 4. Texnologiya va tuzilma

- **Framework:** Next.js 16.4.3 (App Router, Turbopack, `proxy.ts`), React 19.3, TypeScript 5, Tailwind CSS v4.
- **UI kit:** `radix-ui` + `class-variance-authority` (shadcn uslubida, `src/components/ui`).
- **Backend:** Supabase (`@supabase/ssr`, PKCE), PostgreSQL 17 (hosted) / 16 (test).
- **Kutubxonalar:** Zod 4, Recharts, KaTeX, hls.js, Anthropic SDK, Stripe SDK.
- **Hajm:** 71 sahifa, 51 API route handler, 17 SQL migratsiya, taxminan 55 ming qator TypeScript.
- **Arxitektura:** modular monolith. Har bir modul bir xil tuzilishda:
  - `src/features/<modul>`: server logika, zod sxemalar, server actions;
  - `src/components/<modul>`: UI;
  - `src/app/...`: route'lar;
  - `src/lib/...`: umumiy infratuzilma (env, supabase client'lar, i18n, AI, to'lov provayderlari, rate limit, SMS, Telegram, video, scoring).
- **Deploy:** Vercel (`fra1`), bitta cron (`/api/cron/renewal-reminders`, har kuni 04:00 UTC).
- **CI:** `.github/workflows/ci.yml`.

## 5. Ekran → manba fayl xaritasi

Barcha sahifalar `src/app` ichida. Asosiy ekranlar:

| Ekran | Route | Manba |
|---|---|---|
| Bosh sahifa va marketing | `/`, `/features`, `/pricing`, `/faq`, `/about`, `/contact`, `/terms`, `/privacy` | `src/app/(public)/…/page.tsx`, matnlar `src/lib/i18n/dictionaries/public.ts` |
| Kirish va ro'yxatdan o'tish | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` | `src/app/(auth)/…`, `src/components/auth/*` (email, Google, Telegram, telefon) |
| Onboarding (7 qadam) | `/dashboard/onboarding` | `src/components/onboarding/onboarding-wizard.tsx` |
| O'quvchi paneli | `/dashboard` | `src/app/dashboard/(app)/page.tsx`, `src/features/dashboard/server.ts`, `src/components/dashboard/*` |
| Kurslar va dars | `/dashboard/courses`, `/courses/[subject]`, `/lesson/[id]` | `src/features/courses`, `src/features/lessons`, `src/components/courses`, `src/components/learning` |
| Qo'llanmalar | `/dashboard/guides…` | `src/features/guides`, `src/components/guides` |
| Mashq | `/dashboard/practice`, `/dashboard/practice/[id]` (focus) | `src/features/practice`, `src/components/practice` (Desmos: `calculator-panel.tsx`) |
| Diagnostika | `/dashboard/diagnostic`, `/dashboard/diagnostic/[attemptId]` | `src/features/diagnostic`, `src/components/diagnostic` |
| Sinov imtihoni | `/dashboard/mock-exams`, `/mock-exams/[id]`, `/mock-exams/results/[attemptId]` | `src/features/exams`, `src/components/exams/exam-runner.tsx` |
| Natijalar va tahlil | `/dashboard/results…`, `/dashboard/analytics` | `src/features/results`, `src/features/analytics`, `src/components/analytics` |
| AI ustoz | `/dashboard/ai-tutor` | `src/features/ai-tutor`, `src/components/ai/tutor-workspace.tsx`, `src/lib/ai/*` |
| O'quv reja | `/dashboard/study-plan` | `src/features/study-plan` (`planner.ts` qoidalar, ixtiyoriy AI izoh) |
| Saqlanganlar | `/dashboard/bookmarks` | `src/features/bookmarks` |
| Obuna va to'lov | `/dashboard/subscription…` | `src/features/subscriptions`, `src/features/payments`, `src/lib/payments/*` |
| Sozlamalar | `/dashboard/settings` | `src/components/settings/settings-forms.tsx` |
| Telegram Mini App | `/tg`, `/tg/link` | `src/app/tg`, `src/components/telegram`, `src/features/telegram` |
| Admin (30 sahifa) | `/admin/…` | `src/app/admin`, `src/features/admin`, `src/components/admin` |

API (51 handler):
- `src/app/api/{ai,diagnostic,exams,practice,lessons,bookmarks,study-plan,subscription,payments,telegram,student,courses,contact,admin}`.
- Webhook'lar: `src/app/api/webhooks/{click,payme,stripe,telegram,send-sms,test}`.
- Cron: `src/app/api/cron/renewal-reminders`.

## 6. Funksiyalar matritsasi

Statuslar:
- **WORKING:** to'liq ishlaydi va tekshirilgan (E2E yoki Prod), tashqi kalitga bog'liq emas.
- **PARTIALLY_WORKING:** ishlaydi, lekin hujjatlashtirilgan bo'shlig'i bor.
- **UI_ONLY:** ekran bor, real backend yo'q.
- **BROKEN:** hozir buzilgan.
- **NOT_IMPLEMENTED:** kod yo'q.
- **NOT_CONFIGURED:** kod bor va stand-in bilan sinalgan, lekin production'da kalit yoki xizmat ulanmagan.

"Prod" ustuni production'da foydalanuvchi bugun nimani ko'rishini aytadi.

### 6.1 Learning (mavjud)

| Funksiya | Status | Dalil | Prod | Izoh |
|---|---|---|---|---|
| Email + parol bilan ro'yxat va kirish | WORKING | E2E, Prod | Ishlaydi (egasi 3-noyabr kirgan) | Supabase standart email yuboruvchisi limitli. Site URL egasi tomonidan to'g'rilanishi kerak ([AUTH_SETUP.md](AUTH_SETUP.md) §2) |
| Google bilan kirish | NOT_CONFIGURED | Kod bor | Tekshirilmagan | Supabase'da Google provider va OAuth client kerak |
| Telegram bot orqali saytga kirish | PARTIALLY_WORKING | E2E (stand-in), Test | Token va secret bor | Egasi Admin → Telegram → "Configure bot" bosishi kerak. Real Telegram bilan sinalmagan |
| Telefon (SMS, Eskiz) bilan kirish | NOT_CONFIGURED | E2E (stand-in), Test | Yashirin (flag o'chiq) | `ESKIZ_*`, `SEND_SMS_HOOK_SECRET`, Supabase phone provider kerak |
| Telegram Mini App (to'liq ekran) | PARTIALLY_WORKING | E2E (stand-in, 29 tekshiruv) | Tekshirilmagan | BotFather'da Mini App URL va "Configure bot" kerak. Mini App ichida to'lov yo'q (ataylab) |
| Onboarding (7 qadam) | WORKING | E2E | 0 kishi tugatgan | — |
| O'quvchi paneli | WORKING | E2E | Bo'sh holat | Barcha raqamlar real ma'lumotdan. PHASE 1 da (3-noyabr) qo'shildi: kunlik missiya, haftalik faollik va maqsad, 8 domen mastery xaritasi, so'nggi xatolar va kalkulyator tugmasi. Hali yo'q: yutuqlar, jonli darslar (PHASE 2 va 4) |
| Diagnostika (domenlar bo'yicha natija) | WORKING | E2E, Test | Boshlanmaydi | Chop etilgan savol yo'q |
| Kurslar va matnli darslar | WORKING | E2E | Bo'sh (0 dars) | — |
| Video darslar | NOT_CONFIGURED | Kod, Test | Yo'q | Bunny kalitlari yo'q. Supabase Storage'ga MP4 yuklash hosted'da sinalmagan. Marketing sahifasi "Video lessons" deydi: mazmun paydo bo'lmaguncha nomuvofiqlik |
| Ko'nikma bo'yicha mashq (server baholaydi) | WORKING | E2E, DB test | Bo'sh | To'g'ri javob javobdan oldin brauzerga yuborilmaydi (testlangan) |
| Muddatli mashqlar (timed drills) | PARTIALLY_WORKING | E2E | Bo'sh | Diagnostika va imtihon server vaqti bilan ishlaydi. Alohida "timed drill" rejimi yo'q |
| Adaptiv to'liq sinov imtihoni (4 modul, tanaffus, routing) | WORKING | E2E, DB test | 0 imtihon | Admin imtihon tuzishi kerak |
| Savol ko'rib chiqish va tushuntirishlar | WORKING | E2E | Bo'sh | EN va UZ tushuntirish |
| Xatolar daftari (mistake notebook) | PARTIALLY_WORKING | Kod | — | Har urinish uchun "Retry incorrect" bor. Mashq tanlovi avval xato qilinganlarni ustun qo'yadi. Hamma xatolarni yig'adigan alohida sahifa yo'q |
| Saqlanganlar (bookmarks) | WORKING | E2E, RLS test | Bo'sh | — |
| Flashcards | NOT_IMPLEMENTED | — | — | — |
| O'quv reja | WORKING (qoidalar) / NOT_CONFIGURED (AI izoh) | E2E | AI izohsiz ishlaydi | Reja qoidalar asosida tuziladi. AI faqat haftalik maqsad va izoh qo'shadi |
| Tahlil va natijalar | WORKING | E2E | Bo'sh | — |
| AI ustoz (chat, hint, explain, generate-practice) | NOT_CONFIGURED | E2E (dev mock), Test | 503 "not configured" | `ANTHROPIC_API_KEY` yo'q. Mock production'da hech qachon yoqilmaydi. Limitlar atomik (0015 qo'llansa) |
| Desmos grafik kalkulyator | NOT_CONFIGURED | E2E (fallback) | Havola chiqadi | Kalit va Desmos bilan hamkorlik kerak (8-bo'lim) |
| Uzbekcha qo'llanmalar (40 ta) | WORKING | E2E, Test | 0 chop etilgan | "Import bundled guides" bosilishi kerak |
| Streak (ketma-ket kunlar) | WORKING | E2E | 0 | `activity_streak` funksiyasi |
| Kunlik missiya, haftalik maqsad, yutuqlar, leaderboard, sinf challenge'lari | NOT_IMPLEMENTED | — | — | Bugungi o'quv reja vazifalari kunlik missiyaga eng yaqin narsa |
| Bildirishnomalar (ilova ichida) | WORKING | Kod, E2E | — | Faqat ilova ichida. Email yoki push yo'q, Telegram bot xabarlari login uchun |
| Obuna va to'lov (Click, Payme, Stripe) | NOT_CONFIGURED | Test, DB test, E2E (test provayder) | Sotib olib bo'lmaydi | Merchant shartnomalari va kalitlar kerak. Imzo va idempotency testlangan |
| Obuna hayot sikli (cancel, resume, downgrade, grace) | WORKING (test provayder bilan) | E2E, DB test | 0 obuna | — |
| Uzaytirish eslatmasi (cron) | PARTIALLY_WORKING | Kod | `CRON_SECRET` bor | Production'da ishlagani tekshirilmagan |
| Aloqa formasi | WORKING | Kod | — | `contact_requests` jadvaliga yoziladi |
| Til: o'zbek / ingliz | WORKING | E2E | — | O'quvchi qismi `src/lib/i18n/dictionaries` dagi 18 ta lug'at va 3 ta komponent ichidagi lug'at orqali. Bir nechta komponentda hali `locale === 'uz' ? … : …` ko'rinishidagi inline matn bor |
| Til: rus | NOT_IMPLEMENTED | — | — | Baza va lug'at turi `ru` ni qabul qiladi, lekin 0 tarjima va UI'da tanlanmaydi |
| Admin panel tili | PARTIALLY_WORKING | — | — | 30 sahifaning hammasi faqat inglizcha |
| Hujjatlar: Terms, Privacy | PARTIALLY_WORKING | — | — | EN va UZ qoralama. Yurist ko'rigi kerak (shaxsiy ma'lumotlarni lokalizatsiya qilish qonuni) |

### 6.2 Admin va kontent

| Funksiya | Status | Dalil | Izoh |
|---|---|---|---|
| Savollar banki (CRUD, review → publish, versiya) | WORKING | E2E | Baza "reviewed bo'lmasa publish yo'q" qoidasini majburlaydi |
| CSV/JSON import, 240 savollik paket, ommaviy review | WORKING | E2E | Production'da hali import qilinmagan |
| Darslar, kurslar, fanlar, domenlar, ko'nikmalar | WORKING | E2E | — |
| Imtihon konstruktori (modullar) | WORKING | E2E | Imtihon yaratish ikki qadamli (tranzaksiya emas, kompensatsiya bor) |
| O'quvchilar, rollar, suspend | WORKING | E2E | Rollar global (6.4 ga qarang) |
| To'lovlar, obunalar, tariflar | WORKING | E2E | Moliyaviy yozuvlarni o'chirish mumkin emas (DB darajasida) |
| Tahlil va AI xarajati | PARTIALLY_WORKING | E2E | Ilova ichida agregatsiya, 50k qator chegarasi |
| Audit log | WORKING | E2E | Muhim admin amallari yoziladi |
| Telegram holat sahifasi | WORKING | E2E | — |

### 6.3 SAT MASTER 2.0 talablari (yangi)

| Funksiya | Status | Izoh |
|---|---|---|
| Ustoz workspace'lari (multi-tenant) | NOT_IMPLEMENTED | `workspaces`, `workspace_members`, `workspace_invitations` yo'q. Hozirgi `TEACHER` roli global (6.4) |
| Kurs va guruhlar, taklif havolasi, QR, kod | NOT_IMPLEMENTED | Hozirgi `courses` platformaning umumiy katalogi, ustozga tegishli emas |
| Dars jadvali, davomat, uy vazifasi, topshiriqlarni tekshirish | NOT_IMPLEMENTED | — |
| Jonli video/audio dars (LiveKit) | NOT_IMPLEMENTED | — |
| Ekran ulashish, qo'l ko'tarish, chat, so'rovnoma, breakout | NOT_IMPLEMENTED | — |
| Sinxron online doska (tldraw), formulalar, grafiklar, PDF annotatsiya | NOT_IMPLEMENTED | — |
| Dars yozuvi (rozilik bilan) | NOT_IMPLEMENTED | — |
| Mehmon ustoz va moderator | NOT_IMPLEMENTED | — |
| Ustoz obunasi va billing | NOT_IMPLEMENTED | Hozirgi billing faqat o'quvchi tariflari uchun |
| Marketplace (ustoz profillari, katalog, kurs sotish) | NOT_IMPLEMENTED | Arxitektura tayyorlanadi, keyin quriladi |
| Mamlakatga qarab narx, valyuta va to'lov provayderi | PARTIALLY_WORKING | `plan_prices` UZS, USD va EUR ni qo'llaydi, provayderlar ro'yxati bor. `profiles` da mamlakat maydoni yo'q, provayder tanlash mamlakatga bog'lanmagan |
| Boshqa fanlar (IELTS va boshqalar) | PARTIALLY_WORKING | `subjects → domains → skills` umumiy. Scoring, imtihon tuzilishi va kontent SAT'ga xos |

### 6.4 UI_ONLY va BROKEN

- **UI_ONLY:** topilmadi. Har bir ko'rinadigan funksiyaning backendi bor. Kalit yo'q joylarda ekran "sozlanmagan" deb ochiq aytadi.
- **BROKEN:** hozir topilmadi. 3-noyabrdagi sozlama hodisasi tuzatilgan va regression testi bor.
- **Nomuvofiqlik:** marketing sahifalari video darslar va AI ustozni va'da qiladi, lekin production'da ular yo'q yoki sozlanmagan. Ishga tushirishdan oldin yo kontent qo'shish, yo matnni moslash kerak.

## 7. Xavfsizlik bo'yicha topilmalar

To'liq model: [SECURITY_MODEL.md](SECURITY_MODEL.md).

| # | Xavf | Daraja | Izoh |
|---|---|---|---|
| S1 | **Global `TEACHER` roli barcha o'quvchilarni ko'radi** | Yuqori (2.0 uchun) | `can_view_students()` `TEACHER` ga hamma o'quvchining quyidagi ma'lumotlarini o'qishga ruxsat beradi: profil, urinishlar, javoblar, faollik, o'quv reja, AI suhbatlari, Telegram telefon raqami. Bitta akademiya uchun normal. Lekin mustaqil ustozlarga bu rolni berish bir ustozga boshqasining o'quvchilarini ko'rsatadi. **2.0 da ustozlarga global rol berilmaydi.** Ruxsatlar `workspace_members` orqali bo'ladi |
| S2 | Atomik limitlar (0015) | Yopildi | 3-noyabr egasi tasdig'i bilan production'ga qo'llandi va huquqlari tekshirildi |
| S3 | Rate limiter xatoda "fail open" | Yopildi | PHASE 1 da: baza ishlamasa, xotiradagi zaxira limiter qo'llanadi |
| S4 | `question-images` SVG qabul qiladi | Past | Bucket private, rasm `<img>` orqali ko'rsatiladi (skript ishlamaydi). Lekin signed URL to'g'ridan-to'g'ri ochilsa, SVG Supabase domenida bajariladi. 2.0 da ustozlar fayl yuklaydi, shuning uchun SVG ni sanitizatsiya qilish yoki taqiqlash kerak |
| S5 | Auth email'lari standart SMTP orqali | Past | Limit va spam xavfi. Custom SMTP kerak |
| S6 | Kunlik mashq limiti atomik emas | Past | Bir vaqtda 1–2 javob ortiqcha o'tishi mumkin |
| S7 | Erkin chat orqali imtihon savolini nusxalash | Past | Ustoz kalitni bilmaydi, lekin umumiy yordam beradi |

Ijobiy tomonlar:
- 49 jadvalning hammasida RLS bor.
- `EXECUTE` global revoke qilingan; mijoz chaqira oladigan 14 funksiya ichki rol tekshiruvi bilan.
- Javob kalitlari brauzerga chiqmaydi.
- Barcha to'lov webhook'larida imzo va idempotency bor.
- `service_role` faqat serverda.
- AI mock va test to'lov provayderi production'da o'chiq.
- CSP va `frame-ancestors` sozlangan.

## 8. Tashqi xizmatlar bo'yicha tadqiqot (3-noyabr 2026)

- **LiveKit Cloud:**
  - Narxlar:
    - Build: bepul. Oyiga 5 000 participant-minut va 50 GB. Loyiha bo'yicha jami 100 ulanish. Yozuv uchun 60 daqiqa (qattiq chegara).
    - Ship: $50 dan. 150 000 minut, 250 GB, 1 000 bir vaqtdagi ulanish. Ortiqchasi $0.0005/minut va $0.12/GB.
    - Scale: $500 dan.
  - Fayl yozuvi bitta egress uchun 3 soat bilan cheklangan.
  - Tashkent uchun eng yaqin region va kechikish pilotda o'lchanishi kerak.
- **tldraw SDK:**
  - Production'da litsenziya kaliti majburiy. Kalitsiz 5 soniyadan keyin editor ishlamay qoladi.
  - Hobby litsenziya bepul, lekin "made with tldraw" belgisi bilan.
  - Tijoriy litsenziya narxi ochiq emas ("value-based", sotuv bo'limi orqali). Yangi kompaniyalar uchun startup chegirmasi bor. 100 kunlik bepul trial bor.
- **tldraw sync:**
  - Server `@tldraw/sync-core` (`TLSocketRoom`), mijoz `@tldraw/sync` (`useSync`).
  - Har bir xona uchun dunyoda faqat bitta `TLSocketRoom` bo'lishi shart.
  - Production uchun `SQLiteSyncStorage` tavsiya etiladi.
  - Auth, rate limit va asset saqlash o'zimizdan.
  - Demo server production uchun emas.
  - Rasmiy shablon: Cloudflare Workers + Durable Objects.
- **Vercel WebSocket:** 22-iyun 2026 dan public beta (Fluid compute). Lekin funksiyalar gorizontal masshtablanadi va "bitta xona = bitta jarayon" kafolati yo'q. Shuning uchun tldraw sync uchun mos emas. Sync serveri alohida hostingda bo'ladi.
- **Desmos:**
  - API kaliti `desmos.com/my-api` orqali olinadi.
  - Umumiy demo kalit 2025-yil sentyabrdan bekor qilingan.
  - Platformaga joylashtirish "partner" dasturi orqali.
  - Tijoriy shartlar va narx Desmos bilan kelishilishi kerak. Ochiq hujjatlarda ko'rsatilmagan.

Manbalar:
- [LiveKit pricing](https://livekit.com/pricing.md)
- [LiveKit quotas](https://docs.livekit.io/cloud/quotas-and-limits)
- [tldraw pricing](https://tldraw.dev/pricing)
- [tldraw license key](https://tldraw.dev/sdk-features/license-key)
- [tldraw sync](https://tldraw.dev/docs/sync)
- [Vercel WebSockets beta](https://vercel.com/changelog/websocket-support-is-now-in-public-beta)
- [Desmos API](https://www.desmos.com/api)
- [Desmos partners](https://desmos.com/partners?lang=en)
- [Desmos demo key notice](https://groups.google.com/g/desmos-api-announce/c/fAvghiKr3uQ)

## 9. Egasi bajarishi kerak bo'lgan qadamlar (kodsiz, darhol)

1. Supabase Auth sozlamalari:
   - Site URL `https://sat-iota-nine.vercel.app`;
   - Redirect URL `https://sat-iota-nine.vercel.app/**`.
2. Admin → Study guides → "Import bundled guides".
3. Admin → Question bank → Import → "Import 240 questions as drafts", keyin review va publish.
4. Admin → Telegram → "Configure bot". BotFather'da Mini App URL: `https://sat-iota-nine.vercel.app/tg`.
5. Anthropic API kaliti. Desmos bilan hamkorlik so'rovi.
6. Migratsiya 0015 (atomik limitlar), egasi tasdiqlagandan keyin.
