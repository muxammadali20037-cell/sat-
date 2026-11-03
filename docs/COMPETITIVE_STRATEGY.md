# SAT MASTER 2.0 — Raqobat strategiyasi va bo'shliqlar tahlili

> Ushbu hujjat "SAT MASTER 2.0 — Unique Value Proposition & Competitive Advantage" topshirig'iga
> javob: avval audit, tashqi integratsiyalar shartlarini tekshirish, so'ng kichik va
> sinovdan o'tadigan bosqichlar. Sana: 2026-11-03.

## 1. Pozitsiya

"SAT'ga tayyorgarlik uchun kerak bo'lgan hamma narsa — bitta aqlli platformada."

SAT MASTER o'zining asosiy qiymatiga egalik qiladi: o'quvchining o'qish tarixi, shaxsiy tavsiya
mexanizmi, original savollar banki, haqiqiy natijalarga bog'langan AI Tutor, o'qituvchi–o'quvchi
hamkorligi va o'lchanadigan natijalar. Tashqi platformalar faqat yordamchi manba. Hech qachon
kafolatlangan ball va'da qilinmaydi; rasmiy hamkorlik (College Board, Khan Academy, Desmos,
Wolfram) mavjud emas va da'vo qilinmaydi.

## 2. Tashqi integratsiyalar: haqiqiy holat (tekshirildi)

