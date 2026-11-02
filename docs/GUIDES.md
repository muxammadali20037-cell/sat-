# Study guides ("O‘zbekcha qo‘llanma")

Study guides explain every Digital SAT skill — and general test strategy — in Uzbek, so students who are still building their English can understand the method before practising in English. They are free on every plan.

## What students see

- **`/dashboard/guides`** — the hub:
  - "Recommended for you": the weakest practised skills that have a guide;
  - strategy guides in reading order;
  - skill guides grouped by subject → domain, with "read" marks and progress.
- **`/dashboard/guides/<slug>`** — one guide:
  - the page: sections with an "on this page" index on desktop, solutions folded under each worked example so students try first, and "mark as read";
  - links from the guide: "practise this skill" (prefilled practice builder), related lessons and the AI tutor.
- **Links into guides:**
  - the lesson page shows "This topic explained in Uzbek" when its skill has a guide;
  - in the practice runner, every answered question links to its skill's guide;
  - diagnostic and practice results link each weakest skill to its guide;
  - new students get a "How to use SAT MASTER" link on the dashboard.
- Section labels follow the **guide's** language, not the interface language. Questions, answer choices and English terms stay in English, as on the test.

## Content model

Content is structured, not free text, so every guide has the same shape and the UI can render each part well:

| Section `type` | Purpose | Main field |
|---|---|---|
| `concept` | What the question tests, key rules and formulas | `body` |
| `recognize` | How to recognise the question type (quote English stems in *italics*) | `items` |
| `method` | Step-by-step method | `steps` (≥ 3 for skill guides) |
| `example` | Worked example: English problem/passage/choices, Uzbek solution steps, answer | `example` |
| `watch_out` | What to pay attention to | `items` |
| `traps` | Typical wrong-answer patterns | `items` |
| `time` | Pacing and tools (Desmos, reference sheet) | `items` |
| `terms` | English terms with Uzbek meanings | `terms` |
| `checklist` | Quick check before answering | `items` |
| `note` | Anything else | `body` / `items` |

The schema and limits live in `src/features/guides/schema.ts`. Every text field uses SAT MASTER rich text: `**bold**`, `*italic*`, `__underline__`, `- ` lists, `$inline math$`, `$$display math$$` and `\$` for a literal dollar. Emphasis may contain math. A skill guide must have concept, recognize, method, example, terms, and at least one of watch_out or traps (`skillGuideGaps`).

## Authoring workflow

**Bulk / initial content (developers):**

1. Write `content/guides/<slug>.json` (see `linear-equations-one-variable.json` for the reference standard).
2. Validate: `npx tsx scripts/guides/build.ts --check`. This checks:
   - the schema, the required sections and the skill codes;
   - one guide per skill;
   - that every math segment renders with KaTeX.
3. Generate the data migration: `npx tsx scripts/guides/build.ts`. This writes `supabase/migrations/20261102001400_guides_content.sql`. It inserts only missing guides and languages, so edits made in the admin panel are never overwritten.
4. `npm test` re-validates every content file (`tests/unit/guides.test.ts`).

**Ongoing edits (content team): Admin → Study guides:**

- Settings: slug, type, skill or subject, order, reading time.
- One tab per language (Uzbek, English, Russian), with a JSON section editor, section templates, live validation and a live preview.
- Publish, unpublish and archive. The database refuses to publish a guide without content, and keeps only one live guide per skill.
- Every change is recorded in the audit log.

## Writing standard

- Natural modern Uzbek in Latin script, polite *siz*.
- Write o‘ and g‘ with ‘ (U+2018), and the tutuq belgisi with ’ (U+2019).
- Examples are original: never copied or paraphrased from College Board or any published source. Verify every answer key.
- State a format fact (timing, counts, answer-entry rules) only if it is verified on the College Board's official pages. Never promise a score.

## Security

- **Tables:** `guides`, `guide_contents` and `guide_reads`, with RLS:
  - students read published guides only;
  - only content managers write;
  - students insert and delete their own read marks, and only for published guides.
- **Tests:** `tests/integration/guides-rls.test.ts`.
