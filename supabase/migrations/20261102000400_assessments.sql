-- SAT MASTER · 0004 · Assessments: diagnostics, mock exams, attempts and answers

create table public.diagnostic_tests (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  description text not null default '',
  subject_scope text not null check (subject_scope in ('math','reading_writing','both')),
  questions_per_domain smallint not null default 3 check (questions_per_domain between 1 and 10),
  duration_seconds integer not null check (duration_seconds between 300 and 10800),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger diagnostic_tests_set_updated_at before update on public.diagnostic_tests
  for each row execute function public.set_updated_at();

create table public.mock_exams (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 3 and 160),
  description text not null default '',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  is_adaptive boolean not null default true,
  routing_threshold numeric(4,3) not null default 0.600 check (routing_threshold > 0 and routing_threshold < 1),
  break_seconds integer not null default 600 check (break_seconds between 0 and 1800),
  is_full_length boolean not null default true,  -- false for shortened demo/practice exams
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger mock_exams_set_updated_at before update on public.mock_exams
  for each row execute function public.set_updated_at();

create table public.mock_exam_modules (
  id uuid primary key default gen_random_uuid(),
  mock_exam_id uuid not null references public.mock_exams (id) on delete cascade,
  section text not null check (section in ('reading_writing','math')),
  module_number smallint not null check (module_number in (1,2)),
  variant text not null default 'standard' check (variant in ('standard','easier','harder')),
  duration_seconds integer not null check (duration_seconds between 60 and 7200),
  created_at timestamptz not null default now(),
  unique (mock_exam_id, section, module_number, variant),
  check (module_number = 2 or variant = 'standard')
);
create index mock_exam_modules_exam_idx on public.mock_exam_modules (mock_exam_id);

create table public.mock_exam_questions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.mock_exam_modules (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  position smallint not null check (position >= 1),
  unique (module_id, position),
  unique (module_id, question_id)
);

-- ---------------------------------------------------------------------------
-- Attempts (practice, diagnostic, mock exam). Written only by the server.
-- ---------------------------------------------------------------------------
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('practice','diagnostic','mock_exam')),
  status text not null default 'in_progress' check (status in ('in_progress','completed','expired','abandoned')),
  practice_mode text check (practice_mode in ('custom','set','retry','bookmarks')),
  practice_set_id uuid references public.practice_sets (id) on delete set null,
  diagnostic_test_id uuid references public.diagnostic_tests (id) on delete restrict,
  mock_exam_id uuid references public.mock_exams (id) on delete restrict,
  source_attempt_id uuid references public.attempts (id) on delete set null,
  subject_id uuid references public.subjects (id) on delete set null,
  domain_id uuid references public.domains (id) on delete set null,
  skill_id uuid references public.skills (id) on delete set null,
  difficulty text check (difficulty in ('easy','medium','hard','mixed')),
  started_at timestamptz not null default now(),
  deadline_at timestamptz,
  completed_at timestamptz,
  total_questions integer not null default 0 check (total_questions >= 0),
  answered_count integer not null default 0 check (answered_count >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  time_spent_seconds integer not null default 0 check (time_spent_seconds >= 0),
  -- Mock exam results (SAT MASTER internal estimate — not an official score)
  rw_estimate_low smallint check (rw_estimate_low between 200 and 800),
  rw_estimate_high smallint check (rw_estimate_high between 200 and 800),
  math_estimate_low smallint check (math_estimate_low between 200 and 800),
  math_estimate_high smallint check (math_estimate_high between 200 and 800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'practice' or practice_mode is not null),
  check (kind <> 'diagnostic' or diagnostic_test_id is not null),
  check (kind <> 'mock_exam' or mock_exam_id is not null),
  check (correct_count <= total_questions)
);
create index attempts_user_idx on public.attempts (user_id, created_at desc);
create index attempts_user_kind_idx on public.attempts (user_id, kind, status);
create index attempts_completed_idx on public.attempts (completed_at desc) where status = 'completed';
-- One in-progress attempt per user per mock exam / diagnostic (resume instead of duplicating).
create unique index attempts_one_active_mock_idx on public.attempts (user_id, mock_exam_id)
  where kind = 'mock_exam' and status = 'in_progress';
create unique index attempts_one_active_diag_idx on public.attempts (user_id, diagnostic_test_id)
  where kind = 'diagnostic' and status = 'in_progress';
create trigger attempts_set_updated_at before update on public.attempts
  for each row execute function public.set_updated_at();

create table public.attempt_modules (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  module_id uuid not null references public.mock_exam_modules (id) on delete restrict,
  section text not null check (section in ('reading_writing','math')),
  module_number smallint not null check (module_number in (1,2)),
  variant text not null check (variant in ('standard','easier','harder')),
  status text not null default 'ready' check (status in ('ready','in_progress','submitted','expired')),
  sequence smallint not null check (sequence between 1 and 4),
  duration_seconds integer not null,
  started_at timestamptz,
  deadline_at timestamptz,
  submitted_at timestamptz,
  total_questions integer not null default 0,
  correct_count integer,                          -- NULL until the module is finalized
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, section, module_number),
  unique (attempt_id, sequence),
  check (status = 'ready' or (started_at is not null and deadline_at is not null))
);
create index attempt_modules_attempt_idx on public.attempt_modules (attempt_id, sequence);
create trigger attempt_modules_set_updated_at before update on public.attempt_modules
  for each row execute function public.set_updated_at();

create table public.attempt_questions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  attempt_module_id uuid references public.attempt_modules (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  position smallint not null check (position >= 1),
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id),
  unique nulls not distinct (attempt_id, attempt_module_id, position)
);
create index attempt_questions_attempt_idx on public.attempt_questions (attempt_id, attempt_module_id, position);

create table public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  attempt_question_id uuid not null unique references public.attempt_questions (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  selected_option_id uuid references public.answer_options (id) on delete set null,
  response_text text check (response_text is null or char_length(response_text) <= 12),
  is_correct boolean,                             -- NULL until scored (timed tests: at finalization)
  marked_for_review boolean not null default false,
  time_spent_seconds integer not null default 0 check (time_spent_seconds between 0 and 86400),
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index attempt_answers_attempt_idx on public.attempt_answers (attempt_id);
create index attempt_answers_user_question_idx on public.attempt_answers (user_id, question_id);
create index attempt_answers_user_time_idx on public.attempt_answers (user_id, answered_at desc);
create trigger attempt_answers_set_updated_at before update on public.attempt_answers
  for each row execute function public.set_updated_at();

create table public.diagnostic_results (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  domain_id uuid not null references public.domains (id) on delete restrict,
  correct_count integer not null check (correct_count >= 0),
  total_count integer not null check (total_count > 0),
  accuracy numeric(5,4) not null check (accuracy between 0 and 1),
  level text not null check (level in ('foundation','developing','proficient','advanced')),
  created_at timestamptz not null default now(),
  unique (attempt_id, domain_id),
  check (correct_count <= total_count)
);
create index diagnostic_results_user_idx on public.diagnostic_results (user_id, created_at desc);

-- Daily activity rollup for streaks, study time and dashboards (server-maintained).
create table public.user_daily_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity_date date not null,
  study_seconds integer not null default 0 check (study_seconds >= 0),
  questions_answered integer not null default 0 check (questions_answered >= 0),
  correct_answers integer not null default 0 check (correct_answers >= 0),
  lessons_completed integer not null default 0 check (lessons_completed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, activity_date)
);
create trigger user_daily_activity_set_updated_at before update on public.user_daily_activity
  for each row execute function public.set_updated_at();
