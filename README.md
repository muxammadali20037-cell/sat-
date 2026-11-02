# SAT MASTER

**Learn Smarter. Score Higher.** — an AI-powered Digital SAT preparation platform: diagnostic assessment, structured lessons, server-scored practice, adaptive mock exams, an AI tutor, personalized study plans, monthly subscriptions (Click, Payme, Stripe) and a full admin panel.

> SAT® is a trademark registered by the College Board, which is not affiliated with, and does not endorse, SAT MASTER. All practice content is original. Score estimates are SAT MASTER's own and are labelled as unofficial.

| | |
|---|---|
| Product spec | [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) |
| Architecture | [docs/SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md) |
| Database | [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) |
| Design system | [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) |
| Roadmap & decisions | [docs/DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md) |
| Contributing | [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) |
| Auth setup | [docs/AUTH_SETUP.md](docs/AUTH_SETUP.md) |
| Payments setup | [docs/PAYMENTS.md](docs/PAYMENTS.md) |
| Uzbek study guides | [docs/GUIDES.md](docs/GUIDES.md) |
| Question packs (240 original questions) | [docs/QUESTION_PACKS.md](docs/QUESTION_PACKS.md) |
| Telegram Mini App | [docs/TELEGRAM.md](docs/TELEGRAM.md) |

> **Current status, test evidence and launch checklist:** [docs/STATUS.md](docs/STATUS.md)

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Tailwind CSS v4 · Radix primitives (shadcn-style components) · React Hook Form + Zod · Supabase (Postgres, Auth, Storage, RLS) · Anthropic Claude (structured outputs) · Click / Payme / Stripe · KaTeX · hls.js · Vitest.

## 1. Prerequisites

- Node.js ≥ 20.9 (22 LTS recommended) and npm
- A Supabase project (free tier is fine for development)
- Optional for local DB tests: PostgreSQL 15+ server binaries (`initdb`, `pg_ctl`) — no Docker needed
- Optional: Supabase CLI (`npm i -g supabase`) to push migrations

## 2. Install

```bash
npm install
cp .env.example .env.local   # then fill in values (see §4)
```

## 3. Database setup (Supabase)

Migrations live in `supabase/migrations/` and must be applied **in filename order**.

**Option A — Supabase CLI (recommended)**
```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push            # applies every migration in supabase/migrations
```

**Option B — SQL editor:** open each file in `supabase/migrations/` in order and run it.

Then:

1. **Auth URLs** — Supabase → Authentication → URL configuration: Site URL = your `NEXT_PUBLIC_SITE_URL`; add `<site>/auth/confirm` and `<site>/auth/callback` to redirect URLs. Update the email templates as described in [docs/AUTH_SETUP.md](docs/AUTH_SETUP.md).
2. **Development content (dev projects only)** — `psql "$DEV_DATABASE_URL" -f supabase/seed/dev_seed.sql` (or paste it into the SQL editor). It contains original sample questions, text lessons, practice sets and a shortened demo mock exam. **Never load it into production.** See [supabase/seed/README.md](supabase/seed/README.md).
3. **Make yourself an admin** — sign up in the app, then run `supabase/seed/make_admin.sql` in the SQL editor with your email.

Storage buckets (`question-images`, `lesson-resources`, `lesson-videos`) are created privately by migration `…001100_storage.sql`.

## 4. Environment variables

All variables are documented in [.env.example](.env.example) and [docs/SYSTEM_ARCHITECTURE.md §14](docs/SYSTEM_ARCHITECTURE.md). Server-only secrets never use the `NEXT_PUBLIC_` prefix.

