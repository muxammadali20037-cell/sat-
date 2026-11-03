-- SAT MASTER · 0021 · Resource Hub (2.0-C)
--
-- Curated external learning links per SAT subject/domain/skill. Every row records where it comes
-- from, what we are allowed to do with it and how it must be attributed. SAT MASTER only LINKS to
-- external content (no copies, no embeds, no progress sync), and nothing is shown to students until
-- a content manager publishes it after the server has checked that the link answers.
--
--   * students (authenticated) can SELECT published rows only;
--   * all writes go through the server (service role) after a role check and a link check — no
--     client INSERT/UPDATE/DELETE grants;
--   * every staff change is written to audit_logs by the server with the acting user (a row
--     trigger would see only the service role, so it is not used here).
-- Additive only: one new table, no existing data touched.

create table public.learning_resources (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('sat_master','college_board','khan_academy','desmos','youtube','other')),
  provider_name text not null check (char_length(btrim(provider_name)) between 2 and 80),
  kind text not null check (kind in ('lesson','video','practice','tool','official_info','article')),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text not null default '' check (char_length(description) <= 600),
  url text not null check (url ~ '^https://[^\s/$.?#][^\s]*$' and char_length(url) <= 600),
  language text not null default 'en' check (language in ('en','uz','ru')),
  subject_id uuid references public.subjects (id) on delete restrict,
  domain_id uuid references public.domains (id) on delete restrict,
  skill_id uuid references public.skills (id) on delete restrict,
  -- What we may do with it (e.g. "Link only. Content © College Board.") and the exact credit line.
  usage_terms text not null check (char_length(btrim(usage_terms)) between 3 and 300),
  attribution text not null check (char_length(btrim(attribution)) between 2 and 200),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  link_status integer,                    -- HTTP status seen by the last server check
  link_checked_at timestamptz,
  position integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (url),
  -- Published links must have passed a link check (2xx/3xx).
  check (status <> 'published' or (published_at is not null and link_checked_at is not null and link_status between 200 and 399))
);
create index learning_resources_status_idx on public.learning_resources (status, subject_id, domain_id, position);
create trigger learning_resources_set_updated_at before update on public.learning_resources
  for each row execute function public.set_updated_at();

alter table public.learning_resources enable row level security;
revoke all on public.learning_resources from anon, authenticated;
grant all on public.learning_resources to service_role;
grant select on public.learning_resources to authenticated;
create policy learning_resources_read on public.learning_resources for select to authenticated
  using (status = 'published' or (select public.is_staff()));
