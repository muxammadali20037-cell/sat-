# SAT MASTER — Build status and phase report

_Last updated: 2 November 2026_

The codebase covers phases 1–8 of [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md). Phase 9 (deployment) is partly done: a Supabase project exists, and the steps that need the owner's accounts or credentials are listed under "Launch checklist" below.

Size: 63 pages, 45 API route handlers, 12 SQL migrations, about 50k lines of TypeScript.

## What was verified, and how

Everything below was run, not assumed.

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | 0 errors |
| Lint | `npm run lint` | 0 problems |
| Unit tests | `npm test` | 435 passed (29 files): scoring, rich text, entitlements, practice selection, diagnostic composition, exam state machine and routing, planner, AI output post-processing and leak checks, Click/Payme/Stripe signature and protocol handling, import validation, schemas |
| Database tests | `npm run test:db` | 55 passed against PostgreSQL 16 with all migrations applied: RLS (28), billing functions (11), practice/answer-key security (7), exam RLS (9) |
| Seed integrity | `scripts/db/check-seed.sql` | Passed (64 questions, 16 lessons, 4 practice sets, adaptive demo exam) |
| Production build | `npm run build` | Succeeded |
| End-to-end | Playwright against `next dev` + a local Supabase-compatible stack (GoTrue v2.180.0, PostgREST v12.2.3, Postgres 16) | See below |

### End-to-end flows exercised in a real browser

The flows ran as a real user against real auth, PostgREST and RLS. AI used the labelled development mock, and payments used the signed test provider.

- **Student journey:** sign in → 7-step onboarding → new-student dashboard → diagnostic (16 questions, finish, per-domain results).
- **Practice:** a practice set with server-scored answers, explanations and the calculator panel.
- **Courses:** course list → subject → text lesson.
- **AI tutor:** question → structured step-by-step answer.
- **Billing and planning:** subscription page → test checkout → signed webhook → Pro plan active → study plan generated.
- **Mock exam:** full adaptive exam, with all four modules, the break, routing to the easier or harder module 2, the results page and the estimate.
- **Admin:** all 27 admin pages load for a SUPER_ADMIN at 1280 px and 390 px with no errors.
- **Layout:** public pages at 390/768/1280 px and student pages at 390 px show no horizontal overflow and no console errors.

### Bugs found and fixed during integration

- **Security:** a function privilege leak. PostgreSQL's global EXECUTE-to-PUBLIC default let any student call internal functions. It is now revoked globally, with a regression test.
- **Integrity:** questions in a timed test the student has in progress are now locked everywhere else (practice, bookmarks, AI tutor, reviews).
- **Integrity:** mock-exam payloads no longer carry difficulty or skill, which could reveal the adaptive module.
- **Responsive layout:** horizontal overflow on phones from:
  - grid tracks sizing to their content (112 grids now use an explicit single-column base);
  - visually hidden table text escaping scroll areas;
  - long unbroken page titles.
- **CSP:** it hard-coded `https://` for the Supabase origin, which broke any `http` Supabase URL, such as a local stack.
- **`.gitignore`:** it excluded `.env.example`.
- **Localization:** the question card, answer options, navigator, upgrade notice and pagination were English-only for Uzbek users.
- **Display:** practice titles repeated the difficulty ("Algebra · Mixed · Mixed"), and AI-tutor history showed raw LaTeX.

## Not verified (needs real accounts or credentials)

| Area | Status | What closes it |
|---|---|---|
| Click, Payme, Stripe | Protocol, signatures and idempotency are unit- and DB-tested; no live sandbox run | Merchant credentials, then the sandbox steps in [PAYMENTS.md](PAYMENTS.md) |
| Anthropic AI | Code path typed and tested with the mock; no real API call made | `ANTHROPIC_API_KEY` |
| Bunny Stream signing | Implemented to Bunny's current HS256 token docs; not checked against a real pull zone | One real video in a Bunny library |
| Supabase Storage uploads | Signed-upload flow written; the local stack had no Storage API | Test on the hosted project |
| Auth emails, Google sign-in | The local stack auto-confirmed emails | Configure per [AUTH_SETUP.md](AUTH_SETUP.md) |
| Desmos calculator | Fallback (link-out) verified; real embed needs a key | `NEXT_PUBLIC_DESMOS_API_KEY` |

## Known limitations (honest list)

- **Payme fiscal receipts:** `detail` is not yet sent in `CheckPerformTransaction`. It is needed if the cashbox has fiscalization enabled.
- **Stripe refunds:** only one refund per payment is recorded.
- **Admin aggregation in the app:** analytics and AI-usage pages aggregate in the app with visible 50k-row caps; SQL summary functions are in the backlog.
- **Non-atomic multi-step writes:** creating a practice session, a mock exam (admin) or a lesson (admin) takes two steps with compensating cleanup, not a single SQL transaction.
- **AI quota race:** two simultaneous AI requests can both pass the daily-limit check.
- **Free-chat loophole:** the free chat cannot stop a student from pasting the text of a running test's question; the tutor has no answer key for it.
- **English-only database text:** the "Payment received" notification written by the billing SQL function is English only, and plan descriptions edited in admin show in English.
- **Legal pages:** Terms and Privacy are drafted in English and Uzbek and need legal review, especially for Uzbekistan's personal-data localization law.
- **Sample content only:** the 64 questions and 16 lessons in `supabase/seed` are original samples for development. Real content comes from the content team through the admin editor or CSV/JSON import.

## Launch checklist (owner actions)

1. **Supabase:** apply all migrations in `supabase/migrations` to the production project (the project `sat-master` exists in eu-central-1). Then:
   - set the Auth URLs and email templates ([AUTH_SETUP.md](AUTH_SETUP.md));
   - raise the Storage upload limit to 500 MB if MP4 lessons will be uploaded.
2. **First admin:** sign up in the app, then run `supabase/seed/make_admin.sql` with your email.
3. **Vercel:** import the GitHub repository, set every variable from `.env.example` (Production), and set `CRON_SECRET`. Leave `PAYMENTS_TEST_MODE` unset.
4. **Payments:** sign merchant agreements with Click and Payme, enter the keys, and set the callback URLs from [PAYMENTS.md](PAYMENTS.md). Stripe needs an eligible (non-Uzbek) legal entity.
5. **API keys:** Anthropic key; optional Desmos and Bunny keys.
6. **Content team:** add questions and lessons, review, and publish. Only published, reviewed questions reach students.
7. **Legal:** lawyer review of Terms, Privacy and the public offer; support email in Admin → Settings.
