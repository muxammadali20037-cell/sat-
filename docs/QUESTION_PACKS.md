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
- **Mix per skill:** 3 easy, 3 medium and 2 hard for every 8 questions (core-v1 to v3: 8 per skill; core-v4: 16 per skill, 6/6/4). Math skills include at least a quarter student-produced-response (SPR) questions (2 of 8, 4 of 16); Reading and Writing has no SPR, as on the real test. The checker reads the per-skill size from the pack's files (or `--per-skill N`).
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

## core-v4 (5 Nov 2026): 480 questions, 16 per skill

- **What guided it:** an analysis of 317 recalled 2026 math items and 163 recalled reading-and-writing items, plus 1,813 topic-sorted practice items, supplied by the owner. Only counts and generic pattern notes were kept (no text copied); writers did not open the source files. The notes steered sub-type coverage, typical traps and what makes an item hard.
- **Writing:** eight writers, by domain group. Every Math key and every distractor was recomputed in Python; every file passes the checker.
- **Blind check:** four separate solvers, who saw neither keys nor the writers' scripts, answered all 480: **480/480 agree with the keys.** One solver found that `probability_conditional#7` was missing its shared table; the table was added (key unchanged). `evaluating_statistical_claims#14` was reworded to "best estimate".
- **Reviewer notes from the writers** (items worth a second look and real facts to confirm during review):

### transitions, rhetorical_synthesis (writer 8)
Second look: transitions#4 (weak distractor), rhetorical_synthesis#3, #16 (invented star study).
Real facts to confirm: jumping spiders no capture webs; Arabic/Hebrew RTL; Samarkand mulberry paper; ice density; baked clay tablets; Arctic ice-albedo feedback; Navoi 1441–1501 Chagatai/Persian pen name Fani; Mendeleev 1869, gallium 1875, germanium 1886; Great Red Spot; Registan dates (Ulugh Beg 1417–1420, Sher-Dor 1619–1636, Tilya-Kori 1646–1660); waggle dance + von Frisch Nobel 1973; Venus flytrap Carolinas, two touches ~20 s; suzani; olm and Mexican tetra eyeless; onion syn-propanethial-S-oxide; O‘tkan kunlar (Qodiriy 1894–1938); Gutenberg Bible ~1455, ~180 copies, <50 survive; magnetic navigation; Shashmaqom UNESCO (Uzbekistan+Tajikistan).
### PSDA stats (writer 4)
Second look: inference_margin_of_error#13 (overlap logic), #4, #9 (larger sample → smaller MOE); evaluating_statistical_claims#14 SPR "about how many" but only 384 accepted → FIX wording. No real facts.
### boundaries, form_structure_sense, inferences (writer 7)
Second look: boundaries#1 (comma before "then"), boundaries#4, inferences#13 (Vibrio). Options shuffled by script in 18 items — blind check will confirm keys.
Real facts: Gobi < −30°C; Richthofen "Silk Road" 1877; tardigrades; Atacama/Namib/Sonoran locations; Gur-e-Amir; Great Green Wall 2007 Senegal–Djibouti; yurt frame; saxaul on Aral seabed; white storks; lettuce red/blue light; jumping spider eyes; mimosa; Vibrio quorum sensing; bloodroot elaiosomes; great tits higher pitch; Abbasid dirhams Baltic/Volga; island species-area; tree rings.
### words_in_context, text_structure_purpose, cross_text_connections (writer 5)
Second look: words_in_context#13 ("far less invariable" awkward), #16 (ephemeral vs intermittent).
Real facts: water-holding frog cocoon; caravanserais ~day apart; camel hump fat; suzani strips/dowry; tree-ring cross-dating; Sinosauropteryx simple feathers; megafauna extinction ~13,000 years ago.
### advanced math + linear functions/inequalities (writer 1)
Second look: linear_functions#16 SPR −1/6 forms (checker accepts); nonlinear_equations_systems#8 redundant x>0 condition (harmless).
### geometry + one_variable_data (writer 3)
Second look: circles#11 (easy for medium), area_volume#14, lines_angles_triangles#10. No real facts.
### algebra + ratios/percentages (writer 2)
Second look: linear_equations_one_variable#15 (40/7), ratios#11, systems#14 (maybe medium). Options re-lettered in 7 items. No real facts.

## core-v5 (7 Nov 2026): 352 Reading and Writing questions, 32 per skill

