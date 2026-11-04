-- SAT MASTER · 0025 · Class challenges and an opt-in progress leaderboard (2.0 retention)
--
--   * workspace_members.leaderboard_opt_in: a student chooses to show their weekly effort to their
--     groups (off by default; only the server changes it, at the student's request).
--   * class_challenges: a teacher sets a goal for a date range (correct answers, active days or
--     study minutes), for each student or for the group together. Progress is computed from the
--     students' real activity; nothing is stored or invented.
-- Clients may only SELECT; writes go through the server after can() checks. Additive only.

alter table public.workspace_members add column if not exists leaderboard_opt_in boolean not null default false;

create table public.class_challenges (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  group_id uuid not null,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  metric text not null check (metric in ('correct_answers','active_days','study_minutes')),
  mode text not null check (mode in ('individual','group')),
  target integer not null check (target between 1 and 100000),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'active' check (status in ('active','ended')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key (workspace_id, group_id) references public.groups (workspace_id, id) on delete cascade,
  check (ends_on >= starts_on and ends_on - starts_on <= 92),
  check (status = 'active' or ended_at is not null)
);
create index class_challenges_group_idx on public.class_challenges (group_id, ends_on desc);

alter table public.class_challenges enable row level security;
revoke all on public.class_challenges from anon, authenticated;
grant select on public.class_challenges to authenticated;
grant all on public.class_challenges to service_role;

create policy class_challenges_read on public.class_challenges for select to authenticated
  using ((select public.can_teach_group(group_id)) or (select public.is_group_student(group_id)));
