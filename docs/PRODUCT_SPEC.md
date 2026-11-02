# SAT MASTER — Product Specification

> **Learn Smarter. Score Higher.**
> Status: v1 specification · Owner: Product · Last updated: 2026-11-02

## 1. Vision

SAT MASTER is a subscription EdTech platform for the **Digital SAT**. It sells a complete learning loop — *diagnose → learn → practice → measure → adapt* — not a video library.

- **Initial market:** Uzbekistan and Central Asia (UZS pricing, Click and Payme payments, Uzbek interface).
- **Expansion:** US, Europe, Asia, worldwide English-speaking students (USD pricing, international card gateway).
- **Languages:** English is the learning language (questions, passages). The interface and explanations ship in **English and Uzbek (Latin)**. Russian is reserved in the data model (`locale` accepts `ru`) and the i18n type system, so adding it is a translation task, not a refactor.

### Non-negotiable product rules

1. Never guarantee a score. Never imply a score outcome from a purchase.
2. Never claim affiliation with College Board, or that any score is official. "SAT" is used descriptively.
3. Every number a student or admin sees comes from real database records. New accounts see honest empty states.
4. No fabricated testimonials, student counts, score improvements or revenue — anywhere, including the landing page.
5. All original practice content. No copyrighted College Board questions.

## 2. Personas

| Persona | Goal | Key needs |
|---|---|---|
| **Student (16–19)**, Tashkent, target 1400+ | Get into a strong university abroad | Know where they stand, a plan that fits school hours, explanations in Uzbek when stuck, affordable price |
| **Parent (payer)** | Value for money, visible progress | Clear pricing, local payment methods, progress the student can show |
| **Content editor** | Publish accurate questions and lessons quickly | Fast editor with math preview, bulk import, review workflow |
| **Teacher** | Review content quality; follow students | Review queue, student progress views |
| **Admin / Super admin** | Run the business | Real metrics, subscription and payment management, audit trail |

## 3. Learning model (Digital SAT framework)

Two subjects, four domains each; skills are the atomic unit for lessons, questions, analytics and planning. (The spec's "topics" and "skills" map to the same level — College Board's official skill list.)

**Math** (44 questions, 2 modules × 35 min)
| Domain | Share | Skills |
|---|---|---|
| Algebra | ~35% | Linear equations in one variable · Linear functions · Linear equations in two variables · Systems of two linear equations · Linear inequalities |
| Advanced Math | ~35% | Nonlinear functions · Nonlinear equations and systems · Equivalent expressions |
| Problem-Solving & Data Analysis | ~15% | Ratios, rates, proportions & units · Percentages · One-variable data · Two-variable data · Probability · Inference from samples & margin of error · Evaluating statistical claims |
| Geometry & Trigonometry | ~15% | Area & volume · Lines, angles & triangles · Right triangles & trigonometry · Circles |

**Reading & Writing** (54 questions, 2 modules × 32 min)
| Domain | Share | Skills |
|---|---|---|
| Craft & Structure | ~28% | Words in context · Text structure & purpose · Cross-text connections |
| Information & Ideas | ~26% | Central ideas & details · Command of evidence (textual) · Command of evidence (quantitative) · Inferences |
| Standard English Conventions | ~26% | Boundaries · Form, structure & sense |
| Expression of Ideas | ~20% | Rhetorical synthesis · Transitions |

Total: **98 questions, 134 minutes**, section-level multistage adaptive (module 2 difficulty depends on module 1).

## 4. Feature specification

### 4.1 Public site
Home (14 sections per brief), About, Features, Pricing, FAQ, Contact (stored contact requests), Terms, Privacy. Hero: *"Your Smarter Way to Master the SAT."* Primary CTA **Start Free Diagnostic Test** → register → onboarding → diagnostic. Product imagery = rendered components of the real dashboard with clearly fictional sample data labelled "Preview", never presented as real student results.

### 4.2 Accounts & onboarding
Email + password registration with email verification, login, password recovery, secure logout, optional Google OAuth (enabled by env flag). Onboarding (7 steps): name → interface language → current prep level → target score (400–1600, step 10) → exam date → daily study minutes → preferred subjects. Completing onboarding is required before the dashboard; it creates the profile data that seeds the study plan.

### 4.3 Student dashboard
Welcome header; stat row (streak, lessons completed, questions answered, accuracy, study time, plan); Continue learning; Math and R&W progress by domain; Today's plan; Recommended practice (weakest skills); Recent results; Weak skills; Next mock exam. New students: guided empty state with "Take the diagnostic" as the single primary action.

### 4.4 Courses & video lessons
Courses per subject → lessons mapped to skills. Lesson page: secure player (HLS from a private CDN via short-lived signed URLs, or Supabase Storage signed URLs in development), description, objectives, notes (rich text with math), resources, related practice, previous/next. Progress via server-validated heartbeats; resume position; completion only when ≥ 90% of the video has been *watched* (not seeked) — see SYSTEM_ARCHITECTURE §7.

### 4.5 Question bank
Fields: subject, domain, skill, difficulty (easy/medium/hard), answer format (multiple choice / student-produced response), stimulus (text / passage / image), stem, passage, image + alt text, LaTeX math, options, correct answer(s), explanations per locale, estimated time, status (draft → reviewed → published → archived), created by, reviewed by. Editor with live preview, duplicate, archive, search & filters, CSV/JSON bulk import with per-row validation and a dry-run preview. Students only ever see **published** questions, and never see answer keys before submitting.