- **Why RW only:** the number of fully distinct mock exams is limited by RW questions (81 per full mock). With core-v5 the RW bank grows from 440 to 792, so about 9 fully distinct mocks fit.
- **Mix:** 12 easy / 12 medium / 8 hard per skill; answer letters 8 each per skill.
- **Writing:** six writers from a counts-only brief (most-tested skills, grammar points, transition relations, subject mix of recalled 2026 tests; no source text). Every table claim was checked in Python.
- **Blind check:** four separate solvers answered all 352 without keys and gave a reason per item. **351/352 agree.** The one difference (`boundaries#23`) was reviewed: the passage opens the phrase with a comma after "report", so the closing comma (key C) is right and the solver's answer (no punctuation) is wrong. Key kept.
- **Fixes after the check:** `form_structure_sense#16` now names the door in the passage (the key referred to "the door" without it). Solvers noticed the answer letters ran in an A-B-C-D cycle in file order in several files; the rows were shuffled (content unchanged), so ids like `skill#n` now refer to the shuffled order.
- **Reviewer notes from the writers** (items worth a second look and real facts to confirm; numbers refer to the order before shuffling):

#### inferences (v5)
Second look: inferences#17 (literary hesitation), #28 (irony, choice A), #25 (bats catch-rate trap).
Real facts: water expands on freezing; coral bleaching = loss of algae from warm water; lake sediment layering.
#### boundaries, form_structure_sense (v5)
Second look: boundaries#11 (indirect question period), #26 ("however;" with first clause), #32 (dash), form_structure_sense#26.
Real facts: Central Asian tortoise burrows/active in spring; Nukus capital of Karakalpakstan, Termez near Afghan border, Namangan in Fergana Valley; glass frog transparent underside; leafcutter ants fungus; mastava; snow leopards Kyrgyz–Tajik mountains; windbreak trees; salt-storing shrubs; glass annealing.
#### words_in_context, text_structure_purpose (v5)
Second look: words_in_context#16 (counterintuitive vs efficient), #30 (incremental vs sporadic), #32 (superfluous); text_structure_purpose#16 (easy for medium), #28 (irony).
Real facts: gallium melts ~29.76°C; comet tails; nurse plants; cave fish eye loss; madder red / pomegranate rind yellow dyes; infrared reveals underpainting; night migration of songbirds; salt marsh tides; dark vs pale surfaces absorb/reflect.
#### transitions, rhetorical_synthesis (v5)
Second look: transitions#32 ("in turn" vs meanwhile), #27 (Actually); rhetorical_synthesis#22 (Baikal depth distractor), #28 (torpor).
Real facts: coquí frog direct development; wood frog freezing; nettle hairs; madder/pomegranate dyes; non + chekich + tandir; copper patina; protogynous hermaphrodite; greenhouses; cactus root rot; alligator vs crocodile snouts; Tashkent TV Tower 1978–1985, 375 m; Velcro de Mestral 1941; Rishtan/Gijduvan pottery glazes; buzz pollination of tomatoes; drip/flood irrigation; Al-Biruni (973, Khwarazm, Earth radius, India); autumn leaf pigments; Mimosa/Venus flytrap speed; mahalla, hashar; Aral Sea (68,000 km², 4th largest in 1960, eastern basin dry 2014, Kokaral Dam 2005); natural vs cultured pearls; induced demand; Lake Baikal (1,642 m, ~20% unfrozen surface fresh water, Baikal seal); Babur (1483 Andijan, ruler at 11, Panipat 1526, Baburnama in Chagatai); planning fallacy; Archimedes screw; torpor vs hibernation; Navoi (1441–1501, Herat, Muhakamat al-Lughatayn 1499).
#### cross_text_connections, central_ideas_details (v5)
Second look: cross_text_connections#16 (unusual stem), #21 (warblers), #26 (stock phrases); central_ideas_details#20 (poem response), #32 (map, guide distractor).
Real facts: non-native earthworms in glaciated N. America; camel nasal water recovery; hummingbird torpor; clover nitrogen fixation; glacier basal meltwater; songbird star + magnetic navigation; lake sediment preservation; ice cores; suzani dowry (Bukhara); Tashkent metro; Khanate of Khiva 1840s, Ustyurt plateau.
#### command_of_evidence_textual, command_of_evidence_quantitative (v5)
Second look: COE textual#17, #28 (footprints), #30 (squirrels); COE quantitative#29 (households × percent change), #11 (irrelevant-but-true distractor).
Real facts: pH; pebble rounding; beaver ponds; parchment from skin; freeze–thaw cracking; warm water less oxygen; nitrate runoff; seed-eating ants; lizard hind legs and sprinting.
