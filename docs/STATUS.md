# SAT MASTER — Build status and phase report

_Last updated: 3 November 2026 (SAT MASTER 2.0, PHASE 1: dashboard and limiter)_

The codebase covers phases 1–8 of [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md). Phase 9 (deployment) is partly done: a Supabase project exists, and the steps that need the owner's accounts or credentials are listed under "Launch checklist" below.

Size: 71 pages, 51 API route handlers, 17 SQL migrations, about 55k lines of TypeScript, a Telegram Mini App, 40 Uzbek study guides (30 skill guides covering every Digital SAT skill, plus 10 strategy guides), and a starter pack of 240 original practice questions.

## What was verified, and how

Everything below was run, not assumed.

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | 0 errors |
| Lint | `npm run lint` | 0 problems |
| Unit tests | `npm test` | 505 passed (33 files). Covers:<br>• scoring, rich text, entitlements;<br>• practice selection and diagnostic composition;<br>• exam state machine and routing;<br>• study planner;<br>• AI output post-processing and leak checks;<br>• Click/Payme/Stripe signature and protocol handling;<br>• question import validation and schemas;<br>• every study guide file: schema, required sections, KaTeX rendering, and the bundled copy matching the files;<br>• rich-text tables (alignment, pipes inside math, excerpts);<br>• the bundled question pack matching its files;<br>• Telegram launch-data (initData) validation against an independently computed vector;<br>• the SMS hook signature (Standard Webhooks) against an independently computed vector;<br>• phone-number parsing. |
| Database tests | `npm run test:db` | 79 passed against PostgreSQL 16, rebuilt from scratch with all 17 migrations and the seed: RLS (28), billing functions (11), practice/answer-key security (7), exam RLS (9), study-guide RLS (8), atomic quotas (9, including real parallel connections), Telegram accounts and sign-in requests (7) |
| Content checks | `scripts/guides/build.ts --check`, `scripts/question-packs/check.ts core-v1` | 40 guides and 240 pack questions valid (import rules, difficulty mix, KaTeX, duplicates) |
| Continuous integration | `.github/workflows/ci.yml` | Every push: typecheck, lint, unit tests, content checks, a fresh Postgres with all migrations, DB tests, production build |
| Seed integrity | `scripts/db/check-seed.sql` | Passed (64 questions, 16 lessons, 4 practice sets, adaptive demo exam) |
| Production build | `npm run build` | Succeeded. The bundled question pack (it contains answer keys) appears only in server output, never in browser JavaScript (checked by search). |
| End-to-end | Playwright against `next dev` + a local Supabase-compatible stack (GoTrue v2.180.0, PostgREST v12.2.3, Postgres 16) | See below |

### End-to-end flows exercised in a real browser

The flows ran as a real user against real auth, PostgREST and RLS. AI used the labelled development mock, and payments used the signed test provider.

- **Student journey:** sign in → 7-step onboarding → new-student dashboard → diagnostic (16 questions, finish, per-domain results).
- **Practice:** a practice set with server-scored answers, explanations and the calculator panel.
- **Courses:** course list → subject → text lesson.
- **AI tutor:** question → structured step-by-step answer.
- **Billing and planning:** subscription page → test checkout → signed webhook → Pro plan active → study plan generated.
- **Mock exam:** full adaptive exam, with all four modules, the break, routing to the easier or harder module 2, the results page and the estimate.
- **Study guides:** the hub and all 40 guides open at 390 px and 1280 px with every solution expanded. No overflow, no KaTeX errors, no stray formatting characters.
  - Marking a guide as read is saved.
  - Lessons and practice feedback link to the right guide.
  - Admin → Study guides → "Import bundled guides" restored 3 deleted guides as published, with audit entries.
- **Admin:** all 27 admin pages load for a SUPER_ADMIN at 1280 px and 390 px with no errors.
- **Question pack and bulk review (2 Nov):**
  - Import → "Import 240 questions as drafts" created 240 drafts, with audit entries.
  - "Review imported drafts" opens the review queue filtered to the pack.
  - Ticking rows, then "Mark reviewed" and "Publish reviewed", published them; the database still requires reviewed before published.
  - Pressing import again created nothing. After one question was deleted, the importer restored exactly that one.
