# SAT MASTER — System Architecture

Status: v1 · Last updated: 2026-11-02. This document is the implementation contract. If code and this document disagree, fix one of them in the same change.

## 1. Stack and key decisions

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.4 (App Router)**, React 19.3, TypeScript strict | Turbopack. `proxy.ts` (renamed from middleware in v16). All request APIs (`cookies()`, `params`, `searchParams`) are async. |
| Caching model | **Cache Components disabled** (`cacheComponents: false`) | Nearly every route is per-student; a static shell buys little and the "session reads only behind Suspense" rule adds risk. Public marketing pages are still statically rendered. Revisit when the marketing site grows. |
| Styling | Tailwind CSS v4 with design tokens in `globals.css` (`@theme`) | shadcn/ui-style components written into `src/components/ui` on Radix primitives (`radix-ui`), `class-variance-authority`, `tailwind-merge`. |
| Forms | React Hook Form + Zod 4 (`@hookform/resolvers`) | Same Zod schema validates on client and server. |
| Data | **Supabase** Postgres 15+, Auth, Storage, RLS | Typed client from generated `src/types/database.ts`. |
| AI | Anthropic Claude via `@anthropic-ai/sdk` | Structured outputs (`output_config.format` JSON schema) + Zod re-validation. Provider interface allows others. |
| Payments | Provider abstraction: Click, Payme, Stripe, Test | Verified webhooks, idempotent processing in a single SQL transaction. |
| Video | Provider abstraction: Bunny Stream (token-signed HLS), Supabase Storage (signed URL, dev) | `hls.js` player; no video bytes in the database. |
| Math | KaTeX (`trust: false`) inside a safe rich-text renderer | No user HTML is ever injected. |
| Tests | Vitest (unit + DB integration against a real Postgres with a Supabase auth shim) | `tests/` |
| Hosting | Vercel (Node runtime) + Supabase | See DEVELOPMENT_ROADMAP Phase 9 / README. |

## 2. Repository layout

```
src/
  app/
    (public)/            landing, about, features, pricing, faq, contact, terms, privacy
    (auth)/              login, register, forgot-password, reset-password, verify-email
    auth/                callback + confirm route handlers (OAuth code exchange, email OTP)
    dashboard/           student app (layout enforces auth + onboarding)
    admin/               admin app (layout enforces staff role)
    api/                 route handlers (JSON APIs, webhooks)
  components/
    ui/                  design-system primitives (Button, Card, Dialog, DataTable, …)
    layout/              PublicHeader, Footer, AppSidebar, MobileNav, PageHeader
    learning/            RichText, QuestionCard, AnswerOption, VideoPlayer, LessonNavigation
    dashboard/ practice/ exams/ ai/ admin/   feature components
  features/<feature>/    domain logic per feature: schemas.ts (Zod), queries.ts (reads),
                         service.ts (business rules), actions.ts (server actions)
  lib/
    supabase/            server.ts (user-scoped, RLS), admin.ts (service role, server-only),
                         client.ts (browser), proxy.ts (session refresh)
    auth/                session.ts — the Data Access Layer (getCurrentUser, requireRole…)
    api/                 route.ts — route-handler wrapper (auth, Zod, rate limit, errors)
    security/            rate-limit.ts, sanitize.ts
    i18n/                locales, dictionaries, getDict/useDict
    payments/ ai/ video/ scoring/ audit.ts env.ts utils.ts
  config/                site.ts, navigation.ts, plans.ts (feature keys)
  types/                 database.ts (generated), domain types
  proxy.ts               session refresh + coarse route gating
supabase/
  migrations/            ordered SQL migrations (schema, RLS, functions, reference data)
  seed/dev_seed.sql      DEVELOPMENT-ONLY sample content
tests/ unit/ integration/
scripts/                 gen-types, local DB harness
docs/                    this folder
```

`services/` from the original brief is folded into `features/*/service.ts` so each feature's rules live next to its schemas and queries.

