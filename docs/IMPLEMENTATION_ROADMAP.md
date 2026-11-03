# SAT MASTER 2.0: amalga oshirish yo'l xaritasi

_Taklif, 3-noyabr 2026. Egasi ko'rib chiqib tasdiqlamaguncha hech qanday bosqich boshlanmaydi._

## Har bir bosqichda ishlash tartibi

1. Maqsad va aniq fayllar ro'yxati egasiga ko'rsatiladi.
2. Kod yoziladi. Mavjud funksiyalar saqlanadi.
3. Quyidagi tekshiruvlar o'tkaziladi:
   - typecheck va lint;
   - unit testlar;
   - DB testlari: yangi jadvallar uchun SELECT, INSERT, UPDATE va DELETE alohida;
   - production build;
   - kerakli joyda Playwright E2E.
4. Hosted bazaga migratsiya faqat egasi tasdiqlagandan keyin qo'llanadi.
5. Hisobot: nima ishlaydi, nima qoldi, nima sinalmagan. Kalit yo'q integratsiyalar NOT_CONFIGURED deb belgilanadi.

## Ustuvorlik bo'yicha bosqichlar

### PHASE 1: Ishga tushirishga tayyorlik va o'quvchi paneli 2.0 (taxminan 1–1,5 hafta)

**Nima uchun birinchi.** Production'da kontent yo'q va kalitlar ulanmagan. Yangi ustunlardan oldin mavjud mahsulot real o'quvchiga ishlashi kerak.

- **Egasi qiladigan qadamlar** (kodsiz):
  - kontent importi;
  - Site URL;
  - "Configure bot";
  - Anthropic kaliti;
  - Desmos hamkorlik so'rovi.

  Ro'yxat: [CURRENT_PROJECT_AUDIT.md](CURRENT_PROJECT_AUDIT.md) §9.
- **Migratsiya 0015** (atomik limitlar): tasdiq bilan.
- **Rate limiter:** login va register uchun "fail open" o'rniga xotiradagi zaxira limiter (S3).
- **O'quvchi paneli 2.0:** quyidagi bo'limlar real ma'lumot bilan:
  - kunlik missiya;
  - 8 domen mastery xaritasi;
  - haftalik faollik va maqsad;
  - so'nggi xatolar;
  - yaqin imtihonlar;
  - aniq bo'sh holatlar;
  - Desmos'ga tez kirish ("Kalkulyator" tugmasi, faqat Math).
- **Marketing matnlarini haqiqatga moslash:** video darslar kontent paydo bo'lgunga qadar va'da qilinmaydi.

Fayllar:
- `src/app/dashboard/(app)/page.tsx`
- `src/features/dashboard/server.ts`
- `src/features/dashboard/logic.ts`
- `src/components/dashboard/{cards,lists}.tsx` va yangi `mission.tsx`, `mastery-map.tsx`
- `src/lib/i18n/dictionaries/dashboard.ts`
- `src/lib/security/rate-limit.ts`
- `src/lib/i18n/dictionaries/public.ts`

Migratsiya: **0015** (mavjud fayl). Yangi jadval kerak emas: missiya avval hisoblanadi, saqlanmaydi.

### PHASE 2: Learning to'liqligi va rus tili (taxminan 2 hafta)