- **Telegram Mini App (3 Nov):** 29 checks at phone size (390×844), using a recording stand-in for Telegram's script. Details are in [TELEGRAM.md](TELEGRAM.md#verification-3-nov-2026). The checks cover:
  - full screen on iOS but not on desktop;
  - safe areas (header and content 93 px down, tab bar clearing the home indicator);
  - account creation in Uzbek; reopening without duplicates; `start_param` routing;
  - Telegram's back button;
  - connecting an existing account, and refusing a Telegram account already connected elsewhere;
  - forged data rejected;
  - no purchase UI, and checkout returning 403 inside Telegram;
  - the webhook secret.

  Not tested with a real Telegram client: the sandbox cannot reach telegram.org.
- **Sign-in methods (3 Nov):** 29 checks against the local auth server (GoTrue with phone sign-in and the Send SMS hook), with recording stand-ins for the Telegram Bot API and Eskiz.
  - **Telegram on the website:**
    - code shown on the site and repeated by the bot, with the device named;
    - only the user who opened the link can confirm; cancel works;
    - a new account is created; returning users get the same account;
    - the shared phone is saved, but only the user's own;
    - another browser cannot use the request; expired links are explained.
  - **Connect Telegram from Settings** works for an email account.
  - **SMS:**
    - the code arrives through the hook and Eskiz;
    - a wrong code is refused, the right code signs in and creates a phone account;
    - Settings show the number and no password form;
    - the hook refuses unsigned calls.
  - **Email links:** a link opened in another browser gets a clear message; "check your inbox" offers log-in for existing accounts.
  - **Not live-tested:** real Telegram, real Eskiz and real Google. They need the owner's accounts.
- **AI limit under load:** 6 tutor requests fired at the same moment by a Free-plan student (limit 3 per day) gave exactly 3 answers and 3 "limit reached" responses, and no reservation was left behind.
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
- **Production incident (3 Nov, about 15:47–20:00 Tashkent):**
  - **What happened:** a `TELEGRAM_WEBHOOK_SECRET` value that failed validation made every server-side settings read throw. Login, register, the dashboard and the rate limiter all broke.
  - **Code fix:** invalid settings are now ignored, logged by name only (never the value), and listed for admins on the overview and Telegram pages. A regression test covers this.
  - **Setting fix:** the secret was replaced in Vercel with a valid random value, with the owner's approval, and the site was redeployed.
- **Concurrency (fixed 2 Nov):**
  - Simultaneous AI requests could all pass the daily-limit check.
  - Two different mock exams started at the same moment could both pass the monthly limit.
  - Both checks now run inside SQL functions under a per-student lock (migration 0015). Parallel-connection tests fail without the lock and pass with it.
- **Admin lists:** question excerpts showed raw LaTeX (`\dfrac{…}`) and escaped prices as `\12`. They now use the same plain-text rendering as student pages.
- **Pack import (caught before release):** the first version recognised already-imported questions by stem alone. Many Reading and Writing questions share a stem, so a retry after a partial import could have skipped real questions. It now matches passage and stem.

### SAT MASTER 2.0, PHASE 1 (3 Nov)

The audit and plan are in [CURRENT_PROJECT_AUDIT.md](CURRENT_PROJECT_AUDIT.md) and [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).

- **Student dashboard 2.0.** Every new section is built from the student's own records:
  - **Today's mission:** today's study-plan tasks, or rules: diagnostic, mistakes to retry, 10 questions in the weakest skill, the lesson in progress, and the daily-minutes goal. Each item ticks off from real activity. Items without real input are left out.
  - **This week:** streak, minutes per day (or questions when no minutes were logged), and a weekly goal from the daily goal in Settings.
  - **Skill mastery:** all eight Digital SAT domains with level bands. A level appears only after 5 answers in a domain.
  - **Recent mistakes:** the latest wrong answer per question, never from a running timed test, with a link to the explanation.
  - **Header tools:** the Desmos calculator in a dialog (full screen on phones; the honest fallback without a key), the AI tutor and the guides.