## 3. Request flow and trust boundaries

```
Browser ──► proxy.ts ──► Server Component / Route Handler / Server Action ──► Supabase
             │ refresh session cookie           │ requireUser()/requireRole()       │ RLS (user client)
             │ redirect anonymous from           │ Zod validation                    │ or service role
             │ /dashboard, /admin                │ rate limit, entitlements          │ (after checks)
```

- **proxy.ts is not a security boundary.** It refreshes Supabase cookies and redirects obviously-anonymous requests. Every page, action and handler re-verifies via the DAL.
- **Two database clients.**
  - `createServerSupabase()` — anon key + the user's JWT. Default for reads; RLS enforces ownership. Use it for anything a user may legitimately read.
  - `createAdminSupabase()` — service role, `import 'server-only'`. Only after an explicit authorization check, for: answer keys, scoring writes, attempt creation, payments, cross-user admin queries that RLS would otherwise also allow (prefer the user client there).
- **Never** import `lib/supabase/admin.ts` from a client component. `SUPABASE_SERVICE_ROLE_KEY` has no `NEXT_PUBLIC_` prefix; `lib/env.ts` throws if it is read in the browser.

## 4. Authentication & authorization (DAL)

`src/lib/auth/session.ts` (all functions are `React.cache`d per request):

| Function | Behaviour |
|---|---|
| `getCurrentUser()` | Verified Supabase user (`auth.getUser()`), or `null`. |
| `getCurrentProfile()` | `{ id, email, fullName, role, locale, onboardingCompleted, isSuspended, … }` or `null`. |
| `requireUser({ next })` | Redirects to `/login?next=…` when anonymous, `/suspended` when suspended. |
| `requireStudentReady()` | `requireUser` + redirects to `/dashboard/onboarding` if onboarding is incomplete. |
| `requireRole(roles)` | `requireUser` + `notFound()` when the role is not allowed (does not reveal admin routes). |
| `getApiContext()` | For route handlers: returns `{ user, profile }` or throws `ApiError(401)`. |

Roles: `SUPER_ADMIN`, `ADMIN`, `CONTENT_EDITOR`, `TEACHER`, `STUDENT` (`roles` table, `profiles.role`). Helpers in `src/config/roles.ts`: `STAFF_ROLES`, `CONTENT_ROLES`, `ADMIN_ROLES`, `canAssignRole(actor, target)`. The same sets exist in SQL (`public.is_staff()`, `public.is_content_manager()`, `public.is_admin()`), so RLS and app checks agree.

Students can update only whitelisted profile columns (column-level `GRANT UPDATE`); `role`, `is_suspended` and `email` are not updatable by the user. Role changes go through `admin_set_user_role()` which enforces the hierarchy and writes an audit row.

Auth flows: email/password sign-up with confirmation (`/auth/confirm?token_hash&type` → `verifyOtp`), login, password reset (`resetPasswordForEmail` → `/reset-password`), logout (server action, `signOut({ scope: 'local' })`), optional Google OAuth (`NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true`, `/auth/callback` exchanges the code). Redirect targets are validated to be same-origin relative paths.

## 5. API conventions

Route handlers use `route()` from `src/lib/api/route.ts`:

```ts
export const POST = route({
  auth: 'user',                       // 'public' | 'user' | Role[]
  body: StartPracticeSchema,          // Zod; 400 with field errors on failure
  rateLimit: { bucket: 'practice-start', limit: 30, windowSec: 60 },
  handler: async ({ user, profile, body, params, db, admin }) => {
    return { attemptId }              // → 200 { data: { attemptId } }
  },
})
```

