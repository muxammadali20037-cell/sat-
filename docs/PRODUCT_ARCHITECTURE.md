# SAT MASTER 2.0: mahsulot arxitekturasi

_Taklif, 3-noyabr 2026. Kod hali o'zgartirilmagan; bu reja egasi ko'rib chiqishi uchun._

## 1. Tasdiqlangan qarorlar

| Qaror | Qiymat |
|---|---|
| Tillar | `uz`, `en`, `ru`; yangi til qo'shish lug'at fayli darajasida bo'lishi kerak |
| Jonli dars | "Both Plus": ustoz ham, o'quvchilar ham kamera va mikrofon ishlatadi; mehmon ustoz va moderator bor |
| Bozor | O'zbekiston va xalqaro bozor parallel: mamlakatga qarab valyuta, to'lov provayderi, timezone va formatlash |
| Arxitektura | Modular monolith (Next.js App Router + Supabase); faqat real-time doska sinxronizatsiyasi alohida servis |
| Video | LiveKit Cloud: server tomonida beriladigan qisqa muddatli token, imzosi tekshiriladigan webhook |
| Doska | tldraw SDK va o'zimiz host qiladigan sync server; public demo server production'da hech qachon ishlatilmaydi |

## 2. Uch ustun va ular qanday bog'lanadi

```
                      ┌──────────── Identity (Supabase Auth, profiles) ────────────┐
                      │                                                            │
   ┌──────────────────▼─────────┐   ┌──────────────────────────┐   ┌──────────────▼────────┐
   │ A. Learning (bor)          │   │ B. Classroom (yangi)     │   │ C. Marketplace (keyin) │
   │ diagnostika, dars, mashq,  │◄──┤ workspace, kurs, guruh,  │◄──┤ ustoz profili, katalog,│
   │ imtihon, AI ustoz, reja,   │   │ jadval, jonli dars,      │   │ kurs sotish, kirish     │
   │ xatolar, flashcard, tahlil │   │ doska, vazifa, davomat   │   │ huquqi                  │
   └────────────┬───────────────┘   └────────────┬─────────────┘   └──────────┬─────────────┘
                │                                 │                            │
                └───────── Umumiy: kontent banki, billing, i18n, audit, notifications ──┘
```

