# SAT MASTER 2.0: xavfsizlik modeli

_Taklif, 3-noyabr 2026. Mavjud himoyalar saqlanadi, multi-tenant Classroom uchun yangi qoidalar qo'shiladi._

## 1. Asosiy tamoyillar

1. **Brauzerdan kelgan ma'lumotga ishonilmaydi.**
   - Har bir API route va server action zod bilan tekshiriladi.
   - Har bir yozuvdan oldin ruxsat **serverda** tekshiriladi.
   - Har bir jadvalda RLS ikkinchi himoya qatlami bo'ladi.
2. **Frontend'da ko'rinmaslik ruxsat emas.** Tugmani yashirish xavfsizlik emas: server va RLS baribir rad etishi kerak.
3. **Sirlar faqat serverda.**
   - `SUPABASE_SERVICE_ROLE_KEY`, `LIVEKIT_API_SECRET`, sync server JWT kaliti, to'lov kalitlari, `TELEGRAM_BOT_TOKEN` va `ANTHROPIC_API_KEY` hech qachon `NEXT_PUBLIC_*` bo'lmaydi va brauzer bundle'iga tushmaydi.
   - Build'dan keyin bundle qidiruv bilan tekshiriladi (javob kalitlari uchun hozir shunday qilinadi).
4. **Minimal huquq.**
   - Token va havolalar qisqa muddatli va bitta maqsadli.
   - `service_role` faqat webhook, token berish va cron'da ishlatiladi. U yerda ham ruxsat avval aniq tekshiriladi.
5. **Hamma muhim amal audit log'ga yoziladi.**
6. **Soxta muvaffaqiyat yo'q.** To'lov, yozuv yoki dars holati faqat tasdiqlangan manbadan o'zgaradi: provayder webhook'i, LiveKit webhook'i yoki server.

## 2. Mavjud himoyalar (saqlanadi)

- **Ma'lumotlar bazasi:**
  - 49 jadvalning hammasida RLS (hosted bazada tekshirildi).
  - Default `EXECUTE` global revoke qilingan; regression testi bor.
  - Mijoz chaqira oladigan funksiyalar ichki rol tekshiruvi bilan.
- **Kontent va javob kalitlari:**
  - Javob kalitlari javob topshirilmaguncha brauzerga chiqmaydi (DB test va bundle qidiruvi).
  - Faqat `reviewed` va `published` savollar o'quvchiga chiqadi (DB darajasida).
  - Davom etayotgan vaqtli testdagi savollar boshqa joylarda (mashq, AI, bookmarks) qulflanadi.
- **To'lovlar:**
  - Click, Payme va Stripe webhook'larida imzo tekshiruvi va `payment_events` orqali idempotency.
  - To'lov holati faqat imzolangan tasdiq bilan o'zgaradi.
  - Moliyaviy yozuvlarni o'chirib bo'lmaydi.
  - Mini App'da to'lov yo'q.
- **Webhook va auth:**
  - Telegram webhook secret header bilan tekshiriladi.
  - SMS hook Standard Webhooks imzosi va 5 daqiqalik oyna bilan tekshiriladi.
  - Telegram login: faqat hash saqlanadi, 10 daqiqalik TTL, bir martalik, httpOnly cookie orqali brauzerga bog'langan.
- **Muhit va brauzer:**
  - AI mock va test to'lov provayderi production'da yoqila olmaydi.
  - Noto'g'ri sozlama saytni yiqitmaydi: e'tiborsiz qoldiriladi, faqat nomi log'ga yoziladi, admin'ga ko'rsatiladi.
  - CSP: `script-src` ro'yxati, `frame-ancestors 'self' https://web.telegram.org`.
  - Rate limit `rate_limits` jadvalida (login, register, AI, Telegram polling).

## 3. Topilgan xavflar va choralar

