-- SAT MASTER · 0002 · Curriculum: subjects → domains → skills, courses → lessons, progress

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('math','reading_writing')),
  name text not null,
  description text not null default '',
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subjects_set_updated_at before update on public.subjects
  for each row execute function public.set_updated_at();

create table public.domains (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete restrict,
  code text not null unique check (code ~ '^[a-z0-9_]{2,64}$'),
  name text not null,
  description text not null default '',
  weight_percent numeric(5,2) not null default 25 check (weight_percent between 0 and 100),
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, subject_id)                       -- target for composite FKs
);
create index domains_subject_idx on public.domains (subject_id, position);
create trigger domains_set_updated_at before update on public.domains
  for each row execute function public.set_updated_at();

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.domains (id) on delete restrict,
  code text not null unique check (code ~ '^[a-z0-9_]{2,80}$'),
  name text not null,
  description text not null default '',
  learning_objectives text[] not null default '{}',
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, domain_id)
);
create index skills_domain_idx on public.skills (domain_id, position);
create trigger skills_set_updated_at before update on public.skills
  for each row execute function public.set_updated_at();

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 3 and 160),
  description text not null default '',
  level text not null default 'all' check (level in ('all','beginner','intermediate','advanced')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  position smallint not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index courses_subject_idx on public.courses (subject_id, status, position);
create trigger courses_set_updated_at before update on public.courses
  for each row execute function public.set_updated_at();

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  skill_id uuid references public.skills (id) on delete set null,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 3 and 160),
  description text not null default '',
  objectives text[] not null default '{}',
  video_provider text not null default 'none' check (video_provider in ('none','bunny','supabase')),
  duration_seconds integer not null default 0 check (duration_seconds between 0 and 21600),
  position smallint not null default 0,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  is_free_preview boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz,
  unique (course_id, slug),
  check (status <> 'published' or duration_seconds > 0)
);
create index lessons_course_idx on public.lessons (course_id, position);
create index lessons_skill_idx on public.lessons (skill_id) where skill_id is not null;
create trigger lessons_set_updated_at before update on public.lessons
  for each row execute function public.set_updated_at();

-- Paid lesson content kept apart from public lesson metadata. Staff-only via RLS;
-- students receive it through GET /api/lessons/[id] after the entitlement check.
create table public.lesson_contents (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null unique references public.lessons (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 50000),   -- safe rich text with LaTeX
  video_asset_id text check (video_asset_id is null or video_asset_id ~ '^[A-Za-z0-9/_.-]{1,300}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger lesson_contents_set_updated_at before update on public.lesson_contents
  for each row execute function public.set_updated_at();

-- A lesson can be published only with playable media (or body text for text lessons).
create or replace function public.lessons_guard_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content public.lesson_contents%rowtype;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    select * into v_content from public.lesson_contents where lesson_id = new.id;
    if new.video_provider <> 'none' and (v_content.id is null or v_content.video_asset_id is null) then
      raise exception 'Lesson % needs a video asset before publishing', new.id using errcode = 'check_violation';
    end if;
    if new.video_provider = 'none' and (v_content.id is null or char_length(v_content.body) < 50) then
      raise exception 'Text lesson % needs lesson notes before publishing', new.id using errcode = 'check_violation';
    end if;
    new.published_at := now();
  end if;
  if new.status = 'archived' and (tg_op = 'INSERT' or old.status is distinct from 'archived') then
    new.archived_at := now();
  end if;
  return new;
end;
$$;
create trigger lessons_guard_publish_trg before insert or update on public.lessons
  for each row execute function public.lessons_guard_publish();

create table public.lesson_resources (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  kind text not null check (kind in ('link','file')),
  url text check (url is null or url ~ '^https://'),
  storage_path text,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  check ((kind = 'link' and url is not null) or (kind = 'file' and storage_path is not null))
);
create index lesson_resources_lesson_idx on public.lesson_resources (lesson_id, position);

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  last_position_seconds integer not null default 0 check (last_position_seconds >= 0),
  watched_seconds integer not null default 0 check (watched_seconds >= 0),
  last_heartbeat_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);
create index lesson_progress_user_idx on public.lesson_progress (user_id, updated_at desc);
create trigger lesson_progress_set_updated_at before update on public.lesson_progress
  for each row execute function public.set_updated_at();
