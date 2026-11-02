-- SAT MASTER · 0005 · Platform: settings, audit log, notifications, bookmarks, rate limits, contact

create table public.platform_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_.]{2,80}$'),
  value jsonb not null,
  description text not null default '',
  is_public boolean not null default false,       -- readable by anyone (e.g. support email)
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger platform_settings_set_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role text,
  action text not null check (char_length(action) between 3 and 80),   -- e.g. question.publish
  entity_type text not null,
  entity_id text,
  summary text not null default '',
  before_data jsonb,
  after_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create trigger audit_logs_no_update before update on public.audit_logs
  for each row execute function public.prevent_update();
create trigger audit_logs_no_delete before delete on public.audit_logs
  for each row execute function public.prevent_delete();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('payment','subscription','study','system','content')),
  title text not null check (char_length(title) <= 160),
  body text not null default '' check (char_length(body) <= 2000),
  link text check (link is null or link ~ '^/'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid references public.questions (id) on delete cascade,
  lesson_id uuid references public.lessons (id) on delete cascade,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  check (num_nonnulls(question_id, lesson_id) = 1),
  unique (user_id, question_id),
  unique (user_id, lesson_id)
);
create index bookmarks_user_idx on public.bookmarks (user_id, created_at desc);

-- Fixed-window rate limiter usable from every serverless instance.
create table public.rate_limits (
  bucket_key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket_key, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);

create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits as r (bucket_key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (bucket_key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- Opportunistic cleanup of stale windows (cheap, bounded).
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return query select v_hits <= p_limit,
                      greatest(p_limit - v_hits, 0),
                      v_window + make_interval(secs => p_window_seconds);
end;
$$;

create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  topic text not null check (topic in ('general','billing','partnership','technical')),
  message text not null check (char_length(message) between 10 and 4000),
  user_id uuid references public.profiles (id) on delete set null,
  status text not null default 'new' check (status in ('new','in_progress','closed')),
  created_at timestamptz not null default now()
);
create index contact_requests_created_idx on public.contact_requests (created_at desc);

-- Audit helper callable from SQL functions (actor resolved from the JWT when present).
create or replace function public.write_audit_log(
  p_action text, p_entity_type text, p_entity_id text, p_summary text,
  p_before jsonb default null, p_after jsonb default null, p_actor uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(p_actor, (select auth.uid()));
begin
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, summary, before_data, after_data)
  values (
    v_actor,
    (select p.role from public.profiles p where p.id = v_actor),
    p_action, p_entity_type, p_entity_id, coalesce(p_summary, ''), p_before, p_after
  );
end;
$$;