| # | Xavf | Chora | Qachon |
|---|---|---|---|
| S1 | Global `TEACHER` hamma o'quvchini ko'radi (`can_view_students()`), jumladan Telegram telefon raqamini | Mustaqil ustozlarga global rol **berilmaydi**. Ularning huquqlari faqat `workspace_members` orqali. Global `TEACHER` ichki xodimlar uchun qoladi. `telegram_accounts.phone_number` ni ko'rishni `ADMIN` gacha toraytirish taklif qilinadi | PHASE 3 (0019) |
| S2 | 0015 qo'llanmagan: limitlar bir vaqtdagi so'rovlarda oshishi mumkin | Egasi tasdiqlagach 0015 ni qo'llash | PHASE 1 |
| S3 | Rate limiter bazaga ulana olmasa "fail open" | Auth endpoint'lari uchun xotiradagi zaxira limiter (instansiya bo'yicha) va ogohlantirish. Yoki login va register uchun "fail closed" | PHASE 1 |
| S4 | SVG yuklash | Ustoz fayllari uchun SVG taqiqlanadi yoki sanitizatsiya qilinadi. Signed URL'lar `Content-Disposition: attachment` bilan | PHASE 3 |
| S5 | Standart SMTP | Custom SMTP (Resend, Postmark yoki SES) | Ishga tushirishdan oldin |
| S6 | Kunlik mashq limiti atomik emas | 0015 dagi advisory lock shablonini qo'llash | Backlog |

## 4. Multi-tenant ruxsat modeli

**Ruxsat funksiyasi (server):**

```ts
// src/features/workspaces/permissions.ts
can(actor, action, resource) // masalan can(me, 'session.start', session)
requireWorkspaceRole(workspaceId, ['owner', 'admin', 'teacher'])  // 403 aks holda
```

`action → kerakli rollar` jadvali bitta faylda bo'ladi va unit testlar bilan qoplanadi. RLS funksiyalari (`has_workspace_role`, `can_teach_group`, `is_group_member`) shu jadvalga mos keladi.

**Izolyatsiya qoidalari:**
- Bitta workspace'ning hech qaysi yozuvi boshqa workspace'ga ko'rinmaydi:
  - o'quvchilar;
  - kurslar;
  - fayllar;
  - yozuvlar;
  - to'lovlar;
  - chat;
  - doskalar;
  - tahlil.
- Kompozit foreign key'lar (`workspace_id`, `id`) cross-tenant bog'lanishni DB darajasida taqiqlaydi.
- O'quvchining shaxsiy Learning ma'lumoti (AI suhbatlari, shaxsiy mashq va imtihonlar) ustozga **faqat** `progress_sharing` roziligi bilan ko'rinadi. AI suhbatlari umuman ko'rinmaydi.
- Bitta o'quvchi bir nechta workspace'da bo'lsa, har bir ustoz faqat o'z workspace'idagi ma'lumotni ko'radi.
- Workspace o'chirilsa, avval `archived` qilinadi. Moliyaviy yozuvlar va audit log saqlanadi.

**Takliflar:**
- Token kamida 128 bit tasodifiy. Bazada faqat SHA-256 saqlanadi.
- Muddat, `max_uses` va bekor qilish bor.
- Qisqa kod uchun rate limit bor (taxmin qilishga qarshi).
- Qabul qilish atomik server funksiyasi orqali, `uses` limiti bilan.

## 5. Jonli dars xavfsizligi (LiveKit)

- **Token berish:**
  - Token faqat `POST /api/live/token` orqali beriladi.
  - Server foydalanuvchining sessiyaga huquqini tekshiradi: guruh a'zosi, ustoz, moderator yoki amaldagi mehmon taklifi.
  - Sessiya holati `live` bo'lishi kerak. Host uchun `scheduled` holatida ham beriladi.