- Success: `{ "data": … }`. Error: `{ "error": { "code": "PLAN_LIMIT_REACHED", "message": "…", "details"?: … } }`.
- Throw `new ApiError(status, code, message, details?)`; unknown errors become `500 INTERNAL_ERROR` with no internals leaked and are logged server-side with a request id.
- Error codes: `UNAUTHENTICATED 401`, `FORBIDDEN 403`, `NOT_FOUND 404`, `VALIDATION_FAILED 400`, `RATE_LIMITED 429`, `PLAN_REQUIRED 402`, `PLAN_LIMIT_REACHED 402`, `CONFLICT 409`, `TIME_EXPIRED 409`, `AI_NOT_CONFIGURED 503`, `PROVIDER_NOT_CONFIGURED 503`, `INTERNAL_ERROR 500`.
- Server actions return `ActionResult<T> = { ok: true; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }` and always call the DAL first.
- Webhooks bypass `route()` (raw body needed for signatures) but share the logging and error helpers.

### Endpoint map

| Method & path | Purpose |
|---|---|
| `GET/PATCH /api/student/profile` | Read/update own profile (whitelisted fields) |
| `GET /api/courses` | Published courses with lesson counts and own progress |
| `GET /api/lessons/[id]` | Lesson + signed playback source (entitlement-checked) |
| `POST /api/lessons/[id]/progress` | Heartbeat `{ positionSeconds, event }` → `{ watchedSeconds, completed }` |
| `POST /api/practice/start` | `{ mode: custom\|set\|retry\|bookmarks, … }` → `{ attemptId }` |
| `GET /api/practice/[attemptId]` | Safe session payload (answer keys only for already-answered questions) |
| `POST /api/practice/answer` | Scores one answer → `{ isCorrect, correctOptionId \| acceptedAnswers, explanation }` |
| `POST /api/practice/finish` | Closes attempt → summary |
| `POST /api/diagnostic/start` · `/answer` · `/finish` | Timed diagnostic; feedback only after finish |
| `POST /api/exams/start` | Start or resume a mock exam attempt |
| `GET /api/exams/[attemptId]/state` | Current module, safe questions, saved answers, `serverNow`, `deadlineAt` |
| `POST /api/exams/begin-module` | Starts the timer of the next ready module |
| `POST /api/exams/answer` | Save answer / mark for review (rejected after deadline + 5 s grace) |
| `POST /api/exams/submit` | Submit current module → next module (adaptive) or final results |
| `POST /api/ai/chat` · `/explain` · `/hint` · `/generate-practice` · `/generate-practice/answer` · `/study-plan` | AI tutor (metered, limited) |
| `GET /api/subscription` | Effective plan, status, entitlements, today's usage |
| `POST /api/subscription/cancel` · `/resume` · `/schedule-downgrade` | Lifecycle changes by the student |
| `POST /api/payments/checkout` | `{ planCode, provider, idempotencyKey }` → `{ paymentId, redirectUrl }` |
| `POST /api/webhooks/[provider]` | `click`, `payme`, `stripe`, `test` |
| `GET /api/admin/analytics` · `GET /api/admin/students` · `POST/PATCH /api/admin/questions[/id]` · `POST /api/admin/lessons` | Admin JSON APIs (UI uses server actions backed by the same services) |
| `POST /api/contact` | Public contact form (rate limited) |

## 6. Internationalization

- Locales: `en` (default), `uz` (Latin). `ru` is accepted by the DB and the types but has no dictionary yet.
- Locale resolution: `profiles.locale` for signed-in users → `sm_locale` cookie → `Accept-Language` → `en`.
- Dictionaries are per feature namespace: `src/lib/i18n/dictionaries/<namespace>.ts` exporting `defineDict({ en: {...}, uz: {...} })`. The type forces `uz` to have every `en` key. Server: `const t = await getDict(dashboardDict)`. Client: `const t = useDict(dashboardDict)` (locale from `LocaleProvider`). Interpolation: `format(t.welcome, { name })`.
- Learning content (stems, passages, options) is English. Explanations are stored per locale in `question_explanations`; the UI falls back to English when the student's locale is missing.

## 7. Lessons and video

