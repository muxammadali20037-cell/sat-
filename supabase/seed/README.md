# Development seed

> **DEVELOPMENT / DEMO ONLY.** Everything in `dev_seed.sql` is original sample content written for SAT MASTER. It is not College Board material and does not reproduce or paraphrase official SAT, Bluebook or Khan Academy items. **Never load it into production.** Production content is authored and reviewed in `/admin`.

The reference data the app needs everywhere (subjects, domains, skills, plans, platform settings, diagnostic definitions) lives in the migrations (`supabase/migrations/*_reference_data.sql`). This folder adds sample learning content so that a development environment has something to practise, browse and test.

## Files

| File | Purpose |
|---|---|
| `dev_seed.sql` | Sample content (one transaction, re-runnable) |
| `make_admin.sql` | Promotes an existing account to `SUPER_ADMIN` |
| `../../scripts/db/check-seed.sql` | Integrity checks; raises an exception listing every problem it finds |

## What the seed contains

**Seed author.** An `auth.users` row `content-seed@satmaster.invalid` (id `00000000-0000-4000-8000-000000000001`) with no password, so it cannot sign in. Its profile is promoted to `CONTENT_EDITOR` and used as `created_by` and `reviewed_by` for all seed content.

**64 published questions**: 8 per domain, each domain with 3 easy, 3 medium and 2 hard questions, all tagged `dev-seed`.

| Subject | Domain | MC | SPR | Skills covered |
|---|---|---|---|---|
| Math | Algebra | 5 | 3 | all 5 |
| Math | Advanced Math | 6 | 2 | all 3 |
| Math | Problem-Solving and Data Analysis | 6 | 2 | all 7 |
| Math | Geometry and Trigonometry | 5 | 3 | all 4 |
| Reading and Writing | Craft and Structure | 8 | 0 | all 3 (5 words-in-context items) |
| Reading and Writing | Information and Ideas | 8 | 0 | all 4 |
| Reading and Writing | Standard English Conventions | 8 | 0 | both (5 boundaries items) |
| Reading and Writing | Expression of Ideas | 8 | 0 | both |

- Every question has an English explanation that covers why the key is right and why the main distractors are wrong. 24 questions also have an Uzbek explanation in Latin script: 12 Math and 12 Reading and Writing, with at least 2 in every domain.
- SPR keys follow the entry rules in `src/lib/scoring` and list equivalent forms where natural (`3/4`, `.75`, `0.75`).
- Reading and Writing items use one short passage each (`stimulus_type = 'passage'`). Conventions items use a `______` blank, rhetorical synthesis items use bullet notes plus a stated goal, cross-text items use **Text 1** / **Text 2**, and quantitative-evidence items give the data as list lines.
- Questions are inserted as `draft` and published afterwards, so the `questions_guard_status` trigger confirms that each one has a valid key and an English explanation.

**2 published courses, 16 published text lessons** (`video_provider = 'none'`). There are two lessons per domain, each mapped to a skill, with 240–300 words of notes: a key idea, a worked example, common traps and a quick self-check. The first lesson of each course is a free preview.

- `digital-sat-math-core`: linear equations, systems, quadratic functions, equivalent expressions, ratios and units, percentages, right-triangle trigonometry, circles.
- `digital-sat-reading-writing-core`: words in context, text structure and purpose, quantitative evidence, inferences, boundaries, agreement, rhetorical synthesis, transitions.

**4 published practice sets.** Titles use the form `<Skill or domain> · <Difficulty>` so the practice runner header reads well:

| Title | Scope | Questions |
|---|---|---|
| Algebra · Mixed | Algebra domain | 6 |
| Advanced Math · Mixed | Advanced Math domain | 7 |
| Words in context · Mixed | Words in context skill | 5 |
| Boundaries · Mixed | Boundaries skill | 5 |

The two Math sets are scoped to a domain, not a single skill. With 8 questions per domain spread across every skill, no single Math skill has the 5 questions a set needs.

**Demo mock exam** `demo-mock-exam` ("Demo mock exam (shortened)"). It is adaptive, routes at a threshold of 0.6, has a 120-second break and `is_full_length = false`. Each section has three 8-question modules: module 1 (standard, mixed difficulty, all 4 domains), module 2 easier (easy and medium) and module 2 harder (medium and hard). Reading and Writing modules last 600 seconds and Math modules last 720 seconds. The 24 questions in each section are all different. Its results only exercise the exam flow and say nothing meaningful about a score.

**Diagnostics.** The diagnostics defined in the reference data draw 2–3 published questions per domain at start time, and 8 per domain is enough for all of them.

## Loading

Local test cluster (Postgres 16 with the Supabase shim):

```bash
scripts/db/test-db.sh start
scripts/db/test-db.sh reset --seed          # drop/recreate DB, apply shim + migrations + this seed
psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 54329 -U postgres -d satmaster_test -f scripts/db/check-seed.sql
```

Use `TEST_DB_NAME=<name>` to work in your own database rather than the shared `satmaster_test`.

Supabase, **development project only**. Apply the migrations first, then do one of the following:

- Open the SQL editor, paste `dev_seed.sql` and run it (it runs as `postgres`, which can insert into `auth.users`).
- Or run `psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/dev_seed.sql`.

Then run `scripts/db/check-seed.sql` the same way. It prints `Seed check passed.` and a summary table, or raises an exception that lists every problem.

### Re-running and editing

The seed uses fixed UUIDs and `on conflict do nothing`, so running it again is safe, but **existing rows are never updated**. To pick up edits to a seed question or lesson, reset the database (locally: `reset --seed`), or delete the affected rows in a development project before re-running. After students have answered a seed question, a foreign key blocks its deletion; archive it in `/admin` instead.

| Rows | UUID prefix |
|---|---|
| Questions (`…-0000000000NN`, NN = 01–64) | `10000000-` |
| Answer options / explanations / SPR answers | `11000000-` / `12000000-` / `13000000-` |
| Courses / lessons / lesson contents | `20000000-` / `30000000-` / `31000000-` |
| Practice sets / set questions | `40000000-` / `41000000-` |
| Mock exam / modules / module questions | `50000000-` / `51000000-` / `52000000-` |

Content markup follows `src/lib/rich-text/tokenize.ts`. Write `\$` for a literal dollar sign, keep a `______` blank to one per line (two blanks on one line would parse as `__underline__`), and avoid stray `*` or `_` pairs.

## Becoming an admin

1. Sign up in the app with your own account. This creates your profile as `STUDENT`.
2. Run `make_admin.sql` as `postgres`:
   - psql: `psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -v email='you@example.com' -f supabase/seed/make_admin.sql`
   - Supabase SQL editor: paste the file, replace `:'email'` with `'you@example.com'`, and run it.
3. Sign out and back in. You can now open `/admin`, and further role changes go through the admin UI.

The script fails with a clear message if no profile has that email. The role change is recorded in `audit_logs`.
