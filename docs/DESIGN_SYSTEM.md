# SAT MASTER — Design System

Status: v1 · Implementation: `src/app/globals.css` (tokens) and `src/components/ui/*` (components).

## 1. Point of view

SAT MASTER should feel like a calm, exacting exam room that happens to be on your side. The visual identity borrows from the **artifacts of the Digital SAT itself** — the numbered question navigator, the passage/question split, the "mark for review" flag, the module timer, the 400–1600 scale — instead of generic SaaS decoration. Those artifacts are our motifs.

- **One memorable thing per surface.** On the homepage it is a *working* sample question in the hero (answer it, get a hint, see the explanation) — the product demonstrates itself. Everything around it stays quiet.
- **Structure carries meaning.** Borders separate regions; numbering appears only when content is a real sequence (the learning loop, question numbers, steps); badges encode status, never decoration.
- **Navy is the room, blue is the action.** Navy for chrome and emphasis, blue only for things you can press or the thing you are on.
- **No fabricated proof.** Previews use obviously fictional sample data and say "Preview".

### What we deliberately avoid
Identical rounded cards with the same soft shadow everywhere; gradient washes; glassmorphism; ALL-CAPS eyebrows above headings; one highlighted word in a headline; `→` glued to every link; numbered markers on non-sequences; scattered fade-in animations.

## 2. Color tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--navy-900` | `#101B35` | — | Sidebar, headings on light, dark bands |
| `--navy-800` | `#172746` | — | Admin sidebar, hover on navy |
| `--primary` | `#356AE6` | `#5B87F0` | Primary buttons, links, selected states, focus ring |
| `--accent` | `#6D9EFF` | `#6D9EFF` | Highlights on navy, charts secondary |
| `--background` | `#F5F7FB` | `#101827` | App canvas |
| `--surface` (`--card`) | `#FFFFFF` | `#16213A` | Panels, cards, inputs |
| `--foreground` | `#172033` | `#E8ECF5` | Primary text |
| `--muted-foreground` | `#68748A` | `#93A0B8` | Secondary text |
| `--border` | `#E5EAF2` | `#26324D` | Dividers, outlines |
| `--success` | `#16A36A` | `#2FBF84` | Correct, active, paid |
| `--warning` | `#E9A23B` | `#F0B45A` | Grace period, marked for review, limits |
| `--destructive` | `#DC5353` | `#E66B6B` | Incorrect, errors, destructive actions |

Derived: `--primary-soft` (8% primary on surface) for selected rows/options; `--muted` `#EEF2F8` for subtle fills. Charts use primary → accent → navy-800 → success → warning (never red unless it means "wrong").

Contrast: body text ≥ 4.5:1 on its background in both themes; `--muted-foreground` is only used at ≥ 12px.

## 3. Typography

| Role | Family | Size / line-height | Weight |
|---|---|---|---|
| Display (marketing hero) | Geist | 44–56px / 1.05, tracking −0.02em | 600 |
| Page title | Geist | 30–36px / 1.15 | 600 |
| Section title | Geist | 21–24px / 1.25 | 600 |
| Card heading | Inter | 16–18px / 1.35 | 600 |
| Body | Inter | 14–16px / 1.55 | 400 |
| Secondary | Inter | 12–13px / 1.45 | 400–500 |
| Numbers (timers, scores, stats) | Inter, `font-variant-numeric: tabular-nums` | — | 600 |
| Passages & question stems | Inter 16–17px / 1.65, max 68ch | — | 400 |

Fonts are self-hosted (`geist` and `@fontsource-variable/inter` npm packages) — no runtime calls to Google Fonts. Sentence case everywhere, including buttons and navigation.

## 4. Space, radius, elevation

- **Spacing:** 4px base (Tailwind scale). Page gutters 16px mobile / 24px tablet / 32px desktop. Max content width 1200px (marketing), 1280px (app).
- **Radius hierarchy** (not one radius for everything): controls `6px` (`rounded-md`), cards & options `10px` (`rounded-lg`), large panels & dialogs `14px` (`rounded-xl`), pills `9999px` only for status badges.
- **Elevation:** surfaces are separated by borders, not shadows. Shadows exist for overlays only: `--shadow-overlay: 0 12px 32px -8px rgb(16 27 53 / 0.18)` (dialogs, popovers, dropdowns, toasts).
- **Motion:** 150ms ease-out for state changes (hover, select), 200ms for overlays. One orchestrated moment on the homepage (the hero question reveal). `prefers-reduced-motion` disables non-essential transitions.

## 5. Components (`src/components/ui`)