- `lessons.video_provider` ∈ `bunny | supabase | none`, `video_asset_id` is never exposed to clients (column privilege revoked).
- `GET /api/lessons/[id]` checks the `video_lessons` entitlement (or `is_free_preview`) and returns a playback URL valid for 2 hours:
  - **Bunny Stream:** `https://{BUNNY_STREAM_CDN_HOST}/{videoId}/playlist.m3u8?token=…&expires=…` with token = `SHA256(BUNNY_STREAM_TOKEN_KEY + path + expires)` (token authentication enabled on the pull zone).
  - **Supabase Storage:** `createSignedUrl` on the private `lesson-videos` bucket (development / small files).
- **Completion rule (anti-skip):** the client sends heartbeats every 10 s while playing and on pause/ended. The server credits `min(Δposition, Δwallclock × 1.25 + 2, 30)` seconds only for forward progress, using its own `last_heartbeat_at`. Seeking forward earns nothing. Complete when `watched_seconds ≥ 0.9 × duration_seconds`. Text-only lessons (`video_provider = none`) use the same mechanism against an estimated reading time (`duration_seconds`), followed by an explicit "Mark complete" which the server accepts only once the threshold is met.
- Activity (study seconds, lessons completed) is accumulated in `user_daily_activity` for streaks and dashboards.

## 8. Question delivery, practice and diagnostic

- Students have **no** table privileges on `questions`, `answer_options`, `question_spr_answers`, `question_explanations`. The server reads them with the service role and serializes a `SafeQuestion` (`id, subject, domain, skill, difficulty, type, stimulus, stem, passage, imageUrl, imageAlt, options: {id,label,content}[]`). Answer keys and explanations are added **only** for questions this student has already answered in a context where feedback is allowed.
- Attempt creation fixes the question list server-side in `attempt_questions`; answers are accepted only for assigned questions, once (practice) or until the deadline (diagnostic/exam).
- **Scoring** lives in `src/lib/scoring/` (pure, unit-tested):
  - MC: selected option id equals the correct option id.
  - SPR: normalize (trim, remove spaces, unicode minus → `-`), reject > 5 characters (> 6 with a leading minus), parse integers, decimals and fractions (`3/4`, `-.75`); correct if it equals any accepted answer exactly as text or numerically within 1e-9. Mixed numbers (`1 1/2`) are invalid per Digital SAT rules.
- Practice: immediate feedback, `is_correct` stored at answer time. Diagnostic and exams: `is_correct` stays `NULL` until the module/attempt is finalized, so even the student's own rows reveal nothing mid-test.
- Diagnostic composition: `questions_per_domain` per domain in scope, difficulty spread easy→medium→hard round-robin, random within constraints. Level bands from accuracy: < 40% Foundation, 40–59% Developing, 60–79% Proficient, ≥ 80% Advanced. Weak skills = lowest-accuracy skills with ≥ 1 attempt (ties by domain weight).

## 9. Mock exam engine

State is server-authoritative and fully derivable from rows (`attempts`, `attempt_modules`, `attempt_questions`, `attempt_answers`). Refreshing the browser cannot change a score because scoring reads only persisted answers.

```
start → RW-M1 ready → begin (deadline = now + 32 min) → submit/timeout → score M1
     → route: M1 accuracy ≥ routing_threshold (default 0.60) ? RW-M2 harder : RW-M2 easier
     → RW-M2 begins immediately → submit/timeout → BREAK (optional, 10 min, client-side)
     → Math-M1 ready → begin (35 min) → … → Math-M2 → finalize attempt
```

- Every state read checks deadlines: a module past `deadline_at + 5 s` is auto-submitted on the server (lazy expiry), so closing the tab cannot extend time.
- `GET /state` returns `serverNow` and `deadlineAt`; the client timer is display-only and re-syncs on every response.
- Answers are upserted per `attempt_question_id`; `marked_for_review` is stored server-side.
- Non-adaptive exams use a single `standard` module 2.
- **Unofficial estimate** (shown as a range, labelled "SAT MASTER estimate — not an official College Board score"): per section with module accuracies `a1, a2`:
  - harder route: `200 + 600 × (a1 + a2) / 2`
  - easier route: `200 + 420 × (a1 + a2) / 2` (caps at 620, mirroring that the lower route limits the ceiling)
  - standard (non-adaptive): `200 + 600 × overall accuracy`
  - rounded to 10, range ± 40 per section; total = sum of sections (range ± 80).