### 4.6 Practice
Choose subject → domain → skill → difficulty → length, or start a curated practice set, or "retry incorrect" from a past attempt, or practise bookmarks. Immediate feedback after each answer with explanation, bookmark toggle, "Ask AI tutor". Results screen with per-skill breakdown. Plan limits (questions/day) enforced server-side.

### 4.7 Diagnostic
Free for every account. Balanced across all domains of the chosen scope (Math, R&W or both), mixed difficulty, server-timed. Results: per-domain accuracy, level band (Foundation / Developing / Proficient / Advanced), weakest skills, recommended first lessons, and a one-click study plan. Labelled **"SAT MASTER internal diagnostic — not an official score."**

### 4.8 Mock exams
Bluebook-style environment: instructions, section and module timers, question navigator, mark for review, answer persistence, submit confirmation, automatic submission at time-out, refresh/resume safe, optional 10-minute break between sections. Adaptive routing to an easier or harder module 2 using SAT MASTER's own threshold rule. Results show raw scores per module and domain, plus an **"SAT MASTER estimated score range (unofficial)"** computed by a published, transparent formula (SYSTEM_ARCHITECTURE §9). No claim of exact official scoring.

### 4.9 AI tutor
Three-panel workspace (history · conversation · related concept/lesson/practice). Modes: explain (after answering), progressive hints (levels 1–3, never the final answer), concept chat, similar-question generation (validated by an independent solve before it is shown). Structured responses: `concept, identified_mistake, hint, step_by_step_explanation, final_answer, related_skill, next_exercise`. Verified platform explanations take precedence over model reasoning. Daily request limits per plan; every call is metered (tokens, cost, latency, status).

### 4.10 Study plan
Generated from diagnostic results, target score, exam date, daily minutes, weak domains, lesson completion and practice accuracy. A deterministic planner produces the task schedule; when AI is configured it writes the weekly objectives and rationale, which the backend validates before saving. Views: today, this week, completed, remaining, subject split, overall progress. Regenerate after changing target score or exam date.

### 4.11 Subscriptions
Plans (pricing hypotheses, editable in admin):

| | Free | Starter | Pro | Premium |
|---|---|---|---|---|
| Price / month | 0 | 99,000 UZS | 199,000 UZS | 399,000 UZS |
| Diagnostic | ✓ | ✓ | ✓ | ✓ |
| Video lessons | Preview lessons | ✓ | ✓ | ✓ |
| Practice questions / day | 20 | 100 | Unlimited | Unlimited |
| AI tutor requests / day | 3 | 15 | 50 | 150 |
| Mock exams / month | — | 1 | 4 | Unlimited |
| Analytics | Basic | ✓ | ✓ | ✓ |
| Study plan | — | ✓ | ✓ | ✓ |

Lifecycle: checkout → provider confirmation (verified webhook) → active period of 1 month → renewal by new payment (Click/Payme are prepaid; no automatic card charges are created). Cancel = no renewal, access until period end. Grace period (default 3 days, configurable) after period end. Upgrade = immediate, unused days converted pro-rata into days on the new plan. Downgrade = scheduled for next renewal. Refunds are recorded by admins (money is returned in the provider's cabinet) and optionally revoke access. Failed payments never change access.

### 4.12 Admin
Overview metrics from live queries (students, active subscriptions, new registrations, MRR, payments, cancellations, engagement, AI usage, recent activity). Modules: students, courses, subjects, domains, skills, lessons, question bank (+ review queue, import), mock exams (module builder with auto-fill by domain weights), plans & features, subscriptions, payments (+ refunds), AI usage, analytics, platform settings, audit log. Financial rows cannot be deleted by anyone; every admin mutation is audited.

## 5. Roles & permissions

| Capability | SUPER_ADMIN | ADMIN | CONTENT_EDITOR | TEACHER | STUDENT |
|---|---|---|---|---|---|
| Study, practise, exams, AI | ✓ | ✓ | ✓ | ✓ | ✓ (own data) |
| Read content incl. answer keys | ✓ | ✓ | ✓ | ✓ | — |
| Create / edit content | ✓ | ✓ | ✓ | — | — |
| Review questions | ✓ | ✓ | ✓ | ✓ | — |
| Publish content | ✓ | ✓ | ✓ | — | — |
| View students & progress | ✓ | ✓ | — | ✓ | — |
| Plans, subscriptions, payments, refunds | ✓ | ✓ | — | — | — |
| Settings | ✓ | ✓ | — | — | — |
| Assign ADMIN / SUPER_ADMIN | ✓ | — | — | — | — |
| Assign editor / teacher / student | ✓ | ✓ | — | — | — |
| Audit log | ✓ | ✓ | — | — | — |

## 6. Success metrics (instrumented, not claimed)
Activation (diagnostic completed within 24h of signup), D7 retention, weekly practice questions per active student, lesson completion rate, free→paid conversion, monthly churn, AI cost per paying student. All derive from tables in DATABASE_SCHEMA.md.

## 7. Out of scope for v1 (documented, not faked)
Automatic recurring card charges in Uzbekistan (needs Payme Subscribe / Click card-token agreements), Stripe Billing auto-renew, native mobile apps, live classes, built-in graphing calculator, Russian translation content, licensed official score conversion.
