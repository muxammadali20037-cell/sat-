-- SAT MASTER · 0023 · Live lesson joins (PHASE 4-B)
--
-- When a student or teacher receives a token for an in-app live lesson, the server records it here
-- so the teacher can see who joined online while marking attendance. It is a log, not attendance:
-- the teacher still decides. Server-written only; a user reads their own rows, the group's staff
-- read the lesson's rows. Additive only: one new table.

create table public.session_joins (
  workspace_id uuid not null,
  session_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  first_joined_at timestamptz not null default now(),
  last_joined_at timestamptz not null default now(),
  join_count integer not null default 1 check (join_count between 1 and 10000),
  primary key (session_id, user_id),
  foreign key (workspace_id, session_id) references public.class_sessions (workspace_id, id) on delete cascade
);
create index session_joins_user_idx on public.session_joins (user_id);

alter table public.session_joins enable row level security;
revoke all on public.session_joins from anon, authenticated;
grant select on public.session_joins to authenticated;
grant all on public.session_joins to service_role;

create policy session_joins_read on public.session_joins for select to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from public.class_sessions s where s.id = session_id and (select public.can_teach_group(s.group_id))));