| Group | Required to run | What happens if missing |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Public pages render; sign-in shows "not configured" |
| `ANTHROPIC_API_KEY` | For the AI tutor | Tutor shows "not configured"; study plans still generate (rules engine) |
| `NEXT_PUBLIC_DESMOS_API_KEY` | For the built-in graphing calculator | Calculator panel links out to desmos.com instead |
| `BUNNY_STREAM_*` | For Bunny-hosted video | Bunny lessons unavailable; Supabase-hosted and text lessons work |
| `CLICK_*`, `PAYME_*`, `STRIPE_*` | Per payment provider | That provider is hidden at checkout |
| `PAYMENTS_TEST_MODE`, `PAYMENTS_TEST_WEBHOOK_SECRET` | Dev only | Simulated checkout for local testing; refused in production |
| `AI_PROVIDER=mock` | Dev only | Deterministic labelled mock AI; refused in production |
| `CRON_SECRET` | For scheduled jobs | Renewal reminders / expiry job rejects calls |

## 5. Develop

```bash
npm run dev        # http://localhost:3000
```

Useful flows: register → confirm email → onboarding → free diagnostic → dashboard. Visit `/admin` after promoting your account.

## 6. Test

```bash
npm run typecheck
npm run lint
npm test                    # unit tests (scoring, rich text, planner, payments protocols, …)

# Database integration tests: a throwaway local Postgres with a Supabase auth shim
npm run db:start            # initdb + start on 127.0.0.1:54329 (PG_BIN=/path/to/pg/bin if needed)
npm run db:reset            # apply shim + all migrations + dev seed
npm run test:db             # RLS, privileges, content workflow, billing functions
npm run db:types            # regenerate src/types/database.ts after schema changes
```

The integration suite proves the security model directly against the schema: anonymous and student isolation, answer keys unreachable by students, no client writes to attempts/subscriptions/payments, role hierarchy, function privileges, financial delete protection, append-only audit log.

## 7. Deploy (Vercel + Supabase)

1. Create a **production** Supabase project; apply migrations (`supabase db push`). Do **not** load the dev seed.
2. Configure Auth URLs and email templates for the production domain ([docs/AUTH_SETUP.md](docs/AUTH_SETUP.md)); enable Google if used.
3. Import the repository in Vercel (framework preset: Next.js). Set every production env var from `.env.example` (Production scope). Leave `PAYMENTS_TEST_MODE` unset and `AI_PROVIDER=anthropic`.
4. Set `NEXT_PUBLIC_SITE_URL` to the final domain and add the domain in Vercel → Domains.
5. Register provider webhook URLs ([docs/PAYMENTS.md](docs/PAYMENTS.md)): `https://<domain>/api/webhooks/click`, `/api/webhooks/payme`, `/api/webhooks/stripe`.
6. `vercel.json` already schedules `/api/cron/renewal-reminders` daily at 04:00 UTC (09:00 Tashkent) and pins functions to `fra1` (Frankfurt) — create the Supabase project in `eu-central-1` so the app and database sit together. Set `CRON_SECRET`; Vercel sends it as a Bearer token (see [docs/PAYMENTS.md](docs/PAYMENTS.md)).
7. Review `platform_settings` in `/admin/settings` — especially `ai.pricing_usd_per_mtok` (set from current Anthropic pricing) and `contact.support_email`.
8. Monitoring: Vercel logs capture structured server errors (`[api] <ref>` lines); Supabase → Logs for database/auth; payment callbacks are stored in `payment_events`; every admin action is in `/admin/audit-logs`; AI spend in `/admin/ai-usage`.

## 8. Project structure

```
src/app            routes: (public) (auth) dashboard/(app) dashboard/(focus) admin api
src/components     ui/ layout/ learning/ + feature folders
src/features       domain logic per feature (schemas, queries, services, actions)
src/lib            supabase, auth DAL, api wrapper, security, i18n, scoring, payments, ai, video
supabase           migrations/ and seed/
tests              unit/ and integration/
docs               product, architecture, schema, design, roadmap
```

## 9. Security model (summary)

RLS on every table with deny-by-default grants · server-side authorization in every page/action/handler · Zod validation on every input · Postgres-backed rate limits on auth, AI, payments, answers · answer keys only on the server (never in pre-submission payloads) · server-authoritative exam timing · verified, idempotent payment webhooks with transactional application · append-only audit log · financial rows cannot be deleted · CSP and security headers. Details: [docs/SYSTEM_ARCHITECTURE.md §13](docs/SYSTEM_ARCHITECTURE.md).
