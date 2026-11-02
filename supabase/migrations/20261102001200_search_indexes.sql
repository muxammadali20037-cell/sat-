-- SAT MASTER · 0012 · Substring search indexes for staff screens
-- Admin search uses case-insensitive substring matching (ILIKE '%term%') on question text,
-- student names/emails and lesson titles. Trigram GIN indexes make those scans index-backed.
-- The earlier English full-text expression index could not be targeted through PostgREST.

create extension if not exists pg_trgm with schema extensions;

drop index if exists public.questions_search_idx;

create index questions_stem_trgm_idx on public.questions using gin (stem extensions.gin_trgm_ops);
create index questions_passage_trgm_idx on public.questions using gin (passage extensions.gin_trgm_ops)
  where passage is not null;
create index profiles_full_name_trgm_idx on public.profiles using gin (full_name extensions.gin_trgm_ops);
create index profiles_email_trgm_idx on public.profiles using gin (email extensions.gin_trgm_ops);
create index lessons_title_trgm_idx on public.lessons using gin (title extensions.gin_trgm_ops);