- **Rate limiter:** when the shared Postgres limiter fails, the same rules now apply through a per-instance in-memory counter instead of failing open.
- **Marketing copy:** "Video lessons" became "Lessons (text and video)", so the site no longer promises only video.
- **Verified:**
  - 524 unit tests, including 13 new ones for the mission, mastery, week, mistakes and fallback limiter;
  - 79 DB tests;
  - lint, typecheck and production build;
  - 37 Playwright checks: an active and a new student, Uzbek and English, at 1280 and 390 px. All sections render, there is no overflow and no console errors, and the calculator dialog opens.

### Starter question pack (added 2 Nov)

There are 240 original questions, 8 for each of the 30 skills (3 easy, 3 medium, 2 hard). Every question has English and Uzbek explanations, and Math includes student-produced responses. Data questions use real tables, which the renderer now supports.

- **Answer keys:** every Math key was recomputed in Python by its writer.
- **Blind check:** all 240 questions were exported without keys and solved by four separate solvers who had not seen the keys or the generator scripts. **All 240 answers matched the keys**, and the solvers reported no ambiguous items.
- **Review still required:** the questions import as drafts and go through normal review before students see them. The writers' notes for reviewers, such as which real-world facts to confirm, are in [QUESTION_PACKS.md](QUESTION_PACKS.md).

### Uzbek study guides (added 2 Nov, at the owner's request)

Every Digital SAT skill (30), plus test strategy and platform use (10), is explained in Uzbek. Each skill guide covers:
- what the question tests and how to recognise it;
- a step-by-step method;
- 2–3 original worked examples (problem in English, solution in Uzbek, folded so students try first);
- what to watch out for and common traps;
- pacing tips;
- an English→Uzbek term list and a checklist.

The guides are free on every plan. They are linked from lessons, practice feedback, results and the new-student dashboard, and recommended by weakest skill. Format facts were verified against College Board pages by the writers, and every answer key was recomputed.

**Getting them into an environment:**
- `supabase db push`, through the generated migration 0014; or
- Admin → Study guides → "Import bundled guides", one click, no SQL.

Authoring and editing workflow: [GUIDES.md](GUIDES.md).

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

- **Auth emails:**
  - Confirmation and reset emails come from Supabase's built-in sender, which is rate limited, until custom SMTP is configured.
  - The Supabase **Site URL** must be the real site. While it was `localhost`, the first two sign-ups' confirmation links pointed there.
  - See [AUTH_SETUP.md](AUTH_SETUP.md) §2–4.
- **Payme fiscal receipts:** `detail` is not yet sent in `CheckPerformTransaction`. It is needed if the cashbox has fiscalization enabled.
- **Stripe refunds:** only one refund per payment is recorded.
- **Admin aggregation in the app:** analytics and AI-usage pages aggregate in the app with visible 50k-row caps; SQL summary functions are in the backlog.
- **Non-atomic multi-step writes:** creating a practice session, a mock exam (admin) or a lesson (admin) takes two steps with compensating cleanup, not a single SQL transaction.
- **Free-chat loophole:** the free chat cannot stop a student from pasting the text of a running test's question; the tutor has no answer key for it.
- **English-only database text:** the "Payment received" notification written by the billing SQL function is English only, and plan descriptions edited in admin show in English.
- **Legal pages:** Terms and Privacy are drafted in English and Uzbek and need legal review, especially for Uzbekistan's personal-data localization law.
- **Content volume:** the starter pack (240 questions) is enough to try every feature, not to prepare a student fully. The 64 questions and 16 lessons in `supabase/seed` are development samples only. Video lessons and more questions come from the content team through the admin editor or CSV/JSON import.
- **Concurrency:** the per-exam unique index plus migration 0015 cover the plan limits. The daily practice-question limit is still checked per answer and could be exceeded by one or two answers when several are submitted at the same instant. This is low impact and tracked in the backlog.