- **Xatolar daftari sahifasi:** hamma xatolar, ko'nikma bo'yicha filtr, "qayta ishlash" va "o'zlashtirildi".
- **Flashcards:** platforma decklari (SAT lug'ati, formulalar) va spaced repetition (SM-2).
- **Muddatli mashqlar (timed drills):** mashq rejimiga server vaqti qo'shiladi (diagnostika mexanizmidan foydalanib).
- **Yutuqlar va haftalik maqsadlar:** faqat real faollikdan.
- **Rus tili:**
  - `LOCALES` ga `ru`;
  - 18 ta lug'at fayli va komponent ichidagi lug'atlarga `ru`;
  - `ru` majburiy turga o'tkaziladi;
  - inline matnlar lug'atga ko'chiriladi;
  - til tanlagichda ruscha;
  - Telegram bot matnlari ham ruscha.
- **Admin panel lug'atlarga o'tkaziladi:** uz, en, ru. Hajmi katta bo'lgani uchun alohida qadam.
- **Mamlakat sozlamasi:**
  - `country_configs` jadvali;
  - `profiles.country_code`;
  - mamlakatga qarab narx, valyuta va to'lov provayderi.

Fayllar:
- yangi `src/features/learning-extras/*`;
- yangi `src/app/dashboard/(app)/{mistakes,flashcards}/page.tsx`;
- `src/features/practice/*`;
- `src/lib/i18n/config.ts`, `dict.ts`, `dictionaries/*.ts`;
- `src/components/**` (inline matnlar);
- `src/app/admin/**`;
- `src/features/telegram/bot-copy.ts`;
- `src/features/payments/*`, `src/features/plans/*`;
- `src/config/navigation.ts`.

Migratsiya: **0018** (`20261103001800_learning_extras.sql`: `mistakes` mashq rejimi, `flashcard_reviews`, `profiles.country_code`). Mamlakat qoidalari kodda (`src/config/countries.ts`), alohida jadval kerak bo'lmadi.

**Holat (3-noyabr):** bajarildi. Admin panel tarjimasi alohida qadam sifatida qoldi (hali faqat inglizcha).

### PHASE 3: Ustoz workspace'lari, Classroom asosi (taxminan 2–3 hafta)

- Workspace yaratish va boshqarish:
  - ustoz ro'yxatdan o'tadi yoki mavjud akkaunt bilan "Ustoz sifatida boshlash"ni tanlaydi;
  - workspace profili;
  - fanlar.
- A'zolar va rollar. Taklif: havola, QR yoki kod. Bir nechta workspace'da a'zolik va ular orasida almashtirgich.
- Kurslar, guruhlar va materiallar (PDF, slaydlar, rasmlar) private bucket'da.
- Vazifalar:
  - platforma mashq to'plami, imtihon yoki savollar;
  - fayl yoki matnli vazifa;
  - topshiriqlar va baholash.
- O'quvchi progressi:
  - vazifa natijalari;
  - `progress_sharing` roziligi bilan Learning natijalari;
  - guruh tahlili.
- Ustoz paneli:
  - kurslar, guruhlar, o'quvchilar;
  - jadval (hali jonli darssiz);
  - vazifalar;
  - tahlil.
- Audit log'ga `workspace_id`.
- S1 chorasi: global `TEACHER` faqat ichki xodimlar uchun. Telefon raqamini ko'rish torayadi.

Fayllar:
- yangi `src/features/{workspaces,classroom,assignments}/*`;
- yangi `src/app/teach/**` (ustoz ilovasi; alohida layout va navigatsiya);
- yangi `src/app/dashboard/(app)/classes/**` (o'quvchi tomoni: guruhlarim, vazifalar);
- `src/config/navigation.ts`, `src/config/roles.ts`;
- `src/lib/auth/session.ts` (workspace konteksti);
- `src/lib/audit.ts`.

Migratsiya: **0019** (workspaces, a'zolar, takliflar), **0020** (classroom), **0023** (assignments), `audit_logs.workspace_id`.

Testlar:
- har bir jadval uchun 4 operatsiya;
- "ikki ustoz, bitta o'quvchi" izolyatsiyasi;
- IDOR;
- taklif muddati va limiti.

### PHASE 4: Jonli dars va online doska (taxminan 3–4 hafta)

**4a. Video va dars hayot sikli (LiveKit):**
- jadval (takrorlanuvchi darslar, timezone);
- "Darsni boshlash" va "Tugatish";
- token endpoint;
- xona UI:
  - grid va spikerlar;
  - "Both Plus" (hamma kamera va mikrofon bilan);
  - ekran ulashish;
  - qo'l ko'tarish;
  - chat;
  - ishtirokchilarni boshqarish;
  - mehmon ustoz va moderator;
- qayta ulanish;
- webhook orqali davomat;
- hodisalar jurnali.

**4b. Doska (tldraw + sync server):**
- sync server alohida papkada (`services/whiteboard-sync`): Cloudflare Worker + Durable Objects, JWT tekshiruvi;
- doska sahifalari;
- formula (KaTeX va MathLive);
- grafik (Desmos kaliti bo'lsa Desmos, aks holda ochiq kodli plotter);
- PDF va rasm yuklab ustiga chizish;
- dars tugaganda snapshot arxivga.

**4c.** So'rovnoma va mini-quiz, breakout xonalar.

**4d.** Yozuv:
- rozilik;
- LiveKit Egress → object storage;
- muddat;
- workspace tarifi bo'yicha daqiqa va hajm hisobi.

Fayllar:
- yangi `src/features/{live,whiteboard,scheduling}/*`;
- yangi `src/app/teach/sessions/**`, `src/app/live/[sessionId]/page.tsx`;
- yangi `src/app/api/live/{token,control}/route.ts`;
- yangi `src/app/api/webhooks/livekit/route.ts`;
- yangi `src/app/api/whiteboard/token/route.ts`;
- yangi `services/whiteboard-sync/**`;
- `next.config.ts` (CSP: LiveKit `wss://`, sync server `wss://`);
- `src/lib/env.ts` (LiveKit va sync server sozlamalari, server-only).

Migratsiya: **0021** (jadval, sessiyalar, davomat, chat, so'rovnoma, yozuv), **0022** (doska).

Yangi bog'liqliklar:
- `livekit-server-sdk`, `livekit-client`, `@livekit/components-react`;
- `tldraw`, `@tldraw/sync`;
- `mathlive`;
- `pdfjs-dist`.

### PHASE 5: Ustoz billing'i va jalb qilish (taxminan 1,5–2 hafta)

- Workspace tariflari: o'quvchi, daqiqa va hajm chegaralari. Click, Payme va Stripe orqali to'lov, mavjud webhook infratuzilmasi bilan.
- Jalb qilish:
  - sinf challenge'lari;
  - guruh ichidagi progress leaderboard;
  - sinov imtihoni tadbirlari;
  - shaxsiy AI tavsiyalari.
- Bildirishnomalar: dars eslatmasi (ilova ichida va Telegram bot orqali, foydalanuvchi rozi bo'lsa).

Migratsiya: **0024** (workspace billing) va guruh leaderboard'i.

### PHASE 6: Dizayn tizimi va sifat

Bu bosqich alohida bo'lmaydi, har bir bosqich ichida bajariladi. Mavjud [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) kengaytiriladi:
- ustoz ilovasi;
- dars xonasi (qorong'i fon, video);
- doska;
- ruscha matn uzunligi.

Har bir bosqich oxirida:
- 390, 768 va 1280 px tekshiruvi;
- accessibility;
- bo'sh, yuklanish, xato va muvaffaqiyat holatlari.

### PHASE 7: Marketplace (core barqaror bo'lgandan keyin)

- Ustoz ochiq profili, katalog va qidiruv.
- Kurs sotib olish → guruhga avtomatik qo'shilish (`entitlements`).
- Platforma komissiyasi va ustozga to'lov (payout). Payout uchun alohida huquqiy va moliyaviy tahlil kerak.

Migratsiya: **0025+**.

## Egasi qabul qilishi kerak bo'lgan qarorlar

| # | Savol | Tavsiya |
|---|---|---|
| D-1 | LiveKit Cloud tarifi | Pilot uchun Build (bepul, 100 ulanish). Real darslar boshlanganda Ship ($50+). Tashkentdan kechikishni pilotda o'lchash |
| D-2 | tldraw tijoriy litsenziyasi (narx sotuv orqali) yoki Excalidraw (MIT, bepul) | 100 kunlik trial bilan boshlash va startup narxini so'rash. Narx mos kelmasa Excalidraw. Qaror PHASE 4 dan oldin |
| D-3 | Doska sync server hostingi | Cloudflare Workers + Durable Objects (tldraw rasmiy shabloni, Workers Paid tarifi) |
| D-4 | Desmos | Desmos partner dasturiga ariza. Javob kelguncha ochiq kodli grafik va hozirgi havola |
| D-5 | Ustoz tariflari va narxlari (UZS va USD) | Egasi belgilaydi. Kod chegaralarni sozlanadigan qiladi |
| D-6 | Dars yozuvlarini saqlash joyi va muddati | Supabase Storage (private), 30–90 kun. Shaxsiy ma'lumotlar qonuni bo'yicha yurist fikri |
| D-7 | Xalqaro to'lov uchun yuridik shaxs (Stripe) | O'zbekistondan tashqarida ro'yxatdan o'tgan kompaniya kerak. Bo'lmaguncha xalqaro to'lov NOT_CONFIGURED |
| D-8 | 0015 migratsiyasini qo'llash | Ha. Faqat yangi jadval va 2 funksiya, mavjud ma'lumotga tegmaydi |

## O'zgarishi kutilayotgan fayllar va migratsiyalar (jamlanma)

**Yangi migratsiyalar:**

| # | Mazmun |
|---|---|
| 0018 | **Yozilgan (PHASE 2):** `mistakes` mashq rejimi, `flashcard_reviews`, `profiles.country_code` |
| 0019 | Workspaces, members, invitations, `audit_logs.workspace_id` |
| 0020 | `ws_courses`, `groups`, `group_members`, `materials`, `progress_sharing`, `workspace-files` bucket |
| 0021 | `live_sessions`, recurrences, guests, participants, `attendance`, `live_events`, `chat_messages`, polls, `recordings`, consents, `webhook_events`, `usage_counters` |
| 0022 | `whiteboards`, snapshots, assets |
| 0023 | `assignments`, `assignment_questions`, `submissions`, `submission_files` |
| 0024 | Workspace plans, prices, subscriptions; `payments.purpose` kengaytmasi; guruh leaderboard'i |
| 0025+ | Marketplace |

Mavjud migratsiya: **0015** (qo'llanmagan).

**O'zgaradigan mavjud fayllar (asosiylari):**
- **Panel:** `src/app/dashboard/(app)/page.tsx`, `src/features/dashboard/*`, `src/components/dashboard/*`.
- **i18n:** `src/lib/i18n/{config,dict}.ts`, `src/lib/i18n/dictionaries/*.ts` (18 fayl).
- **Navigatsiya va rollar:** `src/config/{navigation,roles}.ts`.
- **Auth, audit, xavfsizlik:** `src/lib/auth/session.ts`, `src/lib/audit.ts`, `src/lib/security/rate-limit.ts`.
- **Sozlamalar va brauzer siyosati:** `src/lib/env.ts`, `next.config.ts`.
- **To'lov:** `src/features/payments/*`, `src/lib/payments/registry.ts`.
- **Matn va bot:** `src/lib/i18n/dictionaries/public.ts`, `src/features/telegram/bot-copy.ts`.
- **Admin:** `src/app/admin/**` (lug'atga o'tkazish).

**Yangi papkalar:**
- `src/features/{workspaces,classroom,scheduling,live,whiteboard,assignments,learning-extras}`;
- `src/app/teach/**`;
- `src/app/live/**`;
- `src/app/api/live/**`, `src/app/api/whiteboard/**`, `src/app/api/webhooks/livekit`;
- `services/whiteboard-sync/**`;
- tegishli testlar: `tests/unit/*`, `tests/integration/*`.

**Yangi muhit sozlamalari** (hammasi server-only, faqat litsenziya va URL public):
- `LIVEKIT_URL` (public: `NEXT_PUBLIC_LIVEKIT_URL`), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`;
- `WHITEBOARD_SYNC_URL` (public), `WHITEBOARD_JWT_SECRET`;
- `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` (public by design);
- Egress yozuvlari uchun storage kalitlari.
