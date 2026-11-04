-- SAT MASTER · 0022 · Classroom lessons: schedule, attendance and class materials (PHASE 4-A)
--
-- No external services. A lesson can point to the teacher's own meeting link (Zoom, Google Meet,
-- Telegram…); SAT MASTER does not host video in this phase.
--   * every row carries workspace_id; composite FKs keep rows inside one workspace;
--   * clients may only SELECT (RLS: the group's staff, the group's students; a student sees only
--     their own attendance); every write goes through the server after can() checks;
--   * class files live in the private `workspace-files` bucket with NO client storage policies —
--     the server issues short-lived signed upload/download URLs after checking membership.
-- Additive only: 3 new tables and 1 bucket; no existing data touched.

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  group_id uuid not null,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 15 and 360),
  location text not null default '' check (char_length(location) <= 200),
  meeting_url text check (meeting_url is null or (meeting_url ~ '^https://[^\s/$.?#][^\s]*$' and char_length(meeting_url) <= 600)),
  status text not null default 'scheduled' check (status in ('scheduled','cancelled','completed')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, group_id) references public.groups (workspace_id, id) on delete cascade
);
create index class_sessions_group_idx on public.class_sessions (group_id, starts_at);
create trigger class_sessions_set_updated_at before update on public.class_sessions
  for each row execute function public.set_updated_at();

create table public.attendance (
  workspace_id uuid not null,
  session_id uuid not null,
  student_id uuid not null,
  status text not null check (status in ('present','late','absent','excused')),
  note text not null default '' check (char_length(note) <= 300),
  marked_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (session_id, student_id),
  foreign key (workspace_id, session_id) references public.class_sessions (workspace_id, id) on delete cascade,
  foreign key (workspace_id, student_id) references public.workspace_members (workspace_id, user_id) on delete cascade
);
create index attendance_student_idx on public.attendance (student_id);

create table public.class_materials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  group_id uuid not null,
  session_id uuid,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  description text not null default '' check (char_length(description) <= 1000),
  kind text not null check (kind in ('file','link')),
  storage_path text check (storage_path is null or storage_path ~ '^ws/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg|webp)$'),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  mime_type text check (mime_type is null or mime_type in ('application/pdf','image/png','image/jpeg','image/webp')),
  size_bytes integer check (size_bytes is null or size_bytes between 1 and 20971520),
  url text check (url is null or (url ~ '^https://[^\s/$.?#][^\s]*$' and char_length(url) <= 600)),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (workspace_id, group_id) references public.groups (workspace_id, id) on delete cascade,
  foreign key (workspace_id, session_id) references public.class_sessions (workspace_id, id) on delete set null (session_id),
  check ((kind = 'file' and storage_path is not null and mime_type is not null and size_bytes is not null and url is null)
      or (kind = 'link' and url is not null and storage_path is null))
);
create index class_materials_group_idx on public.class_materials (group_id, created_at desc) where archived_at is null;

-- ---------------------------------------------------------------------------
-- Privileges and RLS (deny by default; SELECT only for clients)
-- ---------------------------------------------------------------------------
alter table public.class_sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.class_materials enable row level security;
revoke all on public.class_sessions, public.attendance, public.class_materials from anon, authenticated;
grant select on public.class_sessions, public.attendance, public.class_materials to authenticated;
grant all on public.class_sessions, public.attendance, public.class_materials to service_role;

create policy class_sessions_read on public.class_sessions for select to authenticated
  using ((select public.can_teach_group(group_id)) or (select public.is_group_student(group_id)));

create policy attendance_read on public.attendance for select to authenticated
  using (student_id = (select auth.uid())
         or exists (select 1 from public.class_sessions s where s.id = session_id and (select public.can_teach_group(s.group_id))));

create policy class_materials_read on public.class_materials for select to authenticated
  using ((select public.can_teach_group(group_id))
         or (archived_at is null and (select public.is_group_student(group_id))));

-- ---------------------------------------------------------------------------
-- Private bucket for class files (server-signed URLs only; no client storage policies)
-- ---------------------------------------------------------------------------
do $outer$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema not present — skipping bucket setup';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    ('workspace-files', 'workspace-files', false, 20971520, array['application/pdf','image/png','image/jpeg','image/webp'])
  on conflict (id) do nothing;
end
$outer$;
