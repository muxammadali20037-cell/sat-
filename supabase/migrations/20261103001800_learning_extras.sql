-- SAT MASTER · 0018 · Learning extras (SAT MASTER 2.0, PHASE 2)
--   1. Practice from the mistake notebook: a new practice mode, 'mistakes'.
--   2. Flashcard progress (spaced repetition). The cards themselves are platform content in the
--      repository (content/flashcards); the database stores only each student's review state,
--      keyed by the card's stable id.
--   3. The student's country (pricing, currency and payment methods by country).
-- Additive: no existing rows are changed. The practice-mode check is replaced by a wider one
-- (every existing value stays valid).

-- 1. Practice mode 'mistakes' ----------------------------------------------------------------
alter table public.attempts drop constraint if exists attempts_practice_mode_check;
alter table public.attempts add constraint attempts_practice_mode_check
  check (practice_mode in ('custom','set','retry','bookmarks','mistakes'));

-- 2. Flashcard reviews -----------------------------------------------------------------------
create table public.flashcard_reviews (
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_key text not null check (card_key ~ '^[a-z0-9-]+/[a-z0-9-]+$' and char_length(card_key) <= 120),
  ease numeric(4,2) not null default 2.5 check (ease between 1.3 and 3.0),
  interval_days integer not null default 0 check (interval_days between 0 and 3650),
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  due_at timestamptz not null,
  last_reviewed_at timestamptz not null,
  last_grade text not null check (last_grade in ('again','hard','good','easy')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_key)
);
create index flashcard_reviews_due_idx on public.flashcard_reviews (user_id, due_at);
create trigger flashcard_reviews_set_updated_at before update on public.flashcard_reviews
  for each row execute function public.set_updated_at();

-- Written only by the server (like attempts); a student reads only their own rows.
alter table public.flashcard_reviews enable row level security;
revoke all on public.flashcard_reviews from anon, authenticated;
grant select on public.flashcard_reviews to authenticated;
grant all on public.flashcard_reviews to service_role;
create policy flashcard_reviews_read_own on public.flashcard_reviews for select to authenticated
  using (user_id = (select auth.uid()));

-- 3. Country ---------------------------------------------------------------------------------
alter table public.profiles add column if not exists country_code text
  check (country_code is null or country_code ~ '^[A-Z]{2}$');
grant update (country_code) on public.profiles to authenticated;
