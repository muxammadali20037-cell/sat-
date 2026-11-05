-- SAT MASTER · 0028 · "My words": a student's personal vocabulary list
--
-- A student marks a word while reading (practice, review, lessons, guides) and saves it. The
-- translation and explanation come from SAT MASTER's own dictionary in the app (content/vocabulary);
-- a word not in it can carry the student's own translation. Reviews reuse flashcard_reviews with
-- the card key 'mine/<word>'.
-- Clients may only SELECT their own rows; writes go through the server. Additive only: 1 new table.

create table public.vocab_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  word text not null check (word ~ '^[a-z]([a-z-]{0,38}[a-z])?$'),
  display text not null check (char_length(display) between 1 and 60),
  in_dictionary boolean not null default false,
  translation text check (char_length(translation) <= 200),
  context text check (char_length(context) <= 400),
  source text not null default 'manual' check (source in ('practice','review','lesson','guide','manual')),
  source_ref text check (char_length(source_ref) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, word)
);
create index vocab_words_user_idx on public.vocab_words (user_id, created_at desc);

alter table public.vocab_words enable row level security;
revoke all on public.vocab_words from anon, authenticated;
grant select on public.vocab_words to authenticated;
grant all on public.vocab_words to service_role;

create policy vocab_words_read_own on public.vocab_words for select to authenticated
  using (user_id = (select auth.uid()));