- **Learning** platformaning o'z kontenti (SAT MASTER savollari, darslari, qo'llanmalari) asosidagi mustaqil o'qish. Hozirgi kod shu.
- **Classroom** ustoz yoki o'quv markazi uchun SaaS. Ustoz o'z workspace'ida o'quvchilarni guruhlarga yig'adi, jonli dars o'tadi, vazifa beradi. Vazifa sifatida platforma kontentini (savollar, mashq to'plamlari, imtihonlar) yoki o'zining materialini beradi. O'quvchining mashq natijalari (Learning) ustozga **faqat shu workspace a'zoligi va o'quvchi roziligi doirasida** ko'rinadi.
- **Marketplace** keyingi bosqich. Ustoz profili va kursi ommaga chiqadi, o'quvchi kursni sotib oladi va avtomatik ravishda tegishli workspace guruhiga qo'shiladi. Hozir faqat ma'lumot modeli va kirish huquqi abstraksiyasi (`entitlements`) shunga tayyorlanadi.

Bitta foydalanuvchi bir vaqtda:
- o'quvchi bo'lishi mumkin: o'z Learning hisobi bor;
- bir nechta workspace'da o'quvchi bo'lishi mumkin;
- o'z workspace'ida ustoz bo'lishi mumkin;
- boshqa workspace'da mehmon ustoz yoki moderator bo'lishi mumkin.

Shuning uchun rol endi profilga emas, **a'zolikka** bog'lanadi (2.0 dagi asosiy o'zgarish).

## 3. Rollar

Ikki daraja:

1. **Platforma rollari** (mavjud `profiles.role`, o'zgarmaydi):
   - `SUPER_ADMIN`, `ADMIN`: SAT MASTER kompaniyasi xodimlari;
   - `CONTENT_EDITOR`: platforma kontenti;
   - `STUDENT`: oddiy foydalanuvchi.

   Hozirgi global `TEACHER` faqat SAT MASTER'ning ichki xodimlari uchun qoladi. Mustaqil ustozlarga berilmaydi.

2. **Workspace rollari** (yangi, `workspace_members.role`):

| Rol | Kim | Asosiy huquqlar |
|---|---|---|
| `owner` | Workspace yaratgan ustoz yoki markaz rahbari | Hammasi: billing, a'zolar, sozlamalar, o'chirish |
| `admin` | Markaz administratori | A'zolar, kurslar, guruhlar, jadval; billing'ni faqat ko'radi |
| `teacher` | Ustoz | O'z kurs va guruhlari, dars o'tish, vazifa, baholash, davomat, guruh tahlili |
| `assistant` | Yordamchi ustoz | Teacher kabi, lekin kurs yoki guruh yaratmaydi va o'chirmaydi |
| `student` | O'quvchi | O'z guruhlari, darslar, vazifalar, o'z natijalari |

3. **Dars ichidagi rollar** (bitta `live_session` uchun, workspace roliga qo'shimcha):

| Rol | Huquqlar |
|---|---|
| `host` | Darsni boshlash va tugatish, hamma boshqaruv, yozuv |
| `co_host` (mehmon ustoz) | Gapirish, ekran ulashish, doskani boshqarish, so'rovnoma; darsni tugata olmaydi, yozuvni boshqarmaydi |
| `moderator` | Mikrofon va kamerani o'chirish, chiqarib yuborish, qo'l ko'tarishga ruxsat, chatni boshqarish; kontent bermaydi |
| `participant` | Kamera va mikrofon ("Both Plus"), chat, qo'l ko'tarish, doskaga host ruxsat bersa yozish |
| `observer` | Faqat ko'rish (masalan ota-ona yoki tekshiruvchi, kelajakda) |

Mehmon ustoz workspace a'zosi bo'lishi shart emas: unga **bitta dars uchun** taklif (`live_session_guests`) beriladi va u faqat o'sha darsga kiradi.

## 4. Modul tuzilishi (modular monolith)

Mavjud `src/features/<modul>` tuzilishi saqlanadi va yangi modullar qo'shiladi:

```
src/features/
  (mavjud) auth, profile, onboarding, dashboard, courses, lessons, practice, diagnostic, exams,
           results, analytics, study-plan, ai-tutor, bookmarks, guides, content, questions,
           entitlements, subscriptions, payments, plans, notifications, activity, admin, telegram, taxonomy
  (yangi)  workspaces/      workspace, a'zolik, taklif, ruxsat tekshiruvi (can())
           classroom/       guruhlar, workspace kurslari, materiallar
           scheduling/      dars jadvali, takrorlanuvchi darslar, timezone
           live/            LiveKit token, xona hayot sikli, webhook, davomat, yozuv
           whiteboard/      doska hujjatlari, sync token, snapshot, asset'lar
           assignments/     vazifa, topshiriq, baholash
           learning-extras/ flashcards, xatolar daftari, missiyalar, yutuqlar
           i18n-ru/         rus lug'atlari (src/lib/i18n/dictionaries/*.ts ichida `ru`)
           market/          (keyin) ustoz profili, katalog, kurs sotish
```

Har bir yangi modulda bir xil qatlamlar bo'ladi:
- **zod sxema:** kiruvchi ma'lumot tekshiruvi;
- **`server.ts`:** biznes logika, faqat serverda;
- **ruxsat tekshiruvi:** `requireWorkspaceRole(...)`;
- **Supabase so'rovlari:** RLS ostida;
- **audit log:** muhim amallar uchun.

`service_role` faqat RLS bilan ifodalab bo'lmaydigan joylarda ishlatiladi: webhook'lar, token berish, cron. U yerda ham kirishdan oldin aniq ruxsat tekshiriladi.

## 5. Real-time komponentlar

```
Brauzer (Next.js)
  ├── HTTPS ──► Next.js (Vercel)  ── RLS ──► Supabase Postgres / Storage
  │               │  ├─ POST /api/live/token        → LiveKit AccessToken (TTL 10–15 daqiqa)
  │               │  ├─ POST /api/whiteboard/token  → doska JWT (TTL 15 daqiqa, room + rol)
  │               │  └─ POST /api/webhooks/livekit  ← imzosi tekshiriladi
  ├── WebRTC ──► LiveKit Cloud     (video, audio, ekran, data: qo'l ko'tarish, reaksiya)
  └── WSS ────► Whiteboard sync    (tldraw TLSocketRoom: har xona uchun bitta jarayon)
                  └─ SQLite snapshot + Postgres'ga davriy nusxa, asset'lar → object storage
```

**Video va audio: LiveKit Cloud.**
- Server `livekit-server-sdk` bilan token beradi:
  - `roomJoin` faqat o'sha `room` uchun;
  - `canPublish`, `canPublishSources` va `canSubscribe` rolga qarab;
  - `roomAdmin` faqat host va moderatorga;
  - token muddati qisqa.
- Moderator amallari (mute, kick, ruxsat berish) server API orqali LiveKit `RoomService` ga yuboriladi. Mijoz o'ziga huquq bera olmaydi.
- Webhook'lar `WebhookReceiver` bilan tekshiriladi: `participant_joined/left` (davomat), `room_finished`, `egress_ended` (yozuv). Idempotency `webhook_events` jadvali orqali.
- Ulanish uzilsa, LiveKit SDK o'zi qayta ulanadi. UI "qayta ulanmoqda" holatini ko'rsatadi, token tugasa yangisi so'raladi.
- "Both Plus" uchun video:
  - simulcast va adaptive stream;
  - o'quvchilar griddida faqat ko'rinayotgan plitkalarga obuna (sahifalash);
  - ustoz videosi va ekran ustuvor.

**Doska: tldraw + o'zimizning sync server.**
- Tavsiya: tldraw'ning rasmiy shablonidagi **Cloudflare Workers + Durable Objects**. Har xona bitta Durable Object bo'ladi: "bitta xona = bitta `TLSocketRoom`" kafolati shundan keladi. SQLite saqlash shu yerda, asset'lar R2'da.
- Alternativa: Fly.io yoki Railway'da Node server, `SQLiteSyncStorage` va doimiy disk bilan. Bitta instansiya, xonalar shu jarayonda; kattalashganda xona bo'yicha sharding.
- Vercel WebSocket (beta) bu vazifa uchun ishlatilmaydi: xona bitta jarayonda qolishi kafolatlanmaydi.
- Auth tartibi:
  1. Next.js workspace a'zoligini tekshiradi.
  2. Qisqa muddatli JWT beradi: `room`, `role`, `canEdit`, `exp`.
  3. Sync server JWT'ni umumiy kalit bilan tekshiradi. Faqat o'qish huquqli foydalanuvchining o'zgarishlari rad etiladi.
- Saqlash: sync server har bir xona snapshot'ini saqlaydi. Dars tugaganda snapshot Postgres'dagi `whiteboard_snapshots` ga va Storage'ga ko'chiriladi. Bu dars konspekti va arxiv bo'ladi.
- Matematika:
  - formula: KaTeX bilan render qilinadigan custom shape (KaTeX loyihada bor), kiritish uchun MathLive;
  - grafik: custom "graph" shape. Desmos kaliti va hamkorlik bo'lsa Desmos, bo'lmasa ochiq kodli plotter (masalan Mafs yoki function-plot; litsenziya keyin tekshiriladi).
- PDF: sahifalar serverda yoki brauzerda rasmga aylantiriladi (pdf.js) va doskaga fon sifatida qo'yiladi. Ustiga chizish mumkin.
- Litsenziya: production uchun tldraw tijoriy litsenziyasi kerak (narx sotuv orqali). Litsenziya rad etilsa yoki qimmat bo'lsa, zaxira variant Excalidraw (MIT, bepul). Bu qaror egasiniki (IMPLEMENTATION_ROADMAP, D-2).

**Chat, qo'l ko'tarish, so'rovnoma.**
- Saqlanishi kerak bo'lgan narsalar Postgres'ga server API orqali yoziladi:
  - chat xabarlari;
  - so'rovnoma va ovozlar;
  - quiz javoblari.

  Keyin LiveKit data message orqali xonaga tarqatiladi (server `sendData`).
- Vaqtinchalik signallar faqat LiveKit data kanalida, bazaga yozilmaydi:
  - qo'l ko'tarish;
  - reaksiyalar;
  - "yozmoqda".
- Breakout xonalar: alohida LiveKit room'lar. Har biri uchun alohida token, doska sahifasi esa ixtiyoriy.

## 6. Ko'p tillilik va xalqaro bozor

- **Lug'atlar:** hozirgi `defineDict({ en, uz, ru? })` tizimi saqlanadi.
  - `LOCALES` ga `ru` qo'shiladi.
  - `uz` bilan bir xil qat'iylikda `ru` ham to'liq bo'lishi majburiy qilinadi (tur darajasida).
  - Inline `locale === 'uz' ? … : …` matnlar lug'atga ko'chiriladi.
  - Admin panel ham lug'atga o'tkaziladi.
- **Kontent tili:**
  - savollar inglizcha (SAT);
  - tushuntirishlar `en` va `uz`, keyin `ru`: `question_explanations.locale` allaqachon bor;
  - workspace kontenti ustoz yozgan tilda.
- **Mamlakat konfiguratsiyasi** (yangi `country_configs` jadvali):
  - `country_code`;
  - `default_locale`;
  - `currency`;
  - `default_timezone`;
  - ruxsat etilgan to'lov provayderlari: UZ → Click, Payme; boshqalar → Stripe (Stripe uchun O'zbekistondan tashqarida ro'yxatdan o'tgan yuridik shaxs kerak);
  - soliq va chek sozlamalari.
- **Mamlakatni aniqlash:** `profiles.country_code` (onboarding'da so'raladi, IP bo'yicha taxmin qilinadi) va workspace'ning `country_code`.
- **Vaqt:**
  - barcha vaqtlar `timestamptz` (UTC);
  - foydalanuvchiga `profiles.timezone` bo'yicha ko'rsatiladi;
  - dars jadvali workspace timezone'ida tuziladi, har bir ishtirokchiga o'z vaqtida ko'rsatiladi.

## 7. Billing modeli (2.0)

Ikki xil xaridor:

1. **O'quvchi** Learning tarifini sotib oladi (mavjud: `plans`, `subscriptions`, `payments`).
2. **Ustoz yoki markaz** Classroom tarifini sotib oladi (yangi: `workspace_subscriptions`). Chegaralar:
   - faol o'quvchilar soni;
   - oyiga jonli dars daqiqalari;
   - yozuv saqlash hajmi;
   - ustozlar soni.

Ikkalasi ham bitta `payments` va `payment_events` jurnali va bitta webhook infratuzilmasidan foydalanadi. Faqat `purpose` farq qiladi: `subscription` yoki `workspace_subscription`; keyinchalik `course_purchase`.

Qoidalar o'zgarmaydi:
- to'lov holati faqat imzolangan provayder tasdig'i bilan o'zgaradi;
- avtomatik takroriy yechish faqat provayder qo'llasa va mijoz rozi bo'lsa bo'ladi;
- moliyaviy yozuvlar o'chirilmaydi.

**Xarajat nazorati.** Jonli dars LiveKit daqiqasi va trafigi bo'yicha pul turadi. Shuning uchun:
- workspace bo'yicha daqiqa hisobi yuritiladi (webhook asosida);
- tarif chegarasi server tomonida tekshiriladi;
- yozuv faqat tarifda bo'lsa yoqiladi.

Taxminiy hisob (pilotda o'lchanadi): Ship tarifida 1 ustoz + 20 o'quvchi, 90 daqiqa:
- taxminan 1 900 participant-minut;
- har bir o'quvchiga o'rtacha 2 Mbit/s bo'lsa, taxminan 25–30 GB trafik;
- kiritilgan hajmdan oshgach, bitta dars taxminan $3–5.

## 8. O'quvchi paneli 2.0

Talab qilingan bo'limlar real ma'lumotdan quriladi:

| Bo'lim | Manba |
|---|---|
| Salom, maqsad ball, imtihon sanasi, countdown | `profiles` (mavjud) |
| Joriy taxminiy ball | oxirgi diagnostika yoki imtihon (mavjud) |
| Bugungi missiya | yangi `daily_missions`: o'quv reja vazifalari + xatolarni takrorlash + flashcard |
| Davom ettirish | mavjud `continueLearning` |
| 8 domen bo'yicha mastery | mavjud skill performance, domen bo'yicha agregatsiya |
| Haftalik faollik va haftalik maqsad | `user_daily_activity` (mavjud) + yangi `weekly_goals` |
| Yaqin jonli darslar | yangi `live_sessions` (a'zo bo'lgan guruhlar) |
| AI ustoz kirish nuqtasi | mavjud |
| So'nggi xatolar | `attempt_answers` (is_correct = false) |
| Streak va yutuqlar | mavjud streak + yangi `achievements` |
| Yaqin sinov imtihonlari | mavjud |

Bo'sh holatlar ochiq va harakatga chaqiradi: "Diagnostikadan boshlang", "Ustozingiz taklif havolasi orqali qo'shiling". Soxta raqam yoki namuna ma'lumot ko'rsatilmaydi.

## 9. Kelajakdagi fanlar

Hozirgi tuzilma `subjects → domains → skills → questions` fanlardan mustaqil. SAT'ga xos qismlar:
- scoring (`src/lib/scoring`);
- adaptiv imtihon tuzilishi;
- kontent.

2.0 da bitta yuqori daraja qo'shiladi: `programs` (masalan `sat`, `ielts`). Har bir program o'z fanlari va scoring strategiyasiga ega bo'ladi. Classroom fanlardan mustaqil: ustoz fizika guruhini ham ochishi mumkin, shunda platforma kontentisiz, faqat o'z materiallari bilan ishlaydi.

## 10. Nima o'zgarmaydi

- Mavjud auth: email, Google, Telegram, telefon.
- Mavjud Learning funksiyalari va ularning testlari.
- Billing qoidalari.
- Javob kalitlari himoyasi.
- Audit log.
- Telegram Mini App (unda ham to'lov yo'q).

Hech qaysi ishlayotgan funksiya o'chirilmaydi yoki maket bilan almashtirilmaydi.
