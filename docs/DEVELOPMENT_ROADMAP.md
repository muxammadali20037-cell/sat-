# SAT MASTER — Development Roadmap

Each phase ends with: what was built, files created, integrations completed, tests run (with real output), TypeScript and lint status, honest list of unfinished work, and what comes next. Status values below are updated as phases close.

| Phase | Scope | Exit criteria |
|---|---|---|
| **1. Audit & architecture** | Repository audit, product spec, architecture, DB schema, design system, roadmap | Five docs merged; schema migrations apply cleanly to Postgres 16; generated types compile |
| **2. UI foundation** | Tokens, fonts, UI primitives, layouts (public, auth, student, admin, exam), landing + public pages, auth screens, dashboards with real empty states, i18n (en/uz) | All public routes render; responsive at 360/768/1280; no hardcoded statistics |
| **3. Database & auth** | Supabase clients, `proxy.ts`, DAL, sign-up/login/verify/reset/logout, Google OAuth flag, onboarding, roles, RLS tests | RLS integration tests pass (cross-student access denied, students cannot read answer keys or change roles/subscriptions) |
| **4. Learning system** | Courses, lessons, video provider abstraction + heartbeat completion, question delivery, scoring, practice engine, diagnostic, bookmarks, results, analytics | Practice and diagnostic flows work end-to-end against the DB; scoring unit tests pass; no answer key in any pre-submission payload |
| **5. AI** | Provider abstraction (Anthropic + dev mock), tutor chat/explain/hint, generated practice with independent verification, study planner + AI objectives, usage metering and limits | Structured outputs validated; hint mode never returns a final answer (enforced server-side, tested); usage rows recorded |
| **6. Exam engine** | Server-authoritative modules, lazy expiry, adaptive routing, navigator, mark for review, break, results with unofficial estimate | Engine unit tests (routing, expiry, estimate) pass; refresh/resume returns identical state |
| **7. Payments** | Provider abstraction, Click, Payme, Stripe, test provider, verified webhooks, idempotency, subscription lifecycle, entitlements | Signature/auth verification and idempotency tests pass; DB billing function tests (new, renewal, upgrade credit, refund) pass |
| **8. QA** | Unit + DB integration tests, typecheck, lint, production build, responsive screenshots | `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:db`, `npm run build` all green |
| **9. Deployment** | Supabase project setup, migrations, auth URLs, storage, Vercel env vars, provider webhook URLs, monitoring | README deployment guide verified step by step against a real project (requires the owner's accounts) |

**Status (2 Nov 2026):** phases 1–8 complete and verified (typecheck, lint, 435 unit + 55 DB tests, production build, browser E2E on a local Supabase-compatible stack). Phase 9 in progress: Supabase project created; remaining owner steps in [STATUS.md](STATUS.md#launch-checklist-owner-actions).

## Decisions log

| # | Decision | Rationale |
|---|---|---|
| D1 | Next.js 16 with Cache Components **off** | Per-student app; avoids Suspense-everywhere constraint; public pages still static |
| D2 | `proxy.ts` refreshes sessions only; DAL authorizes | Proxy is not a security boundary |
| D3 | Postgres-backed rate limiter | Works across serverless instances without Redis; swap for Upstash later if needed |
| D4 | Answer keys in staff-only tables; server builds `SafeQuestion` | Strongest guarantee against key leakage |
| D5 | `lesson_contents` split from `lessons` | Paid content gated by RLS without column grants that break `select *` |
| D6 | Billing state changes only inside SQL functions | Atomic, idempotent, row-locked, audited |
| D7 | Prepaid monthly periods for Click/Payme; Stripe one-month passes | No unauthorized recurring charges; auto-renew needs separate provider agreements |
| D8 | Deterministic study planner; AI writes objectives only | Plans stay valid and explainable; AI cannot create impossible schedules |
| D9 | Transparent, labelled score estimate | No claim of official scoring; formula is published |
| D10 | Self-hosted fonts | Builds work offline/in CI; no third-party font requests |
| D11 | Desmos API for the graphing calculator, behind `NEXT_PUBLIC_DESMOS_API_KEY` | Matches the tool students meet on test day; no key → honest link-out fallback; CSP opens www.desmos.com only when configured |
| D12 | Reference screenshots (Nov 2) adopted as patterns only | Layout ideas kept; ratings, review counts, XP and leaderboards rejected — no backing data and fabricated stats are forbidden |

## Post-v1 backlog

1. Payme Subscribe API / Click card tokens for opt-in auto-renewal (requires merchant agreements).
2. Stripe Billing subscriptions for international auto-renew.
3. Russian dictionary and explanation translations.
4. Teacher classrooms (groups, assignments).
5. Question calibration (IRT difficulty from response data) to improve module routing.
6. Commercial Desmos API agreement for production; original Math reference sheet.
7. Playwright E2E suite against a seeded Supabase branch in CI.
8. Upstash/Redis rate limiter and edge caching for the marketing site.
9. AI tutor whiteboard (handwritten working on a canvas, tutor feedback on each step).
10. Leaderboards / XP only once there is real, opt-in cohort data to back them.
