-- SAT MASTER · 0009 · Application functions: audit triggers, content workflow,
-- role management, analytics. All security definer with an explicit role check.

-- ---------------------------------------------------------------------------
-- Automatic audit trail for staff-managed tables (cannot be bypassed by the app)
-- ---------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id text;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old); v_id := v_before ->> 'id';
  elsif tg_op = 'INSERT' then
    v_after := to_jsonb(new); v_id := v_after ->> 'id';
  else
    v_before := to_jsonb(old); v_after := to_jsonb(new); v_id := v_after ->> 'id';
    if v_before - 'updated_at' = v_after - 'updated_at' then
      return new;                                  -- no meaningful change
    end if;
  end if;

  -- Profiles: only audit privilege-relevant changes (role, suspension, deletion).
  if tg_table_name = 'profiles' then
    if tg_op <> 'UPDATE' or ((v_before ->> 'role') is not distinct from (v_after ->> 'role')
       and (v_before ->> 'is_suspended') is not distinct from (v_after ->> 'is_suspended')
       and (v_before ->> 'deleted_at') is not distinct from (v_after ->> 'deleted_at')) then
      return coalesce(new, old);
    end if;
    v_before := jsonb_build_object('role', v_before -> 'role', 'is_suspended', v_before -> 'is_suspended', 'deleted_at', v_before -> 'deleted_at');
    v_after := jsonb_build_object('role', v_after -> 'role', 'is_suspended', v_after -> 'is_suspended', 'deleted_at', v_after -> 'deleted_at');
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, summary, before_data, after_data)
  values (v_actor, (select p.role from public.profiles p where p.id = v_actor),
          tg_table_name || '.' || lower(tg_op), tg_table_name, v_id,
          case when v_actor is null then 'System change' else '' end, v_before, v_after);
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['subjects','domains','skills','courses','lessons','lesson_contents','lesson_resources',
                           'questions','practice_sets','diagnostic_tests','mock_exams','mock_exam_modules',
                           'plans','plan_prices','plan_features','platform_settings','profiles','subscriptions']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.audit_row_change()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Question editor: atomic create/update of a question with options, answers, explanations