- **Token tarkibi:**
  - `room` = `live_sessions.livekit_room`;
  - `identity` = foydalanuvchi id (taxmin qilib bo'lmaydigan room nomi bilan);
  - TTL 10–15 daqiqa;
  - `canPublishSources` rolga qarab: `participant` uchun kamera va mikrofon ("Both Plus"); ekran ulashish faqat host, co-host va host ruxsat berganda;
  - `roomAdmin` faqat host va moderatorga.
- **Boshqaruv:** mute, kick va ruxsat berish server API orqali `RoomService` bilan bajariladi. Mijoz o'z huquqini oshira olmaydi, chunki huquq tokenda va serverda.
- **Webhook:**
  - `WebhookReceiver` bilan imzo va body hash tekshiriladi;
  - `webhook_events.event_id` bilan idempotency;
  - davomat va daqiqa hisobi faqat webhook'dan.
- **Yozuv:**
  - Yozuv faqat sessiya siyosati ruxsat bersa yoqiladi.
  - Ishtirokchilarga ekranda doimiy "Yozilmoqda" belgisi ko'rsatiladi.
  - Kirishda rozilik so'raladi, rad etgan ishtirokchi kamera va mikrofonsiz qatnashadi.
  - Fayllar private bucket'da, signed URL orqali, faqat workspace a'zolariga beriladi.
  - Saqlash muddati (`expires_at`) bor.
- **Kalitlar:** `LIVEKIT_API_KEY` va `LIVEKIT_API_SECRET` faqat server env'da.

## 6. Doska xavfsizligi (tldraw sync)

- **Ulanish:** sync serverga ulanish faqat Next.js bergan JWT bilan. Tarkibi:
  - `sub` (foydalanuvchi);
  - `room`;
  - `canEdit`;
  - `exp` (15 daqiqa);
  - HMAC yoki asimmetrik imzo.

  Server har bir ulanishda JWT ni tekshiradi. `canEdit = false` bo'lsa, mijoz o'zgarishlarini rad etadi.
- **Asset'lar:**
  - faqat server orqali yuklanadi;
  - hajm va MIME chegarasi bor, SVG yo'q;
  - yo'l `workspace_id` bilan boshlanadi.
- **Cheklovlar:** xona bo'yicha ulanishlar soni, xabar hajmi va tezligi (rate limit).
- **Demo server:** public demo sync server hech qachon ishlatilmaydi.
- **Litsenziya:** tldraw litsenziya kaliti public bo'ladi (SDK uni brauzerda talab qiladi). Bu sir emas, lekin faqat bizning domenga bog'lanadi.

## 7. Audit log

Mavjud `audit_logs` kengaytiriladi: `workspace_id` ustuni qo'shiladi (null = platforma). Yoziladigan amallar:
- workspace yaratish yoki arxivlash;
- a'zo qo'shish, rol o'zgartirish yoki chiqarish;
- taklif yaratish yoki bekor qilish;
- dars boshlash yoki tugatish;
- yozuv boshlash yoki to'xtatish;
- ishtirokchini chiqarish;
- vazifani baholash;
- fayl o'chirish;
- billing o'zgarishi;
- `progress_sharing` berish yoki qaytarib olish.

Workspace owner va admin o'z workspace'ining audit log'ini ko'radi. Platforma admin'i hammasini ko'radi.

## 8. Testlash talablari

Har bir yangi jadval uchun DB testlarida (`tests/integration`) **alohida-alohida** tekshiriladi:
- **SELECT:**
  - o'z workspace'ida ko'radi;
  - boshqa workspace'da 0 qator;
  - anonim foydalanuvchi uchun `permission denied`.
- **INSERT:**
  - boshqa workspace'ga yozib bo'lmaydi;
  - o'quvchi ustoz yozuvini yarata olmaydi.
- **UPDATE:**
  - `workspace_id` va egasini o'zgartirib bo'lmaydi;
  - boshqa workspace'ni o'zgartirib bo'lmaydi.
- **DELETE:**
  - ruxsat etilmagan rol uchun rad;
  - append-only jadvallar uchun hamma uchun rad.

Bundan tashqari:
- **Ikki ustoz, bitta umumiy o'quvchi** stsenariysi: har bir ustoz faqat o'z ma'lumotini ko'radi.
- **API va E2E:**
  - URL'dagi id'ni almashtirish (IDOR) 403 yoki 404 beradi;
  - muddati o'tgan yoki bekor qilingan taklif rad etiladi;
  - LiveKit va doska tokenini ruxsatsiz olib bo'lmaydi;
  - soxta webhook rad etiladi.
