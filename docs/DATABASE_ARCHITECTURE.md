# SAT MASTER 2.0: ma'lumotlar bazasi arxitekturasi

_Taklif, 3-noyabr 2026. Hech qanday migratsiya yozilmagan yoki qo'llanmagan._

## 1. Hozirgi holat (o'zgarmaydi)

Mavjud sxema 17 ta migratsiyada (0001–0017). Hosted bazada 49 jadval bor, hammasida RLS yoqilgan. Batafsil: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

| Guruh | Jadvallar |
|---|---|
| Identity | `roles`, `profiles`, `telegram_accounts`, `telegram_login_requests` |
| Katalog | `subjects`, `domains`, `skills`, `courses`, `lessons`, `lesson_contents`, `lesson_resources`, `lesson_progress`, `guides`, `guide_contents`, `guide_reads` |
| Savollar | `questions`, `answer_options`, `question_spr_answers`, `question_explanations`, `practice_sets`, `practice_set_questions` |
| Baholash | `diagnostic_tests`, `mock_exams`, `mock_exam_modules`, `mock_exam_questions`, `attempts`, `attempt_modules`, `attempt_questions`, `attempt_answers`, `diagnostic_results`, `user_daily_activity` |
| Platforma | `platform_settings`, `audit_logs`, `notifications`, `bookmarks`, `rate_limits`, `contact_requests` |
| Billing | `plans`, `plan_prices`, `plan_features`, `subscriptions`, `payments`, `payment_events` |
| AI va reja | `study_plans`, `study_plan_tasks`, `ai_sessions`, `ai_messages`, `ai_usage`, `ai_generated_questions`, `ai_quota_reservations` (0015, hosted'da yo'q) |

**Asosiy qoidalar** (2.0 da ham amal qiladi):
- har bir jadvalda RLS;
- default `EXECUTE` revoke qilingan;
- helper funksiyalar `security definer` + `search_path = ''`;
- moliyaviy yozuvlarni o'chirish taqiqlangan;
- `published` uchun `reviewed` sharti DB darajasida;
- vaqtlar `timestamptz` da.

## 2. Ijara modeli (multi-tenancy)

- **Ijara birligi:** `workspaces`.
- Workspace'ga tegishli **har bir** jadvalda `workspace_id uuid not null` ustuni bo'ladi.
- RLS har doim a'zolik orqali tekshiriladi:

```sql
-- security definer, search_path = ''
create function public.workspace_role(p_workspace uuid) returns text ...
  -- workspace_members dan joriy foydalanuvchining roli (faol, o'chirilmagan a'zolik), aks holda null
create function public.has_workspace_role(p_workspace uuid, variadic p_roles text[]) returns boolean ...
create function public.is_group_member(p_group uuid) returns boolean ...       -- o'quvchi guruhda
create function public.can_teach_group(p_group uuid) returns boolean ...       -- owner/admin yoki guruhga biriktirilgan teacher/assistant
```

- Platforma kontenti (savollar, darslar, imtihonlar) `workspace_id` siz qoladi va hammaga umumiy.
- Ustoz yaratgan kontent har doim `workspace_id` bilan saqlanadi.
- Har bir yangi jadval uchun indeks `(workspace_id, …)` bo'ladi.
- Workspace'lar o'rtasida foreign key bo'yicha "sizib chiqish" bo'lmasligi uchun **kompozit FK** ishlatiladi: masalan `(workspace_id, group_id) → groups(workspace_id, id)`. Shunda bir workspace yozuvi boshqasining guruhiga ulana olmaydi.

## 3. Yangi jadvallar (taklif)

### 3.0 Learning qo'shimchalari: migratsiya 0018 (yozilgan, PHASE 2)

