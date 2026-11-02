# Contributing to SAT MASTER

Read `docs/SYSTEM_ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md` and `docs/DESIGN_SYSTEM.md` first. This file is the practical map of the foundation and the rules every change follows.

## Non-negotiables

1. **No fake data in product surfaces.** Every number comes from the database. New users see honest empty states with a next action. Marketing previews use obviously fictional sample data labelled "Preview".
2. **No answer keys before submission.** Question payloads for students are built only with `loadSafeQuestions()` (`src/features/questions/server.ts`). Keys (`loadAnswerKeys`) and explanations (`loadExplanations`) are used server-side, and revealed only for questions the student has answered where feedback is allowed (practice: immediately; diagnostic/exam: after finalization).
3. **Authorize first, then use the service role.** Pages: `requireUser` / `requireStudentReady` / `requireRole`. Handlers: `route({ auth })`. Actions: `getApiContext()`. Only then call `createAdminSupabase()` (`ctx.admin()` in handlers). Every service-role read of user data filters by the authorized user id.
4. **Validate every input with Zod** (`route({ body, query })`, or `schema.safeParse` in actions).
5. **Never trust the browser** for scores, timing, payment status, plan, or role.
6. **Don't pretend.** Missing credentials → explicit "not configured" state (`ApiError(503, 'AI_NOT_CONFIGURED' | 'PROVIDER_NOT_CONFIGURED')`), never simulated success outside the dev-only test modes.
7. **No new npm packages** without approval; everything needed is installed (see `package.json`).
8. **Don't edit existing migrations.** A schema change is a new migration file + `npm run db:types`.

## Next.js 16 specifics (this is not Next 13/14)

- `params` and `searchParams` are **Promises**: `export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params }`.
- `cookies()` / `headers()` are async.
- Middleware is `src/proxy.ts` (exported `proxy`). It only refreshes sessions.
- Cache Components is **off**; pages that read the session are dynamic automatically. Use `revalidatePath()` after mutations in server actions (`revalidateTag` needs a second argument in v16).
- `redirect()` / `notFound()` throw — never wrap them in a try/catch that swallows errors.
- Route handlers: `export const POST = route({...})` from `@/lib/api/route`.
- `next lint` no longer exists; run `npx eslint <paths>`.

## Foundation map

| Need | Use |
|---|---|
| Current user / profile | `getCurrentProfile()`, `requireUser()`, `requireStudentReady()`, `requireRole(ROLES)` — `@/lib/auth/session` |
| Role sets | `STAFF_ROLES`, `CONTENT_ROLES`, `ADMIN_ROLES`, `STUDENT_VIEWER_ROLES`, `hasRole`, `canAssignRole` — `@/config/roles` |
| DB (RLS, as user) | `createServerSupabase()` — `@/lib/supabase/server` (type `Db`) |
| DB (service role) | `createAdminSupabase()` — `@/lib/supabase/admin` (server only) |
| JSON API handler | `route({ auth, body, query, rateLimit, handler })` — `@/lib/api/route`; throw `ApiError` from `@/lib/api/errors` |
| Client fetch | `apiFetch<T>(path, { method, body })` → throws `ApiClientError` with `.code` — `@/lib/api/client` |
| Server action result | `ActionResult<T>` — `@/lib/api/errors` |
| Rate limits | `RATE_LIMITS.*` rules, `enforceRateLimit(rule, identity)`, `clientIp()` — `@/lib/security/rate-limit` |
| Audit | `writeAudit({...})` — `@/lib/audit` (row changes on staff tables are audited automatically by trigger) |
| Entitlements | `getEntitlements(userId)`, `requireFeature(userId, key)`, `assertWithinLimit(userId, key, tz, n)`, `getUsage` — `@/features/entitlements/server` |
| Plans | `getPublicPlans(db)` — `@/features/plans/server` |
| Taxonomy | `getTaxonomy(db)` — `@/features/taxonomy/server` |
| Questions | `loadSafeQuestions`, `loadAnswerKeys`, `loadExplanations`, `buildReveal`, `optionBelongsToQuestion` — `@/features/questions/server` |
| Scoring | `scoreAnswer`, `parseSprResponse`, `isSprCorrect`, `levelFromAccuracy`, `routeSecondModule`, `estimateSectionScore` — `@/lib/scoring` |
| Activity / streaks | `recordActivity(userId, tz, delta)` — `@/features/activity/server`; SQL `activity_streak(user, date)` |
| Time zones | `localDate`, `startOfLocalDay`, `startOfLocalMonth`, `addDays`, `daysBetween` — `@/lib/time` |
| Formatting | `cn`, `formatMoney`, `formatNumber`, `formatPercent`, `formatDuration`, `formatClock`, `safeRedirectPath` — `@/lib/utils` |
| i18n | `defineDict` (`@/lib/i18n/dict`), `getDict(dict)` (server, `@/lib/i18n/server`), `useDict(dict)` (client, `@/lib/i18n/client`), `format(template, values)`; shared chrome strings in `@/lib/i18n/dictionaries/common` |
| Env | `publicEnv`, `serverEnv()`, `isSupabaseConfigured`, `siteUrl(path)` — `@/lib/env` |
| Generated DB types | `Database`, `Tables<'x'>`, `TablesInsert<'x'>` — `@/types/database` |
| Client-safe question types | `SafeQuestion`, `RevealedAnswer`, labels — `@/types/questions` |