| Component | Notes |
|---|---|
| `Button` | Variants: `primary`, `secondary` (outline), `ghost`, `destructive`, `navy` (on light, for marketing). Sizes `sm` 32px, `md` 40px, `lg` 48px (touch targets ≥ 40px on mobile). `loading` prop shows spinner and disables. `asChild` for links. |
| `IconButton` | Square, requires `aria-label`. |
| `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Label`, `FormField` | `FormField` wires label, description, error (`aria-describedby`, `aria-invalid`). |
| `Dialog`, `Drawer` (side sheet), `ConfirmDialog` | Radix-based, focus-trapped. `ConfirmDialog` requires a specific action label ("Submit module", "Refund payment"). |
| `Tabs`, `DropdownMenu`, `Tooltip`, `Popover` | Radix-based. |
| `Card` (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) | Border, no shadow. Use only when content is a distinct object; sections are not cards by default. |
| `Badge` | Variants: `neutral`, `primary`, `success`, `warning`, `destructive`, `outline`. |
| `ProgressBar`, `CircularProgress` | Labelled (`aria-valuenow`); circular for single KPIs (accuracy). |
| `StatCard` | Label, value (tabular), optional sub-text. Shows "—" plus an explanation when there is no data. |
| `DataTable` | Server-paginated table with header, empty state, responsive horizontal scroll inside its own container only. |
| `EmptyState`, `LoadingState`, `ErrorState`, `Skeleton` | Empty states always offer the next action. |
| `Toast` | `sonner`; action name matches the button ("Published", "Saved"). |
| `Breadcrumb`, `PageHeader` | `PageHeader` = title, description, actions. |
| `Sidebar`, `Header`, `MobileNav` (`components/layout`) | Navy sidebar ≥ 1024px; top bar + drawer below; bottom tab bar on phones for the five primary student destinations. |
| `RichText` (`components/learning`) | Safe renderer for stems, passages, explanations, lesson notes: paragraphs, `**bold**`, `*italic*`, `__underline__`, inline `$…$` and display `$$…$$` KaTeX. Never accepts HTML. |
| `QuestionCard`, `AnswerOption` | Shared by practice, diagnostic, exams. States: idle, selected, correct, incorrect, eliminated (strike-through), disabled. Keyboard: A–D select, arrows move. SPR input with live "you entered" preview. |
| `QuestionNavigator` | Grid of numbered squares: answered (filled), current (outlined primary), flagged (warning flag), unanswered. |
| `VideoPlayer`, `LessonNavigation` | HLS via `hls.js`, resume position, heartbeat reporting. |

## 6. Layout patterns

**Marketing** (revised 2 Nov after the owner's reference screenshots — decision D12)
```
┌──────────────────────────────────────────────────────────┐
│ logo        Features  Pricing  FAQ        Log in [Start] │  navy-900 field
│                                                          │
│            Your Smarter Way to Master the SAT.           │
│                  subtitle (≤ 60ch), centred              │
│        [Start Free Diagnostic Test]  Explore Platform    │
│     ✓ Free diagnostic  ✓ No card needed  ✓ EN/UZ UI      │
│   ┌──────────────────────────────┬─────────────────┐     │
├───│ live sample question         │ navigator panel │─────┤  overlaps into
│   │ (answer · hint · explanation)│ "Sample data"   │     │  the light section
│   └──────────────────────────────┴─────────────────┘     │
└──────────────────────────────────────────────────────────┘
```
Centred hero on the navy field; the product preview (real `QuestionCard` + `QuestionNavigator`, an original question) overlaps the hero's bottom edge and is the page's one memorable moment. Only factual check bullets — no ratings, review counts or student counts. Below the hero, light sections; the mock exam section is a contained navy panel rather than a second full-width band.

**Student app:** navy sidebar (logo, Dashboard, Courses, Practice, Mock exams, AI tutor, Study plan, Analytics, Results, Bookmarks; account items at the bottom) + content column with `PageHeader`. Phones: top bar + bottom tabs (Home, Learn, Practice, Tutor, More).

**Exam mode:** full-screen, no app chrome. Top bar: section and module, timer (can be hidden), directions. Desktop: passage | question split with a draggable-free fixed 50/50; tablet/mobile: passage collapses above the question. Bottom bar: back/next and the navigator popover.

**Admin:** same shell, `navy-800` sidebar labelled "Admin", dense tables, filters in a toolbar above tables, editors in two columns (form | live preview).

## 7. Content and voice

- Plain, specific, encouraging without hype. Address the student as "you".
- Buttons say exactly what happens: "Start practice", "Submit module", "Save question", "Publish". The resulting toast reuses the verb ("Published").
- Errors state what happened and how to fix it: "That code has expired. Request a new one." — no apologies, no vagueness.
- Empty states invite action: "No practice yet. Pick a skill to start your first set."
- Never: "guaranteed", "official score", "College Board approved", invented statistics or testimonials. Required disclaimer near estimates: "SAT MASTER estimate — not an official College Board score."
- Uzbek copy uses Latin script and the informal-respectful *siz* form.

## 8. Accessibility floor

Visible focus ring (2px `--primary`, 2px offset) on every interactive element; all controls reachable by keyboard; answer options are radio inputs semantically; timers announce at 5 and 1 minute via `aria-live="polite"`; color is never the only signal (correct/incorrect also use icons and text); touch targets ≥ 40px; no horizontal page scroll at 360px width; reduced-motion respected.
