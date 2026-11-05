# SAT MASTER — Build status and phase report

_Last updated: 5 November 2026 (SAT MASTER 2.0: teacher workspace plans and limits)_

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

### SAT MASTER PHASE 4-D (5 Nov): guest teachers for one lesson

- **Migration 0027:** `class_session_guest_links` (8-character code, role guest teacher or moderator, 1–20 uses, revoke) and `class_session_guests` (who joined which lesson through which link). Clients can only read: links by the group's staff; guest rows by the group's staff and by the guest themself. All writes go through the server after a permission check.
- **Teacher (lesson page):** create a guest link (role, how many people), copy, revoke; see who joined. Every change is audited.
- **Guest:** opens `/live/guest/CODE` (sign-in required), sees the lesson and what the role allows, joins. The use counter is increased atomically, so a one-person link cannot be used twice. A revoked link shows "not found".
- **What a guest can and cannot do:** in the live room a guest teaches like staff (camera, mic, screen share, board), but is not a room admin and cannot create polls. The guest does **not** join the workspace and cannot open teach pages, group data, students' work or per-student poll answers (the polls API gives guests the student view).
- **Verified:** 1 unit test (guest token rights), 1 DB test (visibility for staff, guest, student, outsider; no client writes; constraints); 744 tests in total; lint, typecheck, build; 17 Playwright checks against the local LiveKit server (`e2e-guests`), live 22/22, polls 14/14, lessons 22/22, classroom 32/32 re-run.

### SAT MASTER 2.0 (5 Nov): teacher workspace plans and limits (billing preparation)

The directive says not to invent prices or switch on payments before the provider, fees and business terms are confirmed. So this step adds **limits without prices**, assigned by an administrator.

- **Migration 0026:**
  - `workspace_plans` (code, name, max students, max active groups, in-app live lessons yes/no, default flag; no price columns);
  - `workspaces.plan_id` and `plan_until`;
  - `workspace_effective_plan()`: the assigned plan while valid, else the default plan, else none;
  - `workspace_join` refuses a new or returning student at the student limit, under a per-workspace lock so simultaneous joins cannot exceed it (otherwise unchanged).
  - **No plan rows are created**, so nothing changes for existing workspaces until an admin defines plans.
- **Enforcement:** joining (database), creating a group (server, active groups only), in-app live lessons (token API 403 + a clear page).
- **Admin → Teacher workspaces** (`/admin/workspaces`, admins only): create/edit plans, one default plan, assign a plan to a workspace with an optional end date and an audit note (e.g. an invoice number). Every change is audited with the acting admin.
- **Teacher → Team page:** current plan, where it comes from, students/groups used of the limit, live lessons included or not, "contact SAT MASTER to change". Clear messages (uz/en/ru) when a limit is hit.
- **Verified:** 3 unit tests, 4 DB tests (no plans = no limits; default vs assigned vs expired; staff not counted; returning students need a place; one default; client privileges); all 742 tests; lint, build, 0 vulnerabilities; 13 Playwright checks (`e2e-plans`); classroom 32/32, live 22/22, challenges 11/11, intelligence 24/24 re-run.
- **Still to decide (owner):** teacher plan prices, which provider takes teacher payments, and whether teacher plans renew automatically. Then checkout can reuse the verified Click/Payme/Stripe pipeline.

### SAT MASTER 2.0 retention (4 Nov): class challenges and an opt-in progress leaderboard