| Manba | API | Litsenziya / tijorat shartlari | Qaror |
|---|---|---|---|
| **College Board** | Ommaviy API yo'q | Savollar, testlar, logotiplar mualliflik huquqi bilan himoyalangan. Trademark qoidalari: "SAT® is a trademark registered by the College Board, which is not affiliated with, and does not endorse, this [product/site]" ogohlantirishi SAT so'zi ishlatilgan **har bir sahifada** bo'lishi kerak (faqat Terms sahifasida emas). Logotip bilan havola taqiqlangan, faqat oddiy matnli havola mumkin. College Board materiallarini generativ AI bilan ishlatishga ruxsat yo'q. | Faqat oddiy matnli havolalar + ogohlantirish. Ularning savollari importi taqiqlanadi. Footer ogohlantirishi mavjud — har sahifada chiqishini tekshirish kerak. |
| **Khan Academy** | Ommaviy API o'chirilgan (decommissioned) | Kontent CC BY-NC-SA: tijorat maqsadida (pullik mahsulot ichida) ishlatish **mumkin emas**. Havola berish mumkin. Nom/logotip uchun alohida brend siyosati. | Faqat havola (yangi oynada), "Khan Academy bilan bog'liq emasmiz" yozuvi bilan. Embed yo'q, progress sinxronizatsiyasi yo'q va da'vo qilinmaydi. |
| **Desmos** | API bor, lekin **partner kaliti** talab qilinadi | Tijorat foydalanish uchun Desmos bilan kelishuv kerak. | Kalit yo'q → `NOT_CONFIGURED`. Hozircha desmos.com'ga havola (allaqachon dashboard'da). |
| **Wolfram\|Alpha** | API bor (AppID) | Commercial Terms: har bir natija "Computed by Wolfram\|Alpha" va wolframalpha.com'dagi natijaga havola bilan ko'rsatilishi shart; natijalarni **keshlash taqiqlangan**; narx oylik so'rovlar soniga qarab, ochiq narx ro'yxati yo'q — "contact us". Bepul AppID faqat notijorat. | Tijorat shartnomasi yo'q → `NOT_CONFIGURED`. AI Tutor "tekshirilgan hisob" belgisini faqat haqiqiy integratsiya bo'lganda ko'rsatadi. |
| **LiveKit** (jonli dars) | Bor | Cloud: Build bepul / Ship $50/oy (PHASE 0 tadqiqoti) | PHASE 4 — egasining akkaunt qarori kerak. |
| **tldraw** (doska) | SDK | Ishlab chiqarish uchun litsenziya kerak; sync serverni o'zimiz joylashtiramiz | PHASE 4 — litsenziya qarori kerak. |

Manbalar:
[Wolfram|Alpha API Commercial Terms](https://products.wolframalpha.com/api/commercial-termsofuse),
[Khan Academy: videos, name, materials, links](https://support.khanacademy.org/hc/en-us/articles/202262954-Can-I-use-Khan-Academy-s-videos-name-materials-links-),
[Khan Academy brand policy](https://support.khanacademy.org/hc/en-us/articles/202263034-Trademark-and-Brand-Usage-Policy),
[College Board trademark guidelines](https://privacy.collegeboard.org/copyright-trademark/guidelines).

## 3. Topshiriq ↔ mavjud mahsulot

| Talab | Holat | Izoh |
|---|---|---|
| 1. Diagnostika | ✅ Bor | `features/diagnostic` |
| 2. Darajani baholash | ✅ Bor | Taxminiy ball oralig'i (rasmiy emas) |
| 3. Maqsad ball va imtihon sanasi | ✅ Bor | Onboarding/sozlamalar |
| 4. Shaxsiy reja | ✅ Bor | `features/study-plan` |
| 5. Darslar | ✅ Bor (kontent kerak) | Prod'da hali darslar import qilinmagan |
| 6. Original savollar | ✅ Bor (kontent kerak) | 240 savol import kutilmoqda |
| 7. AI Tutor (uz/en/ru) | ⚠️ Kod bor, kalit yo'q | `NOT_CONFIGURED`; prompt yaxshilash keyingi bosqich |
| 8. Desmos | ⚠️ Havola | Partner kaliti kerak |
| 9. Wolfram tekshiruvi | ❌ | Shartnoma kerak; hozircha qilinmaydi |
| 10. Jonli darslar | ❌ | PHASE 4 (LiveKit + tldraw) |
| 11. Rejani yangilash | ✅ Bor | reconcile.ts |
| 12. To'liq mock imtihon | ✅ Bor | Adaptiv modullar |
| **Learning Intelligence** | ⚠️ Qisman | Eng zaif ko'nikma va mission bor, lekin vaqt, takroriy xato, qiyinlik nomuvofiqligi, haftalik o'zgarish tahlili yo'q → **bu bosqichda** |
| **Sinf ↔ o'qish bog'lanishi** | ⚠️ Qisman | Guruh topshirig'i bor; bitta o'quvchiga zaif joyi bo'yicha shaxsiy topshiriq yo'q, dashboard missiyada ko'rinmaydi → **bu bosqichda** |
| Retention: missiya, streak, mastery, yutuqlar | ✅ Bor | PHASE 1–2 |
| Haftalik maqsad | ✅ Bor | WeekCard |
| Sinf challenge, mock tadbirlar, reyting | ❌ | Keyingi bosqich (reyting faqat progress asosida, rozilik bilan) |
| Resource Hub | ❌ | Keyingi bosqich: har manba uchun manba, ruxsat, atribut maydonlari bilan admin tomonidan tasdiqlangan ro'yxat |
| Biznes model | ⚠️ | Rejalar va limitlar bor; narxlar to'lov provayderi tasdiqlanmaguncha qo'yilmaydi |

## 4. Xavfsizlik bo'yicha topilmalar (bu bosqichga tegishli)

- Shaxsiy topshiriq **boshqa o'quvchiga ko'rinmasligi** kerak: faqat frontend'da yashirish yetarli emas,
  RLS siyosati va barcha service-role yuklagichlar (`loadMyClasses`, `loadMyAssignment`,
  `startAssignment`, `submitText`, xabarnoma) `assignee_id` ni tekshirishi shart.
- O'qituvchi faqat o'zi o'qitadigan guruh o'quvchisiga topshiriq bera oladi (`can()` + `teachableGroupIds`).
- Learning Intelligence tavsiyalari faqat o'quvchining o'z ma'lumotidan (service role, `user_id`
  bo'yicha filtr). Taymerli test davom etayotgan savollar tahlilga kirmaydi (javob kalitini oshkor qilmaslik).
- O'qituvchi o'quvchining shaxsiy (sinfdan tashqari) natijalarini faqat `progress_sharing` roziligi bo'lsa ko'radi — bu qoida "zaif domen bo'yicha topshiriq" tugmasi uchun ham amal qiladi.

## 5. Aniq DB o'zgarishlari — migratsiya 0020

```sql
alter table public.assignments add column assignee_id uuid;
-- Shaxsiy topshiriq faqat shu guruh a'zosiga beriladi (kompozit FK).
alter table public.assignments add constraint assignments_assignee_fk
  foreign key (group_id, assignee_id) references public.group_members (group_id, user_id) on delete cascade;
create index assignments_assignee_idx on public.assignments (assignee_id) where assignee_id is not null;
-- O'quvchi guruh topshirig'ini yoki faqat o'ziga berilganini ko'radi.
alter policy assignments_read on public.assignments using (
  (select public.can_teach_group(group_id))
  or (status <> 'draft' and (assignee_id is null or assignee_id = (select auth.uid()))
      and (select public.is_group_student(group_id))));
```

Learning Intelligence uchun **yangi jadval kerak emas**: hammasi mavjud `attempt_answers`
(`is_correct`, `time_spent_seconds`, `answered_at`), `questions` (`skill_id`, `difficulty`),
`user_daily_activity`, `attempts` (taxminlar) va `flashcard_reviews` dan hisoblanadi.
Tavsiyalar saqlanmaydi — har safar haqiqiy yozuvlardan qayta hisoblanadi (soxta statistikaga yo'l yo'q).

## 6. Bosqichlar

1. **Bu bosqich (2.0-A):**
   - Learning Intelligence v1 (sof qoidalar dvigateli + dashboard kartasi, uz/en/ru, har tavsiyada dalil raqamlari).
   - Shaxsiy topshiriq (0020), o'qituvchi o'quvchi sahifasidan "zaif domen bo'yicha mashq berish".
   - Kutilayotgan sinf topshiriqlari dashboard missiyasida.
2. **2.0-B (bajarildi):** AI Tutor: noto'g'ri variantlar tahlili, muqobil usul, tushunmovchilik, o'quvchi darajasiga moslash; hisob-kitoblarni SAT MASTER'ning o'z kalkulyatori tekshiradi; "tekshirilgan / AI yozgan" yorlig'i.
3. **2.0-C (yozildi, 0021):** Resource Hub — `learning_resources` (manba, foydalanish shartlari, atribut, havola tekshiruvi); faqat havola, nusxa yoki embed yo'q.
4. **PHASE 4:** jonli dars (LiveKit + tldraw) — egasi qarori bilan.
5. **PHASE 5:** o'qituvchi obunasi va to'lovlar — provayder tasdig'i bilan.
