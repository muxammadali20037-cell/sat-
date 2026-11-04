-- SAT MASTER · 0024 · Class polls and quick quizzes (PHASE 4-C)
--
-- A teacher asks a question to a group (optionally during a lesson); students pick one option.
--   * Quiz answers stay secret: `correct_index` is NOT readable by browser clients at all
--     (column-level grant); the server reveals it to students only after the quiz is closed.
--   * One answer per student per poll (they may change it while the poll is open — server only).
--   * Clients may only SELECT; a student reads their own answers, the group's staff read all.
-- Additive only: 2 new tables.

create table public.class_polls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  group_id uuid not null,
  session_id uuid,
  kind text not null check (kind in ('poll','quiz')),
  question text not null check (char_length(btrim(question)) between 2 and 500),
  options text[] not null check (cardinality(options) between 2 and 6),
  correct_index smallint,
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, group_id) references public.groups (workspace_id, id) on delete cascade,
  foreign key (workspace_id, session_id) references public.class_sessions (workspace_id, id) on delete set null (session_id),
  check ((kind = 'quiz' and correct_index is not null and correct_index >= 0 and correct_index < cardinality(options))
      or (kind = 'poll' and correct_index is null)),
  check (status = 'open' or closed_at is not null)
);
create index class_polls_group_idx on public.class_polls (group_id, created_at desc);
create index class_polls_session_idx on public.class_polls (session_id) where session_id is not null;

create table public.class_poll_answers (
  workspace_id uuid not null,
  poll_id uuid not null,
  student_id uuid not null,
  choice smallint not null check (choice between 0 and 5),
  answered_at timestamptz not null default now(),
  primary key (poll_id, student_id),
  foreign key (workspace_id, poll_id) references public.class_polls (workspace_id, id) on delete cascade,
  foreign key (workspace_id, student_id) references public.workspace_members (workspace_id, user_id) on delete cascade
);
create index class_poll_answers_student_idx on public.class_poll_answers (student_id);

alter table public.class_polls enable row level security;
alter table public.class_poll_answers enable row level security;
revoke all on public.class_polls, public.class_poll_answers from anon, authenticated;
grant all on public.class_polls, public.class_poll_answers to service_role;
-- Every column except the quiz key.
grant select (id, workspace_id, group_id, session_id, kind, question, options, status, created_by, created_at, closed_at)
  on public.class_polls to authenticated;
grant select on public.class_poll_answers to authenticated;

create policy class_polls_read on public.class_polls for select to authenticated
  using ((select public.can_teach_group(group_id)) or (select public.is_group_student(group_id)));

create policy class_poll_answers_read on public.class_poll_answers for select to authenticated
  using (student_id = (select auth.uid())
         or exists (select 1 from public.class_polls p where p.id = poll_id and (select public.can_teach_group(p.group_id))));
