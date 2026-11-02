-- SAT MASTER · 0013 · Study guides ("O‘zbekcha qo‘llanma")
-- Structured, per-locale explanations of every Digital SAT skill plus general strategy guides.
-- Free for every signed-in student; written and published by content managers.

create table public.guides (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  kind text not null check (kind in ('skill','strategy')),
  skill_id uuid references public.skills (id) on delete set null,
  subject_id uuid references public.subjects (id) on delete set null,
  position smallint not null default 0,
  reading_minutes smallint not null default 8 check (reading_minutes between 1 and 60),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'strategy' or skill_id is null)
);
-- One live guide per skill (archived ones may coexist).
create unique index guides_one_per_skill_idx on public.guides (skill_id) where kind = 'skill' and status <> 'archived';
create index guides_status_idx on public.guides (status, kind, position);
create trigger guides_set_updated_at before update on public.guides
  for each row execute function public.set_updated_at();

create table public.guide_contents (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides (id) on delete cascade,
  locale text not null check (locale in ('uz','en','ru')),
  title text not null check (char_length(title) between 3 and 160),
  summary text not null default '' check (char_length(summary) <= 600),
  -- Validated by the application (src/features/guides/schema.ts); the database checks the shape.
  sections jsonb not null check (jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) between 1 and 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guide_id, locale)
);
create trigger guide_contents_set_updated_at before update on public.guide_contents
  for each row execute function public.set_updated_at();

-- A guide can be published only with content in at least one language.
create or replace function public.guides_guard_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if not exists (select 1 from public.guide_contents c where c.guide_id = new.id) then
      raise exception 'Guide % needs content before publishing', new.slug using errcode = 'check_violation';
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;
  if new.kind = 'skill' and new.skill_id is null and new.status = 'published' then
    raise exception 'Skill guide % needs a skill', new.slug using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger guides_guard_publish_trg before insert or update on public.guides
  for each row execute function public.guides_guard_publish();

-- "Read" marks for the student's own progress.
create table public.guide_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  guide_id uuid not null references public.guides (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, guide_id)
);
create index guide_reads_guide_idx on public.guide_reads (guide_id);

-- Audit trail for staff edits.
create trigger guides_audit after insert or update or delete on public.guides
  for each row execute function public.audit_row_change();
create trigger guide_contents_audit after insert or update or delete on public.guide_contents
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Privileges and RLS (deny by default, then grant exactly what is needed)
-- ---------------------------------------------------------------------------
alter table public.guides enable row level security;
alter table public.guide_contents enable row level security;
alter table public.guide_reads enable row level security;

revoke all on public.guides, public.guide_contents, public.guide_reads from anon, authenticated;
grant all on public.guides, public.guide_contents, public.guide_reads to service_role;

grant select, insert, update, delete on public.guides, public.guide_contents to authenticated;
create policy guides_read on public.guides for select to authenticated
  using (status = 'published' or (select public.is_staff()));
create policy guides_write on public.guides for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));

create policy guide_contents_read on public.guide_contents for select to authenticated
  using ((select public.is_staff()) or exists (
    select 1 from public.guides g where g.id = guide_id and g.status = 'published'));
create policy guide_contents_write on public.guide_contents for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));

grant select, insert, delete on public.guide_reads to authenticated;
create policy guide_reads_select_own on public.guide_reads for select to authenticated
  using (user_id = (select auth.uid()));
create policy guide_reads_insert_own on public.guide_reads for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.guides g where g.id = guide_id and g.status = 'published'));
create policy guide_reads_delete_own on public.guide_reads for delete to authenticated
  using (user_id = (select auth.uid()));

-- The trigger function is internal.
revoke execute on function public.guides_guard_publish() from public, anon, authenticated;
grant execute on function public.guides_guard_publish() to service_role;
