-- SAT MASTER · 0001 · Foundation: extensions, shared helpers, roles, profiles
-- Conventions: UUID PKs (gen_random_uuid), timestamptz, snake_case, soft delete via deleted_at/archived_at.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared trigger helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.prevent_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Rows in %.% cannot be deleted; archive or record a state change instead', tg_table_schema, tg_table_name
    using errcode = 'P0001';
end;
$$;

create or replace function public.prevent_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Rows in %.% are append-only', tg_table_schema, tg_table_name
    using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('SUPER_ADMIN','ADMIN','CONTENT_EDITOR','TEACHER','STUDENT')),
  name text not null,
  description text not null default '',
  rank smallint not null,             -- higher = more privileged; used for assignment hierarchy
  created_at timestamptz not null default now()
);

insert into public.roles (key, name, description, rank) values
  ('SUPER_ADMIN',    'Super admin',    'Full access including admin role assignment', 100),
  ('ADMIN',          'Admin',          'Operations, students, billing, settings', 80),
  ('CONTENT_EDITOR', 'Content editor', 'Create, edit, review and publish learning content', 60),
  ('TEACHER',        'Teacher',        'Review content and follow student progress', 40),
  ('STUDENT',        'Student',        'Learner', 10);

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '' check (char_length(full_name) <= 120),
  role text not null default 'STUDENT' references public.roles (key) on update cascade,
  locale text not null default 'en' check (locale in ('en','uz','ru')),
  timezone text not null default 'Asia/Tashkent' check (char_length(timezone) <= 64),
  sat_level text check (sat_level in ('new','some_prep','experienced')),
  target_score smallint check (target_score between 400 and 1600 and target_score % 10 = 0),
  exam_date date,
  daily_study_minutes smallint check (daily_study_minutes between 10 and 600),
  preferred_subjects text[] not null default array['math','reading_writing']
    check (preferred_subjects <@ array['math','reading_writing'] and cardinality(preferred_subjects) between 1 and 2),
  onboarding_completed_at timestamptz,
  is_suspended boolean not null default false,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index profiles_role_idx on public.profiles (role);
create index profiles_created_at_idx on public.profiles (created_at desc);
create index profiles_email_lower_idx on public.profiles (lower(email));

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile for every new auth user. Role is always STUDENT on signup;
-- metadata can only influence name and locale.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locale text := coalesce(new.raw_user_meta_data ->> 'locale', 'en');
begin
  if v_locale not in ('en','uz','ru') then
    v_locale := 'en';
  end if;
  insert into public.profiles (id, email, full_name, locale)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120),
    v_locale
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync when the user changes their email in Auth.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so RLS policies can call them without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.deleted_at is null and not p.is_suspended
$$;

create or replace function public.has_any_role(variadic p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.current_app_role()) = any (p_roles), false)
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_any_role('SUPER_ADMIN','ADMIN','CONTENT_EDITOR','TEACHER')
$$;

create or replace function public.is_content_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_any_role('SUPER_ADMIN','ADMIN','CONTENT_EDITOR')
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_any_role('SUPER_ADMIN','ADMIN')
$$;

create or replace function public.can_view_students()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_any_role('SUPER_ADMIN','ADMIN','TEACHER')
$$;