-- ---------------------------------------------------------------------------
create or replace function public.admin_upsert_question(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid := nullif(p_payload ->> 'id', '')::uuid;
  v_type text := p_payload ->> 'question_type';
  v_requested_status text := coalesce(p_payload ->> 'status', 'draft');
  v_current public.questions%rowtype;
  v_opt jsonb;
  v_exp jsonb;
  v_labels text[] := '{}';
  v_locales text[] := '{}';
  v_correct_count integer := 0;
begin
  if not public.is_content_manager() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_requested_status not in ('draft','reviewed','published') then
    raise exception 'Invalid status %', v_requested_status using errcode = 'check_violation';
  end if;

  if v_type = 'multiple_choice' then
    if jsonb_array_length(coalesce(p_payload -> 'options', '[]'::jsonb)) <> 4 then
      raise exception 'Multiple-choice questions need exactly 4 options' using errcode = 'check_violation';
    end if;
    select count(*) into v_correct_count from jsonb_array_elements(p_payload -> 'options') o
     where coalesce((o ->> 'is_correct')::boolean, false);
    if v_correct_count <> 1 then
      raise exception 'Exactly one option must be correct' using errcode = 'check_violation';
    end if;
  elsif v_type = 'student_produced_response' then
    if jsonb_array_length(coalesce(p_payload -> 'spr_answers', '[]'::jsonb)) < 1 then
      raise exception 'Student-produced responses need at least one accepted answer' using errcode = 'check_violation';
    end if;
  else
    raise exception 'Invalid question_type' using errcode = 'check_violation';
  end if;

  if v_id is null then
    insert into public.questions (subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
                                  stem, passage, image_path, image_alt, estimated_seconds, tags, source,
                                  source_reference, status, created_by)
    values ((p_payload ->> 'subject_id')::uuid, (p_payload ->> 'domain_id')::uuid, (p_payload ->> 'skill_id')::uuid,
            p_payload ->> 'difficulty', v_type, coalesce(p_payload ->> 'stimulus_type', 'text'),
            p_payload ->> 'stem', nullif(p_payload ->> 'passage', ''), nullif(p_payload ->> 'image_path', ''),
            nullif(p_payload ->> 'image_alt', ''), coalesce((p_payload ->> 'estimated_seconds')::smallint, 75),
            coalesce(array(select jsonb_array_elements_text(p_payload -> 'tags')), '{}'),
            coalesce(p_payload ->> 'source', 'original'), nullif(p_payload ->> 'source_reference', ''),
            'draft', v_uid)
    returning id into v_id;
  else
    select * into v_current from public.questions where id = v_id for update;
    if not found then
      raise exception 'Question % not found', v_id using errcode = 'no_data_found';
    end if;
    update public.questions set
      subject_id = (p_payload ->> 'subject_id')::uuid,
      domain_id = (p_payload ->> 'domain_id')::uuid,
      skill_id = (p_payload ->> 'skill_id')::uuid,
      difficulty = p_payload ->> 'difficulty',
      question_type = v_type,
      stimulus_type = coalesce(p_payload ->> 'stimulus_type', 'text'),
      stem = p_payload ->> 'stem',
      passage = nullif(p_payload ->> 'passage', ''),
      image_path = nullif(p_payload ->> 'image_path', ''),
      image_alt = nullif(p_payload ->> 'image_alt', ''),
      estimated_seconds = coalesce((p_payload ->> 'estimated_seconds')::smallint, 75),
      tags = coalesce(array(select jsonb_array_elements_text(p_payload -> 'tags')), '{}'),
      source = coalesce(p_payload ->> 'source', source),
      source_reference = nullif(p_payload ->> 'source_reference', '')
    where id = v_id;
  end if;

  -- Options: upsert by label so historical answers keep pointing at the same option rows.
  if v_type = 'multiple_choice' then
    update public.answer_options set is_correct = false where question_id = v_id;
    for v_opt in select * from jsonb_array_elements(p_payload -> 'options') loop
      v_labels := v_labels || (v_opt ->> 'label');
      insert into public.answer_options (question_id, label, content, is_correct, position)
      values (v_id, v_opt ->> 'label', v_opt ->> 'content', coalesce((v_opt ->> 'is_correct')::boolean, false),
              ascii(v_opt ->> 'label') - 64)
      on conflict (question_id, label) do update
        set content = excluded.content, is_correct = excluded.is_correct, position = excluded.position;
    end loop;
    delete from public.answer_options where question_id = v_id and not (label = any (v_labels));
    delete from public.question_spr_answers where question_id = v_id;
  else
    delete from public.answer_options where question_id = v_id;
    delete from public.question_spr_answers where question_id = v_id;
    insert into public.question_spr_answers (question_id, value)
    select distinct v_id, trim(a) from jsonb_array_elements_text(p_payload -> 'spr_answers') a;
  end if;

  -- Explanations: upsert by locale.
  for v_exp in select * from jsonb_array_elements(coalesce(p_payload -> 'explanations', '[]'::jsonb)) loop
    if coalesce(trim(v_exp ->> 'content'), '') <> '' then
      v_locales := v_locales || (v_exp ->> 'locale');
      insert into public.question_explanations (question_id, locale, content)
      values (v_id, v_exp ->> 'locale', v_exp ->> 'content')
      on conflict (question_id, locale) do update set content = excluded.content;
    end if;
  end loop;
  delete from public.question_explanations where question_id = v_id and not (locale = any (v_locales));

  -- Status transition (trigger enforces completeness).
  select * into v_current from public.questions where id = v_id;
  if v_current.status in ('reviewed','published') and not public.question_is_complete(v_id) then
    raise exception 'Edited question is incomplete; it cannot stay %', v_current.status using errcode = 'check_violation';
  end if;
  if v_requested_status <> v_current.status then
    update public.questions
       set status = v_requested_status,
           reviewed_by = case when v_requested_status in ('reviewed','published') then coalesce(reviewed_by, v_uid) else reviewed_by end,
           reviewed_at = case when v_requested_status in ('reviewed','published') then coalesce(reviewed_at, now()) else reviewed_at end
     where id = v_id;
  end if;

  return v_id;
end;
$$;

-- Review workflow: teachers may mark reviewed; content managers may publish/archive/unpublish.
create or replace function public.question_set_status(p_question_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_q public.questions%rowtype;
begin
  select * into v_q from public.questions where id = p_question_id for update;
  if not found then
    raise exception 'Question not found' using errcode = 'no_data_found';
  end if;

  if p_status = 'reviewed' then
    if not public.is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
    if v_q.status not in ('draft','reviewed') then
      raise exception 'Only drafts can be marked reviewed' using errcode = 'check_violation';
    end if;
    update public.questions set status = 'reviewed', reviewed_by = v_uid, reviewed_at = now() where id = p_question_id;
  elsif p_status = 'published' then
    if not public.is_content_manager() then raise exception 'Not allowed' using errcode = '42501'; end if;
    if v_q.status not in ('reviewed','published') then
      raise exception 'Questions must be reviewed before publishing' using errcode = 'check_violation';
    end if;
    update public.questions set status = 'published' where id = p_question_id;
  elsif p_status in ('draft','archived') then
    if not public.is_content_manager() then raise exception 'Not allowed' using errcode = '42501'; end if;
    update public.questions set status = p_status where id = p_question_id;
  else
    raise exception 'Invalid status %', p_status using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Role and account management (hierarchy enforced in the database)
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := public.current_app_role();
  v_actor_rank smallint;
  v_target_rank smallint;
  v_new_rank smallint;
begin
  if v_actor_role is null or v_actor_role not in ('SUPER_ADMIN','ADMIN') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;
  select rank into v_actor_rank from public.roles where key = v_actor_role;
  select r.rank into v_target_rank from public.profiles p join public.roles r on r.key = p.role where p.id = p_user_id;
  select rank into v_new_rank from public.roles where key = p_role;
  if v_new_rank is null then
    raise exception 'Unknown role %', p_role using errcode = 'check_violation';
  end if;
  if v_target_rank is null then
    raise exception 'User not found' using errcode = 'no_data_found';
  end if;
  if v_actor_role <> 'SUPER_ADMIN' and (v_target_rank >= v_actor_rank or v_new_rank >= v_actor_rank) then
    raise exception 'Insufficient privileges for this role change' using errcode = '42501';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

create or replace function public.admin_set_user_suspended(p_user_id uuid, p_suspended boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_rank smallint;
  v_target_rank smallint;
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'You cannot suspend yourself' using errcode = '42501';
  end if;
  select r.rank into v_actor_rank from public.roles r where r.key = public.current_app_role();
  select r.rank into v_target_rank from public.profiles p join public.roles r on r.key = p.role where p.id = p_user_id;
  if v_target_rank is null then
    raise exception 'User not found' using errcode = 'no_data_found';
  end if;
  if v_target_rank >= v_actor_rank then
    raise exception 'Insufficient privileges' using errcode = '42501';
  end if;
  update public.profiles set is_suspended = p_suspended where id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activity and performance
-- ---------------------------------------------------------------------------
create or replace function public.record_daily_activity(
  p_user_id uuid, p_date date, p_study_seconds integer default 0, p_questions integer default 0,
  p_correct integer default 0, p_lessons integer default 0
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_daily_activity as a (user_id, activity_date, study_seconds, questions_answered, correct_answers, lessons_completed)
  values (p_user_id, p_date, greatest(p_study_seconds, 0), greatest(p_questions, 0), greatest(p_correct, 0), greatest(p_lessons, 0))
  on conflict (user_id, activity_date) do update set
    study_seconds = a.study_seconds + excluded.study_seconds,
    questions_answered = a.questions_answered + excluded.questions_answered,
    correct_answers = a.correct_answers + excluded.correct_answers,
    lessons_completed = a.lessons_completed + excluded.lessons_completed;
  update public.profiles set last_active_at = now() where id = p_user_id;
end;
$$;

-- Per-skill performance from scored answers (all attempt kinds).
create or replace function public.skill_performance(p_user_id uuid)
returns table (subject_id uuid, domain_id uuid, skill_id uuid, answered integer, correct integer, last_answered_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select q.subject_id, q.domain_id, q.skill_id,
         count(*)::integer as answered,
         count(*) filter (where aa.is_correct)::integer as correct,
         max(aa.answered_at) as last_answered_at
    from public.attempt_answers aa
    join public.questions q on q.id = aa.question_id
   where aa.user_id = p_user_id and aa.is_correct is not null
   group by q.subject_id, q.domain_id, q.skill_id
$$;

create or replace function public.my_skill_performance()
returns table (subject_id uuid, domain_id uuid, skill_id uuid, answered integer, correct integer, last_answered_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.skill_performance((select auth.uid()))
$$;

-- Current streak in days, counting today if active, otherwise yesterday backwards.
create or replace function public.activity_streak(p_user_id uuid, p_today date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select activity_date from public.user_daily_activity
     where user_id = p_user_id and (questions_answered > 0 or study_seconds >= 60 or lessons_completed > 0)
  ), anchor as (
    select case when exists (select 1 from days where activity_date = p_today) then p_today
                when exists (select 1 from days where activity_date = p_today - 1) then p_today - 1
           end as d
  ), numbered as (
    select activity_date, (select d from anchor) - activity_date as offset_days,
           row_number() over (order by activity_date desc) - 1 as rn
      from days where activity_date <= (select d from anchor)
  )
  select coalesce(count(*) filter (where offset_days = rn), 0)::integer from numbered
$$;

-- ---------------------------------------------------------------------------
-- Admin metrics (all values from live tables)
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_students', (select count(*) from public.profiles where role = 'STUDENT' and deleted_at is null),
    'new_students_7d', (select count(*) from public.profiles where role = 'STUDENT' and created_at >= now() - interval '7 days'),
    'new_students_30d', (select count(*) from public.profiles where role = 'STUDENT' and created_at >= now() - interval '30 days'),
    'active_subscriptions', (select count(*) from public.subscriptions s
                              where s.status = 'active' and public.subscription_effective_status(s.status, s.current_period_end) in ('active','grace')),
    'mrr_minor_uzs', (select coalesce(sum(p.price_minor / p.interval_months), 0) from public.subscriptions s
                       join public.plans p on p.id = s.plan_id
                      where s.status = 'active' and p.currency = 'UZS'
                        and public.subscription_effective_status(s.status, s.current_period_end) in ('active','grace')),
    'payments_count_30d', (select count(*) from public.payments where status = 'succeeded' and paid_at >= now() - interval '30 days'),
    'payments_minor_uzs_30d', (select coalesce(sum(amount_minor), 0) from public.payments
                                where status = 'succeeded' and currency = 'UZS' and paid_at >= now() - interval '30 days'),
    'payments_minor_uzs_all', (select coalesce(sum(amount_minor - coalesce(refund_amount_minor, 0)), 0) from public.payments
                                where status in ('succeeded','refunded') and currency = 'UZS'),
    'failed_payments_30d', (select count(*) from public.payments where status = 'failed' and updated_at >= now() - interval '30 days'),
    'cancellations_30d', (select count(*) from public.subscriptions
                           where (canceled_at >= now() - interval '30 days') or (cancel_at_period_end and updated_at >= now() - interval '30 days')),
    'active_students_7d', (select count(distinct user_id) from public.user_daily_activity where activity_date >= current_date - 6),
    'questions_answered_7d', (select coalesce(sum(questions_answered), 0) from public.user_daily_activity where activity_date >= current_date - 6),
    'lessons_completed_7d', (select coalesce(sum(lessons_completed), 0) from public.user_daily_activity where activity_date >= current_date - 6),
    'mock_exams_completed_30d', (select count(*) from public.attempts where kind = 'mock_exam' and status = 'completed' and completed_at >= now() - interval '30 days'),
    'ai_requests_7d', (select count(*) from public.ai_usage where created_at >= now() - interval '7 days'),
    'ai_cost_micros_30d', (select coalesce(sum(cost_micros), 0) from public.ai_usage where created_at >= now() - interval '30 days'),
    'published_questions', (select count(*) from public.questions where status = 'published'),
    'questions_awaiting_review', (select count(*) from public.questions where status = 'draft'),
    'published_lessons', (select count(*) from public.lessons where status = 'published')
  ) into v_result;
  return v_result;
end;
$$;

-- Execute grants for client-callable functions (each checks authorization internally).
grant execute on function public.admin_upsert_question(jsonb) to authenticated;
grant execute on function public.question_set_status(uuid, text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.admin_set_user_suspended(uuid, boolean) to authenticated;
grant execute on function public.admin_dashboard_metrics() to authenticated;
grant execute on function public.my_skill_performance() to authenticated;
grant execute on all functions in schema public to service_role;