- **Migration 0025:**
  - `workspace_members.leaderboard_opt_in` (default off; only the server changes it, at the student's request, audited);
  - `class_challenges` (goal = correct answers, days studied or study minutes; for each student or the group together; up to 92 days). Clients SELECT only, group-scoped.
- **No meaningless gamification, no score shaming:** weekly points come only from real study activity (1 per correct answer, 10 per day studied, 20 per piece of class work handed in) and the formula is shown. Test scores are never ranked. Zero-point students are left out.
- **Consent:** names and individual progress appear only for students who opted in (teachers additionally see students who share their progress). A group challenge's total counts only opted-in students; a private student still sees their own progress and a note that it is not counted.
- **Teacher (group page):** leaderboard for the week, challenges with progress, "set a challenge", "end now".
- **Student (Classes page):** the opt-in switch, their own week, the leaderboard and challenge progress.
- **Verified:** 6 unit tests, 1 DB test (group-only reads, no client writes including the opt-in column, constraints); all 735 tests; lint and build; 11 Playwright checks (`e2e-challenges`); polls 14/14, lessons 22/22, classroom 32/32 re-run.

### SAT MASTER PHASE 4-C (4 Nov): class polls and quick quizzes

- **Migration 0024:** `class_polls` (poll or quiz, 2–6 options, optional lesson link) and `class_poll_answers` (one answer per student).
  - The **quiz key column is not readable by any browser client** (column-level grant; staff included). The server sends it to students only after the teacher closes the quiz.
  - A student reads only their own answers; the group's staff read all. No client writes. Constraints keep the key in range, polls without a key, answers inside the workspace.
- **Teacher (group page):** ask a poll or quiz, see live counts, "{answered}/{students} answered", % correct, who answered what; close to reveal results.
- **Student (Classes page):** answer (and change the answer) while open; no counts and no key until closed; then results, the correct answer and their own answer.
- **Live room:** a "Questions" panel. The teacher asks during the lesson; students' panels and the teacher's counts update without reloading. The data channel only carries a "fetch again" nudge; results and keys come from the server (`GET /api/polls?sessionId=`, role-shaped).
- **Verified:** 6 unit tests, 4 DB tests (key column denied to clients, own answers only, no client writes, constraints); all 728 tests; lint, build, 0 vulnerabilities; 14 Playwright checks (`e2e-polls`), including the live room against a local LiveKit server; earlier suites re-run (live 22/22, lessons 22/22).

### SAT MASTER PHASE 4-B (4 Nov): in-app live lessons

- **Video, audio and screen sharing via LiveKit** (`livekit-client`, `livekit-server-sdk`, Apache-2.0). Without keys the site shows **NOT_CONFIGURED**: the live page explains it and offers the teacher's own meeting link, and the teacher's lesson form says so.
- **Token API** `POST /api/live/token` (rate-limited):
  - only the group's teachers/assistants (or workspace managers) and its current students; anyone else gets 404;
  - only from 15 minutes before the start to 30 minutes after the end (409 otherwise, also for cancelled lessons);
  - the token is for that lesson's room only, valid 3 hours, with the role signed into its metadata. Students may publish camera and microphone only (no screen sharing, no room admin, cannot change their metadata).
  - The API key and secret never reach the browser.
- **Room page** `/live/[sessionId]` (uz/en/ru):
  - camera tiles with speaking highlight, mic/camera toggles, screen sharing for staff;
  - a shared **whiteboard** (own small canvas component — Excalidraw was rejected because it pulls in dependencies with known high-severity advisories). Pen, line, box, text, 6 colours, undo, clear. Only staff draw: every board message is schema-checked, size-bounded and applied only when the sender's server-signed role is staff. Students who join late get the current board from the teacher;
  - **chat** and **raise hand / lower all hands** over the data channel. Chat is not stored; "Lessons are not recorded";
  - a Desmos link.
- **Migration 0023** (`session_joins`): the server logs who received a token, and when. The attendance page shows "joined online at …". It is a log only; the teacher still marks attendance. A user reads their own rows, the group's staff the lesson's rows, no client writes.
- **Security headers:** camera, microphone and screen capture are allowed only on `/live/*` (everywhere else still `camera=()` etc.); CSP `connect-src` adds the LiveKit host only when `LIVEKIT_URL` is set (read at build time, so **redeploy after adding the keys**).
- **Verified:**
  - 8 unit tests: token grants checked by decoding with `TokenVerifier`, wrong-secret rejection, joining window, board protocol/role rules, oversized and malformed messages;
  - 1 DB test; all 718 tests pass;
  - **22 Playwright checks against a real LiveKit server** (open-source `livekit-server` 1.9.1 in dev mode, fake camera/microphone): two-way video, teacher stroke reaches the student, a student cannot draw, chat, hands, late-join board sync, join log on the attendance page, other-group student gets 404 from the page and the API, too-early (409) and cancelled lessons, 390 px;
  - earlier suites re-run (lessons 22/22, classroom 32/32);
  - lint, build, `npm audit --omit=dev` 0 vulnerabilities.
- **Owner steps to switch it on:**
  1. Create a LiveKit Cloud project (Build plan: $0, no card, 5,000 participant-minutes and 100 concurrent connections a month; Ship from $50/month).
  2. In Vercel add `LIVEKIT_URL` (wss://…livekit.cloud), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
  3. Redeploy.
- **Not built yet:** recordings (need consent flows and storage), polls/quizzes, PDF annotation, guest teachers.

### SAT MASTER PHASE 4-A (4 Nov): lessons, attendance, class materials

The owner chose the parts of the live classroom that need no external service first. Video (LiveKit) and a shared whiteboard come later.

- **Migration 0022:** `class_sessions`, `attendance`, `class_materials` and a private `workspace-files` bucket (PDF/PNG/JPG/WEBP, 20 MB).
  - Composite foreign keys keep every row inside one workspace.
  - Clients may only SELECT: the group's staff and current students; a student reads only their own attendance (and keeps it after leaving the group).
  - No client storage policies at all; files go through server-signed upload/download URLs (10-minute downloads) after membership checks.
  - URL and storage-path checks in the database.
- **Teacher (group page):**
  - "Group at a glance": students, attendance rate (late counts as attended, excused is left out), work submitted vs expected, average grade — each with its basis, "No data yet" instead of zeros.
  - Lessons: schedule (optionally weekly for up to 16 weeks) with room and the teacher's own https meeting link (Zoom/Meet/Telegram; SAT MASTER does not host video yet), "now" from 10 minutes before the start, cancel (kept, not deleted).
  - Attendance page: present / late / absent / excused with notes, "mark everyone present".
  - Materials: upload a file (two-step signed upload, real type and size re-checked on the server, path bound to the workspace and group) or add a link; remove = archive.
  - New permissions `session.manage`, `attendance.mark`, `material.manage` (teachers and assistants of the group; managers).
  - Students of the group get a notification in their own language with the time in the workspace's time zone.
- **Student:** Classes page shows upcoming lessons (live → "Join" button), cancelled ones crossed out, class materials, and their own attendance rate; a lesson later today is the first item of the daily mission.
- **Refactor:** shared classroom action plumbing moved to `features/classroom/action-kit.ts` (no behaviour change).
- **Verified:** 11 unit tests, 5 DB tests (per-role SELECT, own attendance only, anon and client writes denied separately, composite FKs, URL/path/size checks, leaving the group); all 709 tests; lint and build; 22 Playwright checks (`e2e-lessons`) plus earlier suites (classroom 32/32 after fixing a race in the test itself, intelligence 24/24, dashboard 37/37).
- **Not verified locally:** an actual file upload/download, because the local stack has no storage service (the E2E check confirms the failure is reported honestly and nothing is recorded). It uses the same signed-upload mechanism already used for lesson files in production.

### SAT MASTER 2.0-C (4 Nov): Resource Hub

- **Migration 0021** (`learning_resources`): one table with provider, type, language, subject/domain/skill, **usage terms** and **attribution** (both required), link-check result and status. Students (authenticated) read published rows only; anon nothing; no client writes at all, even for staff; a row can only be `published` with a passing link check (2xx/3xx) recorded; only `https://` URLs are stored.
- **Admin → Resource Hub** (`/admin/resources`, content managers): add/edit, publish, unpublish, archive. The server checks that the link is on the chosen provider's domain (look-alikes such as `collegeboard.org.evil.com` are refused) and then requests it with an SSRF guard (https only, every resolved address must be public, redirects re-checked, 6 s timeout, body not read). Publishing re-checks the link; a link that stops answering on save drops back to draft. Every change is audited with the acting user. Defaults for usage terms and credit lines follow each provider's published terms (Khan Academy's required line, College Board not-affiliated wording).
- **Student page** `/dashboard/resources` (uz/en/ru, in the nav): links grouped by SAT domain, each with provider, type, language, destination host, attribution and terms; a notice that the sites are not affiliated and that work there is not tracked; links open in a new tab with `noopener`. Empty until staff publish links: no links were invented or seeded.
- **Verified:** 7 unit tests (URL rules, SSRF address classes), 3 DB tests (visibility per role, no client writes, publish/https constraints); all 693 tests pass; 14 Playwright checks (`e2e-resources`); lint and build. The local sandbox has no internet, so the real link check was seen failing honestly (draft, publish refused) — on Vercel it can reach the sites.

### SAT MASTER 2.0-B (3 Nov): AI tutor

No database change (the tutor's structured output lives in `ai_messages.structured`; rows written before keep working through defaults).

- **New answer parts** (uz/en/ru): the underlying *misconception*; *why each wrong choice is wrong* (explain mode, multiple choice); *another way to solve it*; the model's numeric *calculations*.
- **Verified vs AI-written, made visible:**
  - every stated calculation is recomputed on the server by SAT MASTER's own safe arithmetic evaluator (`src/lib/math/arith.ts`: fixed grammar, no `eval`, bounded size, depth and exponents) and shown as "checks out", "SAT MASTER's calculator gets X" or "not checked";
  - explain mode: the answer still comes from the reviewed answer key, and per-choice notes are dropped for any choice that is not real or that the key marks correct, so the AI can never call the verified answer wrong;
  - every answer ends with a label: reviewed key + AI explanation / AI-written and unchecked (chat) / AI hint without the answer.
  - Wolfram|Alpha is still not connected (commercial agreement required), and nothing claims it.
- **Not revealing answers too early:** in chat the final answer stays hidden behind "Show the answer"; hint mode now also strips calculations, the second method and choice verdicts, and the leak check reads the misconception field too.
- **Connected to learning progress:** a `<learner_profile>` block built on the server from the student's own results (accuracy in the question's skill, earlier misses of that question; weakest skills for chat) tells the model how deep to go. It is never stored as message text, and students cannot forge it (the tag is neutralised in student text).
- **Verified:** 579 unit tests (13 new, including the evaluator's refusal cases and old-row parsing); all 683 tests across unit and DB; structured-output schema checked against the documented limits ($ref/$defs and anyOf supported, ≤16 union fields); 13 Playwright checks with the mock provider (`e2e-tutor`); lint and build.
- **Not verified:** real model quality, because `ANTHROPIC_API_KEY` is not set in production (AI stays `NOT_CONFIGURED`).

### SAT MASTER 2.0-A (3 Nov): Learning Intelligence, personal assignments

Follows the "Unique value proposition" directive. Integration terms were checked first; see
[COMPETITIVE_STRATEGY.md](COMPETITIVE_STRATEGY.md) (Uzbek) for sources and decisions.

- **External integrations (checked, nothing activated):**
  - Wolfram|Alpha: commercial use needs a commercial agreement, attribution ("Computed by Wolfram|Alpha" + link) and no caching → `NOT_CONFIGURED`.
  - Khan Academy: public API decommissioned; content is CC BY-NC-SA, so not usable inside a paid product → plain links only, no progress sync claimed.
  - Desmos: partner key needed → `NOT_CONFIGURED` (link only).
  - College Board: trademark notice must appear on every page that names SAT® → now also shown at the bottom of every student and teacher app page.
- **Learning Intelligence v1** (`src/features/intelligence/engine.ts`, pure and unit-tested):
  - reads only the student's own scored answers (last 180 days; questions of a running timed test excluded), activity, latest estimate, mocks and flashcards;
  - rules: repeated mistakes in a skill (≥3 wrong in 14 days, <60%), hard questions before the basics are solid, pace vs the Digital SAT (median of measured answers, 95 s Math / 71 s RW, idle time capped), rushing, week-over-week change, weakest domain (≥10 answers, <60%), target vs latest estimate, mock readiness, flashcards due, study consistency;
  - every insight carries its evidence numbers; below 10 answers no answer-based insight is shown and the card says what is needed;
  - dashboard card "Next best step" (uz/en/ru) with one action and up to four more insights; practice links can preset `difficulty` and `timed=1`.
- **Classroom ↔ learning link:**
  - **migration 0020** (`assignments.assignee_id`): a personal assignment for one student of a group (composite FK to `group_members`); the read policy shows it only to that student and the group's staff;
  - the teacher's student page has "Give personal practice", preset to the weakest domain from practice the student chose to share (same thresholds as the student's own insights);
  - only that student is notified; the group page marks it and counts 0/1;
  - open class work (personal first, then nearest due) is the first item of the student's daily mission, in plan and rules modes.
- **Verified:**
  - 569 unit tests (17 new); 104 DB tests (5 new: visibility per student, staff and other workspace; leaving the group; FK; client writes denied);
  - lint, typecheck, production build;
  - 24 Playwright checks (`e2e-intel`): insights in Russian with evidence and no placeholders, practice presets, teacher suggestion = weakest shared domain by SQL, notification and audit only for the assignee, mission and "for you" badge, classmate cannot see it or open it by URL (404), group work still reaches everyone, assignment practice linked to its attempt, College Board notice in the app, 390 px layouts; earlier suites re-run: dashboard 37/37, PHASE 2 30/30, classroom 32/32.

### SAT MASTER 2.0, PHASE 3 (3 Nov): teacher workspaces

- **Teacher app** (`/teach`, uz/en/ru):
  - any user can create a workspace (an independent teacher or an education centre; at most 5 active ones);
  - **groups**;
  - **invitations**: an 8-character code shown as `XXXX-XXXX`, a link `/join/CODE` and a QR code, with a validity period, a use limit and revoke;
  - a **team** page: owners and admins invite admins, teachers and assistants; staff can be removed, but never the owner;
  - **assignments**:
    - practice: subject, domain, difficulty, count, optionally timed; scored automatically;
    - a mock exam: counted when the student finishes it after it was set;
    - a written task, which the teacher grades with points and feedback;
  - a per-student page.
- **Roles:** owner, admin, teacher, assistant, student, checked by `can()` (unit-tested) before every write. Teachers and assistants see only the groups they are assigned to; assistants cannot create or archive groups.
- **Student side** (`/dashboard/classes`):
  - joining by code or link (also right after signing up from the link);
  - assignments with status, a grade and feedback;
  - in-app notifications in the student's own language;
  - an **opt-in switch** that lets a workspace's teachers see the student's own practice (accuracy by domain, score estimate). AI tutor chats are never shared.
- **Teacher-assigned practice does not count against the student's plan limit** (`attempts.assignment_id`).
- **Isolation:**
  - every classroom table carries `workspace_id`;
  - composite foreign keys stop rows from pointing across workspaces;
  - clients may only SELECT, scoped by membership (RLS); all writes go through the server;
  - joining and creating are atomic SQL functions that only the server can call;
  - pages answer "not found" for anything outside the user's access.
  - **S1 is closed for phone numbers:** Telegram links are now readable only by their owner and admins.
- **Migration 0019** (`20261103001900_classroom.sql`) was applied to the hosted project on 3 Nov with the owner's approval, before this code was deployed.
- **Not in this phase:** file materials (PDF/slides), the lesson schedule and attendance (PHASE 4, with the live classroom), and workspace billing (PHASE 5).
- **Verified:**
  - 552 unit tests (21 new);
  - 99 DB tests (15 new): two teachers sharing one student, SELECT isolation per role, INSERT/UPDATE/DELETE denied separately, composite foreign keys, code expiry/revoke/use limits, never downgrading a role, function privileges, S1;
  - lint, typecheck and production build; no known vulnerabilities in production dependencies;
  - 32 Playwright checks:
    - a teacher in Uzbek and a student in Russian;
    - workspace → group → invitation with QR → three kinds of assignment;
    - the student joins by link, does assigned practice (scored, outside the plan limit) and written work;
    - the teacher grades; a score above the points is refused by the server;
    - notifications in the student's language;
    - another teacher, a student and an outsider get "not found" for the first workspace's pages;
    - a revoked code is refused; a removed student loses access while their work is kept;
    - every action is in the workspace audit log;
    - six pages at 390 px with no overflow.

### SAT MASTER 2.0, PHASE 2 (3 Nov)

- **Mistake notebook** (`/dashboard/mistakes`):
  - every question whose latest scored answer is wrong, grouped by skill and filterable by subject;
  - a question leaves the list by itself once it is answered correctly;
  - a new practice mode, `mistakes`, practises the most-missed first;
  - questions of a running timed test stay hidden.
- **Timed drills:**
  - an option in the practice builder;
  - the server sets a deadline at Digital SAT pace (Math 95 s and Reading and Writing 71 s per question);
  - the runner shows a countdown;
  - an answer after the deadline (+5 s grace) is refused and the drill is submitted.
- **Flashcards** (`/dashboard/flashcards`):
  - four original decks with 119 cards in en/uz/ru: Math formulas (33), transitions (24), grammar rules (22), academic vocabulary (40);
  - spaced repetition (simplified SM-2), scheduled by the server;
  - 20 new cards a day; flashcard time counts as study time;
  - the cards live in `content/flashcards/*.json`; students' review state lives in `flashcard_reviews`.
  - The Math formulas and grammar rules were checked by hand.
- **Achievements:** 10 badges on the dashboard, all computed from real records on each load.
- **Russian:**
  - every student page, public page and email-free flow, plus the Telegram bot and Mini App;
  - `ru` is now required by the dictionary type, so an untranslated key fails the build;
  - plurals use CLDR one/few/many;
  - a dictionary-merge bug that would have turned translated lists into objects was fixed before release;
  - question explanations fall back to English, and the 40 study guides stay Uzbek-only.
  - Still English-only: the admin panel.
- **Country** (Settings → Profile):
  - UZ → UZS with Click and Payme;
  - other countries → USD with Stripe;
  - countries where Stripe cannot take payments → no checkout;
  - checkout also checks this on the server;
  - new profiles in Tashkent or Samarkand time default to UZ.
- **Migration 0018** (`20261103001800_learning_extras.sql`) adds the `mistakes` mode, `flashcard_reviews` and `profiles.country_code`. It was applied to the hosted project on 3 Nov with the owner's approval, before this code was deployed.
- **Verified:**
  - 542 unit tests (18 new);
  - 84 DB tests (5 new: SELECT, INSERT, UPDATE and DELETE on `flashcard_reviews` separately, country self-update, practice mode);
  - lint, typecheck and production build;
  - 30 Playwright checks in Russian: the notebook and practice from mistakes (every question really is an open mistake); a drill expired on the server refusing a late answer; flashcard reviews saved with the right interval; country saved and USD prices shown; 5 student pages at 390 px; 9 public pages in Russian with no overflow; no page errors.

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
| 0026 workspace plans (1 table, 2 columns, 1 new function, `workspace_join` replaced with a limit check; no existing data touched, no plans created) | Applied on 5 Nov with the owner's approval. Checked afterwards: RLS on; 0 plans and no workspace has a plan, so nothing is limited; clients cannot write plans, set a workspace plan or call either function; the server can; `workspace_join` contains the limit check; 68 tables, all with RLS. |
| 0027 session guests (2 new tables; no existing table or data touched) | Applied on 5 Nov with the owner's approval. Checked afterwards: RLS on both tables with one read policy each; clients can only SELECT (no insert/update/delete), anon has no access; 70 tables, all with RLS. |
| 0025 class challenges (1 table, 1 column; no existing data touched) | Applied on 5 Nov with the owner's approval. Checked afterwards: RLS on, `authenticated` SELECT only, cannot update `leaderboard_opt_in`, `anon` nothing; every existing member starts opted out; 67 tables, all with RLS. |
| 0024 class polls (2 tables; no existing data touched) | Applied on 4 Nov with the owner's approval. Checked afterwards: RLS on both; `authenticated` cannot read `correct_index`, can read the other columns, cannot write; `anon` nothing; 66 tables, all with RLS. |
| 0023 live lesson joins (1 table; no existing data touched) | Applied on 4 Nov with the owner's approval. Checked afterwards: RLS on, one read policy, `authenticated` SELECT only, `anon` nothing; 64 tables, all with RLS. |
| 0022 class lessons (3 tables, 1 private bucket; no existing data touched) | Applied on 4 Nov with the owner's approval. Checked afterwards: RLS on all three tables, `authenticated` SELECT only, `anon` nothing; `workspace-files` bucket private (20 MB, PDF/PNG/JPG/WEBP) with no storage policies; 63 tables, all with RLS. |
| 0021 Resource Hub (1 table; no existing data touched) | Applied on 4 Nov with the owner's approval. Checked afterwards: RLS on, one read policy, `authenticated` has SELECT only, `anon` nothing; 60 tables, all with RLS. |
| 0020 personal assignments (1 column, 1 FK, 1 index, one policy changed; no existing data touched) | Applied on 3 Nov with the owner's approval. Checked afterwards: column, FK and new read policy present; clients still have SELECT only on `assignments`; 59 tables, all with RLS. |
| 0019 classroom (8 tables, 2 columns, 7 functions; one policy narrowed; no existing data touched) | Applied on 3 Nov with the owner's approval. Checked afterwards: 59 tables, all with RLS; `authenticated` cannot insert, update or delete any classroom table and `anon` cannot read them; `workspace_create` and `workspace_join` are callable by the server only; the Telegram policy now allows only the owner and admins. |
| 0018 learning extras (1 table, 1 column, wider practice-mode check; no existing data touched) | Applied on 3 Nov with the owner's approval. Checked afterwards: RLS on; `authenticated` can only SELECT `flashcard_reviews` (own rows), cannot insert, update or delete; may update `country_code` but still not `role`; `anon` has no access. |
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
  20261102001500 20261102001600 20261102001700 20261103001800 20261103001900 20261103002000 20261103002100 20261104002200 20261104002300 20261104002400 20261104002500 20261105002600 20261105002700
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