### UI kit (`src/components/ui`)

| File | Exports |
|---|---|
| `button.tsx` | `Button` (variants primary/secondary/ghost/destructive/navy/link; sizes sm/md/lg/icon/icon-sm; `loading`, `asChild`), `IconButton`, `buttonVariants` |
| `input.tsx` | `Input`, `Textarea`, `NativeSelect`, `Label`, `FormField` (render-prop with aria wiring) |
| `controls.tsx` | `Checkbox`, `RadioGroup`, `RadioGroupItem`, `Switch`, `Select` (Radix, options array) |
| `dialog.tsx` | `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose`, `Drawer`, `DrawerTrigger`, `DrawerContent` (side, title), `DrawerClose`, `ConfirmDialog` |
| `menus.tsx` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `DropdownMenu*`, `Tooltip` (content prop), `Popover`, `PopoverTrigger`, `PopoverContent` |
| `card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `Badge` (neutral/primary/success/warning/destructive/outline/navy), `Separator`, `Alert` |
| `progress.tsx` | `ProgressBar`, `CircularProgress`, `StatCard` (value `null` → "—" + hint) |
| `states.tsx` | `Skeleton`, `LoadingState`, `EmptyState`, `ErrorState` |
| `data-table.tsx` | `DataTable` (columns/rows/rowKey/empty), `Pagination` (link-based) |
| `toast.tsx` | `toast` (sonner), `Toaster` (already mounted in root layout) |
| `breadcrumb.tsx` | `Breadcrumb` |

Layout: `PageHeader`, `Section` (`components/layout/page-header`), `Logo`, `LogoMark`, `LocaleSwitcher`, `AppShell` (already wired in `dashboard/(app)/layout.tsx` and `admin/layout.tsx`).
Learning: `RichText` (safe text + KaTeX), `QuestionCard`, `AnswerOption`, `QuestionNavigator` (`components/learning/*`).
Subscription: `UpgradeNotice` (`components/subscription/upgrade-notice`).

New primitives go in **new** files; do not restyle existing ones.

## Route layout

- `src/app/dashboard/layout.tsx` — requires a signed-in user; sets the profile locale.
- `src/app/dashboard/(app)/…` — student pages with the app shell (requires completed onboarding; staff exempt).
- `src/app/dashboard/(focus)/…` — full-screen timed tests (mock exam runner).
- `src/app/dashboard/onboarding/page.tsx` — outside both groups (no shell).
- `src/app/admin/…` — staff only (layout); each page calls `requireRole(<its role set>)` again.
- `src/app/(public)/…`, `src/app/(auth)/…` — public site and auth screens.

## Cross-feature URL contracts

| From | Link |
|---|---|
| Ask the AI tutor about a question | `/dashboard/ai-tutor?questionId=<uuid>` (server verifies the student answered it) |
| Practise a skill | `/dashboard/practice?subject=<math\|reading_writing>&domain=<uuid>&skill=<uuid>` |
| Lesson | `/dashboard/lesson/<lessonId>` |
| Mock exam | `/dashboard/mock-exams/<mockExamId>`; results `/dashboard/mock-exams/results/<attemptId>` |
| Practice/diagnostic results | `/dashboard/results/<attemptId>` |
| Upgrade | `/dashboard/subscription` |

## Testing

```bash
npm test                 # unit (tests/unit)
npm run db:start && npm run db:reset   # local Postgres with migrations + dev seed
npm run test:db          # integration (tests/integration) — uses tests/integration/db.ts helpers
npm run typecheck && npm run lint
```