## 10. AI tutor

- `src/lib/ai/provider.ts` — `AiProvider.generateStructured({ system, messages, schema, model, maxTokens })` → `{ data, usage, model, latencyMs }`. Implementations: `anthropic` (default; requires `ANTHROPIC_API_KEY`), `mock` (only when `AI_PROVIDER=mock` **and** `NODE_ENV !== 'production'`; responses are labelled "Mock AI (development)").
- Models (env-configurable): `AI_MODEL_TUTOR=claude-sonnet-5-5`, `AI_MODEL_FAST=claude-haiku-5-5`. Token prices per model are configured in `platform_settings.ai_pricing` (USD per million tokens) so cost tracking survives price changes.
- Request pipeline: DAL → Zod → rate limit (10/min/user) → entitlement daily limit (`ai_requests_daily`) → build context **server-side** (question, verified explanation, student's answer) → provider → Zod validation of the structured response → **server-side field stripping** (hint mode removes `final_answer` and `step_by_step_explanation`; explain mode replaces `final_answer` with the verified answer) → persist `ai_messages` + `ai_usage`.
- Gating: questions inside an in-progress diagnostic or mock exam attempt are refused; unanswered practice questions are hint-only.
- Prompt-injection posture: student text is passed only as user content inside delimited blocks; the system prompt instructs the model to treat it as data; outputs are schema-constrained; the model never receives secrets, other students' data, or the system prompt of another feature; errors return a friendly message, never raw provider output.
- Generated practice: model drafts a question (4 options, one correct, explanation) → Zod validation → independent solve by a second call without the answer → accepted only on agreement; stored in `ai_generated_questions` (answer never sent before the student submits); shown as "AI-generated practice — not reviewed by SAT MASTER editors". Editors can promote it into the bank as a draft.

## 11. Study plan

Deterministic planner (`src/features/study-plan/planner.ts`, pure and unit-tested) produces dated tasks from: days to exam (default horizon 8 weeks when unset), daily minutes, subject preference, per-domain accuracy (diagnostic + practice), incomplete lessons per weak skill, and mock exam cadence (one per 2 weeks in the final 6 weeks). Allocation weights domains by `(1 − accuracy) × official domain share`. When AI is configured, the model receives the computed summary and returns `weekly_objectives[]` and `rationale` (validated, length-capped) — it cannot add or remove tasks. Saved in `study_plans` / `study_plan_tasks`; regenerating archives the previous plan.

## 12. Payments & subscriptions

```
student ──POST /api/payments/checkout──► payments(pending) ──► provider.createCheckout() ──► redirect
provider ──webhook──► verify signature/auth ──► insert payment_events (unique provider+event id)
        ──► amount & state checks ──► billing_apply_successful_payment(payment_id)  [one SQL transaction]
                                         ├─ payments → succeeded (idempotent)
                                         └─ subscriptions: create / extend / upgrade with pro-rata credit
```

- `PaymentProvider` interface (`src/lib/payments/types.ts`): `id`, `isConfigured()`, `currencies`, `createCheckout(payment, plan, user, urls)`, `handleWebhook(request)`.
- **Click (Shop API):** Prepare (`action=0`) and Complete (`action=1`) callbacks; `sign_string = md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id [+ merchant_prepare_id] + amount + action + sign_time)`; `merchant_trans_id` = payment number. Checkout URL `https://my.click.uz/services/pay?...`.
- **Payme (Merchant API, JSON-RPC 2.0):** Basic auth `Paycom:{PAYME_KEY}` (test key in test mode); methods `CheckPerformTransaction, CreateTransaction, PerformTransaction, CancelTransaction, CheckTransaction, GetStatement`; amounts in tiyin; 12-hour transaction timeout; states 1/2/−1/−2; account field `order_id` = payment number. Checkout `https://checkout.paycom.uz/{base64(m=…;ac.order_id=…;a=…;c=…)}` (`checkout.test.paycom.uz` in test mode).
- **Stripe:** Checkout Session in `payment` mode for a one-month pass (USD `plan_prices`), webhook verified with `stripe.webhooks.constructEvent`; `checkout.session.completed` / `checkout.session.async_payment_failed` / `charge.refunded`.
- **Test provider:** only when `PAYMENTS_TEST_MODE=true` and not production. Its checkout page posts a server-signed event (HMAC) to the same webhook pipeline. Clearly labelled as a simulation.
- Frontend "success" pages only *display* the payment row's current status; they never change it.
- Recurring charges: none are created automatically. Renewal = a new checkout (reminder notifications before period end).
- Effective status (`public.subscription_effective_status`): `active` (now < period end), `grace` (period end ≤ now < period end + grace days), `expired`, `canceled`. Entitlements come from the active/grace plan, otherwise from the `free` plan (`public.get_entitlements`).
- Financial tables (`payments`, `payment_events`) have delete-blocking triggers; refunds are new state + event, never deletion.

## 13. Security controls

| Control | Implementation |
|---|---|
| RLS | Enabled on every table; deny by default (`REVOKE ALL` from `anon`/`authenticated`, then explicit grants). Policy matrix in DATABASE_SCHEMA.md §4. |
| AuthZ | DAL in every page/action/handler; role sets mirrored in SQL. |
| Validation | Zod on every handler/action input; DB `CHECK`/FK/unique constraints as the last line. |
| Rate limiting | Postgres fixed-window limiter (`public.rate_limit_hit`) — works across serverless instances without extra infra. Applied to auth actions, AI, payments, contact, answer endpoints. |
| Headers | CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'` (next.config `headers()`). |
| Content safety | Rich text rendered by a tokenizer that escapes everything and only emits known nodes; KaTeX with `trust: false`. |
| Secrets | Server-only env; `lib/env.ts` validates at boot; service role imported only from `server-only` modules. |
| Webhooks | Signature/auth verification, amount verification, unique event ids, transactional application. |
| Audit | `audit_logs` (append-only via trigger) for admin mutations, role changes, refunds, payment application. |
| Answer keys | Never sent before submission; `is_correct` withheld during timed tests. |
| IDOR | Every lookup by id is scoped by `user_id = auth.uid()` (RLS) or an explicit owner check on service-role reads. |

## 14. Environment variables

| Variable | Scope | Required | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | public | yes | Absolute URLs (auth redirects, payment return URLs) |
| `NEXT_PUBLIC_SUPABASE_URL` | public | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | yes | Anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | server | yes | Service role (never `NEXT_PUBLIC_`) |
| `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH` | public | no | Show Google sign-in |
| `ANTHROPIC_API_KEY` | server | for AI | Claude API |
| `AI_PROVIDER` | server | no | `anthropic` (default) or `mock` (dev only) |
| `AI_MODEL_TUTOR`, `AI_MODEL_FAST` | server | no | Model ids |
| `BUNNY_STREAM_CDN_HOST`, `BUNNY_STREAM_TOKEN_KEY` | server | for Bunny | Signed HLS playback |
| `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY`, `CLICK_MERCHANT_USER_ID` | server | for Click | Click Shop API |
| `PAYME_MERCHANT_ID`, `PAYME_KEY`, `PAYME_TEST_KEY`, `PAYME_TEST_MODE` | server | for Payme | Payme Merchant API |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | server | for Stripe | International cards |
| `PAYMENTS_TEST_MODE`, `PAYMENTS_TEST_WEBHOOK_SECRET` | server | dev only | Simulated provider |

Missing optional credentials disable the corresponding feature with an honest "not configured" state; they never fall back to fake success.