## Hosted Supabase project `sat-master` (eu-central-1)

State on 2 Nov 2026, applied through the Supabase connector with the owner's confirmation:

| Migration | Status |
|---|---|
| 0001–0011 (schema, RLS, functions, reference data, storage buckets) | Applied |
| 0012 search indexes | **Declined by the owner** at the confirmation prompt. Optional (admin search speed only). Apply later from the SQL editor if wanted. |
| 0013 study-guide tables | Applied |
| 0014 study-guide content (~480 KB) | Not applied. Use Admin → Study guides → "Import bundled guides" after the first deploy, or `supabase db push`. |
| 0017 website Telegram sign-in (1 table, 2 columns; no DELETE or DROP) | Applied on 3 Nov with the owner's approval. Checked afterwards: no `anon` or `authenticated` privileges on `telegram_login_requests`. |
| 0016 Telegram accounts (1 table) | Applied on 3 Nov with the owner's approval. Checked afterwards: `anon` has no privileges; `authenticated` has SELECT only, limited to the student's own row by RLS. |
| 0015 atomic quotas (1 table, 2 functions; no existing data touched) | Applied on 3 Nov with the owner's approval. Checked afterwards: RLS on; `anon` and `authenticated` have no privileges on the table or the functions; `service_role` can execute. The fallback path is no longer used. |

Verified on the hosted database: 47 tables, all with RLS; the same 14 client-callable functions as locally, each with internal role checks; 3 private storage buckets; 30 skills and 4 plans.

The security advisor reports two kinds of finding, both expected by design:
- **WARN, role-helper functions callable by `anon`/`authenticated`:** the RLS policies need them, and they only describe the caller's own role.
- **INFO, `rate_limits` has no policies:** this is intentional; only the server touches it.

**Migration history note.** The connector recorded these migrations under its own timestamps (for example `20261102071356_foundation`), not the repository's file versions. Before using the Supabase CLI against this project, mark the repository versions as applied, then push the rest:

```bash
supabase link --project-ref ncqqnjnozrymrmblixra
supabase migration repair --status applied 20261102000100 20261102000200 20261102000300 20261102000400 \
  20261102000500 20261102000600 20261102000700 20261102000800 20261102000900 20261102001000 20261102001100 20261102001300 \
  20261102001500 20261102001600 20261102001700
supabase db push   # applies 0012 (if still wanted) and 0014
```

## Launch checklist (owner actions)

1. **Supabase:** the schema is applied (see the section above). Load the guide content with "Import bundled guides" after deploying. Then:
   - set the Auth URLs and email templates ([AUTH_SETUP.md](AUTH_SETUP.md));
   - raise the Storage upload limit to 500 MB if MP4 lessons will be uploaded.
2. **First admin:** done on 3 Nov (the owner's account is SUPER_ADMIN). Further roles are managed in Admin → Students.
3. **Vercel:** import the GitHub repository, set every variable from `.env.example` (Production), and set `CRON_SECRET`. Leave `PAYMENTS_TEST_MODE` unset.
4. **Payments:** sign merchant agreements with Click and Payme, enter the keys, and set the callback URLs from [PAYMENTS.md](PAYMENTS.md). Stripe needs an eligible (non-Uzbek) legal entity.
5. **API keys:** Anthropic key; optional Desmos and Bunny keys.
5b. **Telegram Mini App (optional):** create the bot, set the two `TELEGRAM_*` variables, apply 0016, enable the Mini App in BotFather, then Admin → Telegram → "Configure bot" ([TELEGRAM.md](TELEGRAM.md)).
6. **Content team:**
   - Admin → Question bank → Import → "Import 240 questions as drafts".
   - Review them in the review queue, using the bulk "Mark reviewed" and "Publish reviewed" buttons.
   - Then add lessons and more questions.

   Only reviewed, published questions reach students.
7. **Legal:** lawyer review of Terms, Privacy and the public offer; support email in Admin → Settings.
