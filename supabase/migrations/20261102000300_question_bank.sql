-- SAT MASTER · 0003 · Question bank and practice sets
-- Answer keys live in answer_options.is_correct and question_spr_answers.
-- Students have NO privileges on these tables; the server serializes safe payloads.

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete restrict,
  domain_id uuid not null,
  skill_id uuid not null,
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  question_type text not null check (question_type in ('multiple_choice','student_produced_response')),
  stimulus_type text not null default 'text' check (stimulus_type in ('text','passage','image')),
  stem text not null check (char_length(stem) between 1 and 5000),
  passage text check (passage is null or char_length(passage) <= 10000),
  image_path text,                                 -- storage path in the question-images bucket
  image_alt text,
  estimated_seconds smallint not null default 75 check (estimated_seconds between 10 and 900),
  status text not null default 'draft' check (status in ('draft','reviewed','published','archived')),
  source text not null default 'original' check (source in ('original','ai_generated','licensed')),
  source_reference text,
  tags text[] not null default '{}',
  version integer not null default 1,
  created_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Taxonomy consistency: the domain must belong to the subject, the skill to the domain.
  foreign key (domain_id, subject_id) references public.domains (id, subject_id) on delete restrict,
  foreign key (skill_id, domain_id) references public.skills (id, domain_id) on delete restrict,
  check (stimulus_type <> 'passage' or passage is not null),
  check (stimulus_type <> 'image' or (image_path is not null and image_alt is not null)),
  check (status not in ('reviewed','published') or reviewed_by is not null)
);
create index questions_status_skill_idx on public.questions (status, skill_id, difficulty);
create index questions_domain_idx on public.questions (domain_id, status);
create index questions_subject_idx on public.questions (subject_id, status);
create index questions_updated_idx on public.questions (updated_at desc);
create index questions_search_idx on public.questions
  using gin (to_tsvector('english', stem || ' ' || coalesce(passage, '')));
create trigger questions_set_updated_at before update on public.questions
  for each row execute function public.set_updated_at();

create table public.answer_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  label text not null check (label in ('A','B','C','D')),
  content text not null check (char_length(content) between 1 and 2000),
  is_correct boolean not null default false,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (question_id, label)
);
create index answer_options_question_idx on public.answer_options (question_id, position);
-- At most one correct option per question (completeness is checked when publishing).
create unique index answer_options_one_correct_idx on public.answer_options (question_id) where is_correct;

create table public.question_spr_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  value text not null check (value ~ '^-?(\d+(\.\d*)?|\.\d+|\d+/\d+)$' and char_length(value) <= 6),
  created_at timestamptz not null default now(),
  unique (question_id, value)
);

create table public.question_explanations (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  locale text not null check (locale in ('en','uz','ru')),
  content text not null check (char_length(content) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, locale)
);
create trigger question_explanations_set_updated_at before update on public.question_explanations
  for each row execute function public.set_updated_at();

-- Publishing guard: a question can only become reviewed/published when complete.
create or replace function public.question_is_complete(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.questions q
    where q.id = p_question_id
      and exists (select 1 from public.question_explanations e where e.question_id = q.id and e.locale = 'en')
      and (
        (q.question_type = 'multiple_choice'
          and (select count(*) from public.answer_options o where o.question_id = q.id) = 4
          and (select count(*) from public.answer_options o where o.question_id = q.id and o.is_correct) = 1)
        or
        (q.question_type = 'student_produced_response'
          and (select count(*) from public.question_spr_answers s where s.question_id = q.id) >= 1
          and not exists (select 1 from public.answer_options o where o.question_id = q.id))
      )
  )
$$;

create or replace function public.questions_guard_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('reviewed','published') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if not public.question_is_complete(new.id) then
      raise exception 'Question % is incomplete: needs an English explanation and a valid answer key', new.id
        using errcode = 'check_violation';
    end if;
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := now();
  end if;
  if new.status = 'archived' and (tg_op = 'INSERT' or old.status is distinct from 'archived') then
    new.archived_at := now();
  end if;
  if tg_op = 'UPDATE' and (new.stem, new.passage, new.difficulty, new.question_type)
       is distinct from (old.stem, old.passage, old.difficulty, old.question_type) then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger questions_guard_status_trg before insert or update on public.questions
  for each row execute function public.questions_guard_status();

create table public.practice_sets (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 160),
  description text not null default '',
  subject_id uuid not null references public.subjects (id) on delete restrict,
  domain_id uuid references public.domains (id) on delete restrict,
  skill_id uuid references public.skills (id) on delete restrict,
  difficulty text check (difficulty in ('easy','medium','hard','mixed')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  position smallint not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index practice_sets_subject_idx on public.practice_sets (subject_id, status, position);
create trigger practice_sets_set_updated_at before update on public.practice_sets
  for each row execute function public.set_updated_at();

create table public.practice_set_questions (
  id uuid primary key default gen_random_uuid(),
  practice_set_id uuid not null references public.practice_sets (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  position smallint not null default 0,
  unique (practice_set_id, question_id)
);
create index practice_set_questions_set_idx on public.practice_set_questions (practice_set_id, position);