`supabase/migrations/20261103001800_learning_extras.sql`:
- `attempts.practice_mode` ga `mistakes` qo'shildi (xatolar daftaridan mashq);
- `flashcard_reviews` (o'quvchi, `card_key`, ease, interval, reps, lapses, `due_at`): faqat server yozadi, o'quvchi faqat o'zinikini o'qiydi; kartochkalarning o'zi repozitoriyda (`content/flashcards`);
- `profiles.country_code` (o'quvchi faqat o'zinikini o'zgartiradi).

Xatolar daftari va yutuqlar uchun jadval kerak bo'lmadi: ular mavjud javoblardan hisoblanadi.

**PHASE 3 da 3.1, 3.2 (`ws_courses` va `materials` dan tashqari) va 3.5 bitta migratsiyaga birlashtirildi: `20261103001900_classroom.sql` (0019).** 2.0-A da **0020** shaxsiy topshiriq uchun ishlatildi (`assignments.assignee_id`, [COMPETITIVE_STRATEGY.md](COMPETITIVE_STRATEGY.md) 5-bo'lim). **0021** — Resource Hub (`learning_resources`). **0022** — dars jadvali, davomat, sinf materiallari. Keyingilari: jonli video 0023, doska 0024, ustoz billing'i 0025.

0019 ning amaldagi farqlari:
- taklif uchun token-hash o'rniga 8 belgili kod (`code`, faqat xodimlar o'qiydi), havola va QR shu kod bilan;
- `assignments.kind`: `practice`, `mock_exam`, `text`; `attempts.assignment_id` (vazifa mashqi o'quvchi tarifiga hisoblanmaydi);
- barcha yozish server orqali (service role, `can()` tekshiruvidan keyin); mijozlarga faqat a'zolikka qarab SELECT;
- atomik amallar faqat service role chaqiradigan funksiyalarda: `workspace_create` (egasiga 5 tagacha), `workspace_join` (`max_uses` qulf bilan, rolni hech qachon pasaytirmaydi);
- `audit_logs.workspace_id` (`on delete restrict`: tarixi bor workspace o'chirilmaydi, arxivlanadi);
- S1: `telegram_accounts` ni endi faqat egasi va admin o'qiydi.

### 3.1 Workspace va a'zolik: migratsiya 0019

| Jadval | Asosiy ustunlar | Izoh |
|---|---|---|
| `workspaces` | `id`, `slug` unique, `name`, `kind` (`individual`, `center`), `owner_id`, `country_code`, `default_locale`, `timezone`, `logo_path`, `status` (`active`, `suspended`, `archived`), `created_at`, `archived_at` | Ochiq profil maydonlari (marketplace) alohida jadvalda |
| `workspace_members` | `workspace_id`, `user_id`, `role` (`owner`, `admin`, `teacher`, `assistant`, `student`), `status` (`active`, `removed`), `joined_at`, `removed_at`, `invited_by`; unique `(workspace_id, user_id)` | Bitta odam bir workspace'da bitta rolda. Ko'p workspace'da a'zo bo'lishi mumkin |
| `workspace_invitations` | `workspace_id`, `role`, `group_id` null, `token_hash` (SHA-256), `code` (6–8 belgi, ixtiyoriy), `email` null, `max_uses`, `uses`, `expires_at`, `revoked_at`, `created_by` | Havola, QR yoki kod. Faqat hash saqlanadi. Qabul qilish server funksiyasi orqali, atomik |
| `country_configs` | `country_code` PK, `default_locale`, `currency`, `default_timezone`, `payment_providers text[]`, `is_active` | Mamlakat sozlamasi (reference data) |
| `profiles` (+ustun) | `country_code` null | Onboarding'da to'ldiriladi |

### 3.2 Classroom: migratsiya 0020

| Jadval | Asosiy ustunlar |
|---|---|
| `ws_courses` | `workspace_id`, `title`, `subject` (erkin yoki `subjects` ga havola), `description`, `status`, `created_by` |
| `groups` | `workspace_id`, `course_id` null, `name`, `capacity`, `timezone`, `status`, `starts_on`, `ends_on` |
| `group_members` | `workspace_id`, `group_id`, `user_id`, `role` (`student`, `teacher`, `assistant`), `joined_at`, `left_at` |
| `materials` | `workspace_id`, `group_id` null, `course_id` null, `kind` (`pdf`, `slides`, `image`, `link`, `note`), `storage_path`, `title`, `size_bytes`, `mime`, `uploaded_by` |
| `progress_sharing` | `workspace_id`, `student_id`, `scope` (`classroom_only`, `classroom_and_learning`), `granted_at`, `revoked_at` |

`progress_sharing` o'quvchining shaxsiy Learning natijalarini (diagnostika, mashq, imtihon) ustoz ko'rishiga **aniq rozilik** beradi. Rozilik bo'lmasa, ustoz faqat o'z workspace'idagi vazifa natijalarini ko'radi.

### 3.3 Jadval, jonli dars, davomat: migratsiya 0021

| Jadval | Asosiy ustunlar |
|---|---|
| `live_sessions` | `workspace_id`, `group_id`, `title`, `scheduled_start`, `scheduled_end`, `recurrence_id` null, `status` (`scheduled`, `live`, `ended`, `cancelled`), `livekit_room` unique, `started_at`, `ended_at`, `host_id`, `recording_policy` (`off`, `allowed`, `required`), `whiteboard_id` |
| `live_session_recurrences` | `workspace_id`, `group_id`, `rrule`, `timezone`, `starts_on`, `until` |
| `live_session_guests` | `workspace_id`, `session_id`, `user_id` null, `invite_token_hash`, `role` (`co_host`, `moderator`, `observer`), `expires_at` |
| `live_participants` | `workspace_id`, `session_id`, `user_id`, `role`, `joined_at`, `left_at`, `livekit_identity`; har bir kirish uchun alohida qator (qayta ulanishlar) |
| `attendance` | `workspace_id`, `session_id`, `user_id`, `status` (`present`, `late`, `absent`, `excused`), `minutes_present`, `marked_by` (`system`, foydalanuvchi id), unique `(session_id, user_id)` |
| `live_events` | `workspace_id`, `session_id`, `type` (`started`, `ended`, `muted`, `removed`, `recording_started`, …), `actor_id`, `payload jsonb`, `created_at`; append-only |
| `chat_messages` | `workspace_id`, `session_id` yoki `group_id`, `author_id`, `body` (≤ 2000), `created_at`, `deleted_at`, `deleted_by` |
| `polls`, `poll_options`, `poll_votes` | `workspace_id`, `session_id`, savol, variantlar, ovoz; unique `(poll_id, user_id)` |
| `recordings` | `workspace_id`, `session_id`, `egress_id` unique, `status`, `storage_path`, `duration_s`, `size_bytes`, `started_by`, `consent_snapshot jsonb`, `expires_at` |
| `recording_consents` | `workspace_id`, `session_id`, `user_id`, `consented_at`, `withdrawn_at` |
| `webhook_events` | `provider` (`livekit`), `event_id` unique, `received_at`, `payload_hash`; idempotency uchun |
| `usage_counters` | `workspace_id`, `period` (oy), `live_minutes`, `recording_minutes`, `storage_bytes`; webhook'dan yangilanadi |

### 3.4 Doska: migratsiya 0022

| Jadval | Asosiy ustunlar |
|---|---|
| `whiteboards` | `workspace_id`, `session_id` null, `group_id` null, `title`, `sync_room_id` unique, `status` (`active`, `archived`), `created_by` |
| `whiteboard_snapshots` | `workspace_id`, `whiteboard_id`, `version`, `storage_path` (snapshot JSON Storage'da), `created_at`; dars tugaganda va davriy |
| `whiteboard_assets` | `workspace_id`, `whiteboard_id`, `storage_path`, `mime`, `size_bytes`, `uploaded_by` |

Jonli holat sync serverda (SQLite) turadi. Postgres arxiv va ruxsatlar manbai bo'ladi.

### 3.5 Vazifalar: migratsiya 0023

| Jadval | Asosiy ustunlar |
|---|---|
| `assignments` | `workspace_id`, `group_id`, `title`, `instructions`, `kind` (`practice_set`, `mock_exam`, `questions`, `file`, `text`), `ref_id` null, `due_at`, `points`, `status` (`draft`, `published`, `closed`), `created_by` |
| `assignment_questions` | `workspace_id`, `assignment_id`, `question_id` (platforma) yoki `ws_question_id` |
| `ws_questions` | Ustozning o'z savollari (keyinroq): platforma `questions` sxemasining workspace nusxasi |
| `submissions` | `workspace_id`, `assignment_id`, `student_id`, `attempt_id` null, `status` (`assigned`, `submitted`, `graded`, `returned`), `submitted_at`, `score`, `feedback`, `graded_by`, `graded_at`; unique `(assignment_id, student_id)` |
| `submission_files` | `workspace_id`, `submission_id`, `storage_path`, `mime`, `size_bytes` |

Platforma savollari vazifaga berilganda ham javob kaliti qoidasi o'zgarmaydi. Baholash mavjud `attempts` mexanizmi orqali serverda bo'ladi.

### 3.6 Keyingi Learning qo'shimchalari (keyin)

| Jadval | Asosiy ustunlar |
|---|---|
| `flashcard_decks`, `flashcards` | Platforma decklari (`workspace_id` null) yoki workspace decki; karta oldi va orqasi |
| `flashcard_reviews` | `user_id`, `card_id`, `ease`, `interval_days`, `due_at`, `reps`, `lapses`; spaced repetition (SM-2) |
| `mistake_entries` | `user_id`, `question_id`, `first_wrong_at`, `last_wrong_at`, `times_wrong`, `resolved_at`, `note`; `attempt_answers` dan trigger yoki server orqali to'ldiriladi |
| `daily_missions` | `user_id`, `local_date`, `items jsonb`, `completed_at` |
| `weekly_goals` | `user_id`, `week_start`, `target_minutes`, `target_questions`, `achieved_at` |
| `achievements`, `user_achievements` | Yutuq ta'rifi (reference) va qo'lga kiritilgan sana. Faqat real faollikdan beriladi |
| `leaderboard_snapshots` | `scope` (`group`, `workspace`), `period`, `rows jsonb`; faqat guruh ichida, o'sish (progress) bo'yicha |

### 3.7 Billing kengaytmasi: migratsiya 0024

| Jadval yoki o'zgarish | Izoh |
|---|---|
| `workspace_plans`, `workspace_plan_prices` | Ustoz va markaz tariflari: o'quvchi, daqiqa va hajm chegaralari; UZS, USD, EUR |
| `workspace_subscriptions` | `workspace_id`, `plan_id`, `status`, `current_period_end` …; mavjud `subscriptions` bilan bir xil holat mashinasi |
| `payments.purpose` | `workspace_subscription` qiymati qo'shiladi. Webhook va idempotency kodi umumiy |

### 3.8 Marketplace (keyin, migratsiya 0025+)

- `teacher_profiles` (ochiq profil);
- `catalog_listings`;
- `course_purchases`;
- `entitlements` (umumiy kirish huquqi jadvali: kim, nimaga, qachongacha, manba).

Hozir faqat **joy qoldiriladi**: workspace kurslari `ws_courses` da, guruhga qo'shilish esa bitta server funksiyasi orqali bo'ladi. Bu funksiyani keyin sotib olish ham chaqira oladi.

## 4. RLS siyosatlari: shablon

Har bir workspace jadvali uchun to'rtta alohida siyosat yoziladi va har biri alohida testlanadi:

```sql
-- SELECT: a'zo va tegishli rol
create policy x_select on public.x for select to authenticated
  using ((select public.has_workspace_role(workspace_id, 'owner','admin','teacher','assistant'))
         or (/* o'quvchi faqat o'z guruhi yoki o'z yozuvi */));
-- INSERT: with check da workspace_id va rol; o'quvchi faqat o'zi uchun (user_id = auth.uid())
-- UPDATE: using + with check; workspace_id va egasi o'zgartirilmaydi (trigger bilan qotiriladi)
-- DELETE: ko'p jadvallarda yo'q (soft delete) yoki faqat owner/admin
```

- `workspace_id`, `user_id`, `created_by` kabi ustunlar update paytida o'zgarmasligi `before update` trigger bilan qotiriladi.
- Jurnal jadvallari append-only: `live_events`, `webhook_events`, `attendance` tarixi, `payments`.
- Storage'da yangi `workspace-files` private bucket bo'ladi. Yo'l formati `<workspace_id>/<kind>/<uuid>`. Siyosat yo'lning birinchi bo'lagini `has_workspace_role` bilan tekshiradi. Yuklash va ochish signed URL orqali.

## 5. Migratsiya xavfsizligi

- Faqat qo'shimcha (additive) migratsiyalar: yangi jadval, ustun va funksiya. Mavjud jadvallar o'chirilmaydi, mavjud ma'lumot o'zgartirilmaydi.
- Har bir migratsiya avval lokal Postgres'da noldan quriladi va DB testlaridan o'tadi. Keyin CI'dan o'tadi. Shundan keyingina egasi tasdiqlasa, hosted bazaga qo'llanadi.
- Migratsiyalarda `DELETE` va `DROP` so'zlaridan iloji boricha qochiladi: ular Supabase'da "destructive" ogohlantirishini chiqaradi. Kerak bo'lsa, oldindan tushuntiriladi.
- Production ma'lumotiga tegadigan har qanday backfill alohida, tasdiqlangan skript bo'ladi va avval nusxa olinadi.
- Avval qoldirilgan masalalar:
  - **0015** (atomik limitlar): tasdiq so'raladi.
  - **0012** (qidiruv indekslari): ixtiyoriy.
  - **0014** (qo'llanmalar): o'rniga admin tugmasi ishlatiladi.
