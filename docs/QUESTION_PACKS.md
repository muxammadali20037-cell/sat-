# Question packs

A question pack is a set of original practice questions shipped with the app, so a new environment does not start with an empty question bank. The first pack, `core-v1`, has 240 questions: 8 for each of the 30 Digital SAT skills.

Pack questions are never published automatically. Importing creates **drafts**, and each one goes through the normal review queue: a reviewer checks the content and the answer key, marks it reviewed, and then someone with publishing rights publishes it.

## Where things live

| What | Where |
|---|---|
| Question files | `content/question-packs/<pack>/<skill_code>.json`, one JSON array per skill |
| Row format | The admin import format (`src/features/content/question-import.ts`): `skill_code`, `difficulty`, `question_type`, `stem`, options or `spr_answers`, `correct`, `explanation_en`, `explanation_uz`, `tags`, `source` |
| Checker | `scripts/question-packs/check.ts` |
| Bundled copy used by the admin import | `src/features/content/packs/<pack>.generated.ts` (one per pack, listed in `packs/index.generated.ts`), generated and server only (it contains answer keys) |
| Admin import | Admin → Question bank → Import → "Starter question pack" |

## Rules every pack question follows

- **Original:** `source` is `original`. No question is copied or adapted from College Board material or any other publisher. The dev seed and the study guides are checked for duplicate stems.
- **Mix per skill:** 3 easy, 3 medium and 2 hard. Math skills include at least 2 student-produced-response (SPR) questions; Reading and Writing has no SPR, as on the real test.
- **Explanations:** every question has an English and an Uzbek explanation. The Uzbek uses ‘ (U+2018) after o/g and ’ (U+2019) for the tutuq belgisi.
- **Math:** written in LaTeX between `$…$`. A literal dollar sign is written `\$`. Every formula must render with KaTeX.
- **SPR answers:** list every accepted form (`7/2|3.5`). Each form must score as correct against the key and fit the SAT answer box.

## Workflow

```bash
# 1. Validate: import rules, counts, difficulty mix, KaTeX, duplicates
npx tsx scripts/question-packs/check.ts core-v1

# 2. Blind verification: export the questions without keys, have someone who has not seen
#    the keys solve them, then compare
npx tsx scripts/question-packs/check.ts core-v1 --blind /tmp/blind.json
#    … the solver writes {"<skill>#<n>": "B", …} to /tmp/answers.json …
npx tsx scripts/question-packs/check.ts core-v1 --compare /tmp/answers.json

# 3. Bundle for the admin import (adds the pack id as a tag on every row)
npx tsx scripts/question-packs/check.ts core-v1 --bundle
```

CI runs step 1 on every push. A unit test (`tests/unit/question-pack.test.ts`) fails if the bundle and the files drift apart, so step 3 must be rerun after any edit.

## Importing into an environment

Admin → Question bank → Import shows the pack, how many of its questions this environment already has, and an "Import N questions as drafts" button.

- **Validation:** the import runs through the same server-side validation as a CSV/JSON upload, against the environment's live taxonomy.
- **Safe to repeat:** questions whose stem already exists with the pack tag are skipped, so pressing the button twice creates nothing new.
- **Audit:** every import writes an audit-log entry.
- **Review link:** "Review imported drafts" opens the review queue filtered to the pack tag (`/admin/questions?view=review&tag=core-v1`).
- **Bulk review:** tick the rows on the question list and use "Mark reviewed", then "Publish reviewed". The database still enforces the order draft → reviewed → published, so nothing reaches students without passing review.

## How core-v1 was verified (2 Nov 2026)

- **Writing:** four writers, one per group of domains, authored the questions. Each recomputed every Math key in Python, and every file passes the checker.
- **Blind check:** the questions were exported without keys and solved by separate solvers who had not seen the keys or the generator scripts. Their answers were then compared with the keys. STATUS.md records the result.
- **Facts to confirm:** real-world facts used in Reading and Writing passages are listed in the writers' notes below. A reviewer should confirm them during the normal review.

### Reviewer notes from the writers

- **Invented people and studies:** names of researchers and artists in passages, and their findings, are invented for the questions. They are not real studies.
- **Real facts used:**
  - Aral Sea area in 1960;
  - dates of the Registan madrasas and of Ulugh Beg's observatory;
  - al-Biruni's method for measuring Earth's radius;
  - the orbital periods of Phobos and Deimos;
  - the largest telescope lens and mirror sizes;
  - Uzbekistan being doubly landlocked;
  - the origins of "kiosk" and "shampoo".
- **Borderline items worth a second look:**
  - `evaluating_statistical_claims` hard SPR (proportional sample sizes);
  - `inference_margin_of_error` hard MC (overlapping plausible ranges);
  - `right_triangles_trigonometry` hard SPR (may be medium).
