-- SAT MASTER · 0007 · AI tutor and study plans

create table public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active','archived')),
  generated_by text not null default 'rules' check (generated_by in ('rules','rules_ai')),
  target_score smallint check (target_score between 400 and 1600),
  exam_date date,
  daily_minutes smallint not null check (daily_minutes between 10 and 600),
  start_date date not null,
  end_date date not null,
  weekly_objectives text[] not null default '{}',
  rationale text not null default '' check (char_length(rationale) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create unique index study_plans_one_active_idx on public.study_plans (user_id) where status = 'active';
create trigger study_plans_set_updated_at before update on public.study_plans
  for each row execute function public.set_updated_at();

create table public.study_plan_tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.study_plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  scheduled_date date not null,
  task_type text not null check (task_type in ('lesson','practice','review','mock_exam','diagnostic')),
  title text not null check (char_length(title) <= 200),
  description text not null default '',
  subject_id uuid references public.subjects (id) on delete set null,
  domain_id uuid references public.domains (id) on delete set null,
  skill_id uuid references public.skills (id) on delete set null,
  lesson_id uuid references public.lessons (id) on delete set null,
  practice_set_id uuid references public.practice_sets (id) on delete set null,
  mock_exam_id uuid references public.mock_exams (id) on delete set null,
  estimated_minutes smallint not null check (estimated_minutes between 5 and 240),
  status text not null default 'pending' check (status in ('pending','completed','skipped')),
  completed_at timestamptz,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index study_plan_tasks_user_date_idx on public.study_plan_tasks (user_id, scheduled_date);
create index study_plan_tasks_plan_idx on public.study_plan_tasks (plan_id, scheduled_date, position);
create trigger study_plan_tasks_set_updated_at before update on public.study_plan_tasks
  for each row execute function public.set_updated_at();

create table public.ai_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) <= 160),
  context_question_id uuid references public.questions (id) on delete set null,
  context_attempt_id uuid references public.attempts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index ai_sessions_user_idx on public.ai_sessions (user_id, updated_at desc);
create trigger ai_sessions_set_updated_at before update on public.ai_sessions
  for each row execute function public.set_updated_at();

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  mode text not null default 'chat' check (mode in ('chat','explain','hint','generate')),
  content text not null check (char_length(content) <= 20000),
  structured jsonb,                                 -- validated tutor response (assistant only)
  question_id uuid references public.questions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_messages_session_idx on public.ai_messages (session_id, created_at);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  session_id uuid references public.ai_sessions (id) on delete set null,
  endpoint text not null check (endpoint in ('chat','explain','hint','generate_practice','verify_practice','study_plan')),
  provider text not null default 'anthropic',
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_micros bigint not null default 0 check (cost_micros >= 0),     -- USD millionths
  status text not null check (status in ('ok','error','blocked','invalid_output')),
  latency_ms integer not null default 0,
  error_code text,
  created_at timestamptz not null default now()
);
create index ai_usage_user_day_idx on public.ai_usage (user_id, created_at desc);
create index ai_usage_created_idx on public.ai_usage (created_at desc);

create table public.ai_generated_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid references public.ai_sessions (id) on delete set null,
  skill_id uuid references public.skills (id) on delete set null,
  source_question_id uuid references public.questions (id) on delete set null,
  stem text not null check (char_length(stem) <= 5000),
  passage text check (passage is null or char_length(passage) <= 6000),
  options text[] not null check (cardinality(options) = 4),
  correct_index smallint not null check (correct_index between 0 and 3),
  explanation text not null check (char_length(explanation) <= 6000),
  verified boolean not null default false,
  verification_note text,
  selected_index smallint check (selected_index between 0 and 3),
  answered_at timestamptz,
  promoted_question_id uuid references public.questions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_generated_questions_user_idx on public.ai_generated_questions (user_id, created_at desc);
