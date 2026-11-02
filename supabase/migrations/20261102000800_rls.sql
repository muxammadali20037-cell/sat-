-- SAT MASTER · 0008 · Row Level Security and privileges (deny by default)
-- Strategy: revoke every privilege from client roles, then grant exactly what each
-- table needs. RLS policies then restrict rows. The service role (server only) bypasses RLS.

-- ---------------------------------------------------------------------------
-- 1. Deny by default
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Service role keeps full access (Supabase grants this by default; restated for clarity and local tests).
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Helpers used inside policies must be executable by client roles.
grant execute on function public.current_app_role() to anon, authenticated;
grant execute on function public.has_any_role(text[]) to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.is_content_manager() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.can_view_students() to anon, authenticated;
grant execute on function public.question_is_complete(uuid) to authenticated;
grant execute on function public.my_entitlements() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Identity
-- ---------------------------------------------------------------------------
grant select on public.roles to authenticated;
create policy roles_read on public.roles for select to authenticated using (true);

grant select on public.profiles to authenticated;
-- Students may change only these columns. role / is_suspended / email are server-controlled.
grant update (full_name, locale, timezone, sat_level, target_score, exam_date,
              daily_study_minutes, preferred_subjects, onboarding_completed_at)
  on public.profiles to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.can_view_students()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. Curriculum (public catalogue, staff-managed)
-- ---------------------------------------------------------------------------
grant select on public.subjects, public.domains, public.skills to anon, authenticated;
grant insert, update, delete on public.subjects, public.domains, public.skills to authenticated;

create policy subjects_read on public.subjects for select to anon, authenticated using (true);
create policy subjects_write on public.subjects for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));
create policy domains_read on public.domains for select to anon, authenticated using (true);
create policy domains_write on public.domains for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));
create policy skills_read on public.skills for select to anon, authenticated using (true);
create policy skills_write on public.skills for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));

grant select on public.courses, public.lessons to anon, authenticated;
grant insert, update, delete on public.courses, public.lessons to authenticated;

create policy courses_read on public.courses for select to anon, authenticated
  using (status = 'published' or (select public.is_staff()));
create policy courses_write on public.courses for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));

create policy lessons_read on public.lessons for select to anon, authenticated
  using (status = 'published' or (select public.is_staff()));
create policy lessons_write on public.lessons for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));

grant select, insert, update, delete on public.lesson_contents to authenticated;
create policy lesson_contents_staff_read on public.lesson_contents for select to authenticated
  using ((select public.is_staff()));
create policy lesson_contents_write on public.lesson_contents for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));

grant select on public.lesson_resources to authenticated;
grant insert, update, delete on public.lesson_resources to authenticated;
create policy lesson_resources_read on public.lesson_resources for select to authenticated
  using ((select public.is_staff()) or exists (
    select 1 from public.lessons l where l.id = lesson_id and l.status = 'published'));
create policy lesson_resources_write on public.lesson_resources for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));

grant select on public.lesson_progress to authenticated;
create policy lesson_progress_read on public.lesson_progress for select to authenticated
  using (user_id = (select auth.uid()) or (select public.can_view_students()));

-- ---------------------------------------------------------------------------
-- 5. Question bank — staff only. Students never touch these tables directly.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.questions, public.answer_options,
  public.question_spr_answers, public.question_explanations to authenticated;

create policy questions_staff_read on public.questions for select to authenticated
  using ((select public.is_staff()));
create policy questions_cm_insert on public.questions for insert to authenticated
  with check ((select public.is_content_manager()));
create policy questions_cm_update on public.questions for update to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));
create policy questions_cm_delete_drafts on public.questions for delete to authenticated
  using ((select public.is_content_manager()) and status = 'draft');

create policy answer_options_staff_read on public.answer_options for select to authenticated
  using ((select public.is_staff()));
create policy answer_options_cm_write on public.answer_options for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));

create policy spr_answers_staff_read on public.question_spr_answers for select to authenticated
  using ((select public.is_staff()));
create policy spr_answers_cm_write on public.question_spr_answers for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));

create policy explanations_staff_read on public.question_explanations for select to authenticated
  using ((select public.is_staff()));
create policy explanations_cm_write on public.question_explanations for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));

grant select, insert, update, delete on public.practice_sets, public.practice_set_questions to authenticated;
create policy practice_sets_read on public.practice_sets for select to authenticated
  using (status = 'published' or (select public.is_staff()));
create policy practice_sets_write on public.practice_sets for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));
create policy practice_set_questions_staff_read on public.practice_set_questions for select to authenticated
  using ((select public.is_staff()));
create policy practice_set_questions_write on public.practice_set_questions for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));

-- ---------------------------------------------------------------------------
-- 6. Assessments
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.diagnostic_tests, public.mock_exams,
  public.mock_exam_modules, public.mock_exam_questions to authenticated;

create policy diagnostic_tests_read on public.diagnostic_tests for select to authenticated
  using (status = 'published' or (select public.is_staff()));
create policy diagnostic_tests_write on public.diagnostic_tests for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));

create policy mock_exams_read on public.mock_exams for select to authenticated
  using (status = 'published' or (select public.is_staff()));
create policy mock_exams_write on public.mock_exams for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));

create policy mock_exam_modules_read on public.mock_exam_modules for select to authenticated
  using ((select public.is_staff()) or exists (
    select 1 from public.mock_exams e where e.id = mock_exam_id and e.status = 'published'));
create policy mock_exam_modules_write on public.mock_exam_modules for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));

create policy mock_exam_questions_staff_read on public.mock_exam_questions for select to authenticated
  using ((select public.is_staff()));
create policy mock_exam_questions_write on public.mock_exam_questions for all to authenticated
  using ((select public.is_content_manager())) with check ((select public.is_content_manager()));

-- Attempts and results: read own (or staff who follow students). Writes: server only.
grant select on public.attempts, public.attempt_modules, public.attempt_questions,
  public.attempt_answers, public.diagnostic_results, public.user_daily_activity to authenticated;

create policy attempts_read on public.attempts for select to authenticated
  using (user_id = (select auth.uid()) or (select public.can_view_students()));
create policy attempt_modules_read on public.attempt_modules for select to authenticated
  using (exists (select 1 from public.attempts a where a.id = attempt_id
                 and (a.user_id = (select auth.uid()) or (select public.can_view_students()))));
create policy attempt_questions_read on public.attempt_questions for select to authenticated
  using (exists (select 1 from public.attempts a where a.id = attempt_id
                 and (a.user_id = (select auth.uid()) or (select public.can_view_students()))));
create policy attempt_answers_read on public.attempt_answers for select to authenticated
  using (user_id = (select auth.uid()) or (select public.can_view_students()));
create policy diagnostic_results_read on public.diagnostic_results for select to authenticated
  using (user_id = (select auth.uid()) or (select public.can_view_students()));
create policy user_daily_activity_read on public.user_daily_activity for select to authenticated
  using (user_id = (select auth.uid()) or (select public.can_view_students()));

-- ---------------------------------------------------------------------------
-- 7. Billing — read own; admins read all; no client writes at all.
-- ---------------------------------------------------------------------------
grant select on public.plans, public.plan_prices, public.plan_features to anon, authenticated;
grant insert, update on public.plans, public.plan_prices, public.plan_features to authenticated;

create policy plans_read on public.plans for select to anon, authenticated
  using ((is_active and is_public) or (select public.is_admin()));
create policy plans_admin_insert on public.plans for insert to authenticated
  with check ((select public.is_admin()));
create policy plans_admin_update on public.plans for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy plan_prices_read on public.plan_prices for select to anon, authenticated
  using ((select public.is_admin()) or exists (
    select 1 from public.plans p where p.id = plan_id and p.is_active and p.is_public));
create policy plan_prices_admin_insert on public.plan_prices for insert to authenticated
  with check ((select public.is_admin()));
create policy plan_prices_admin_update on public.plan_prices for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy plan_features_read on public.plan_features for select to anon, authenticated
  using ((select public.is_admin()) or exists (
    select 1 from public.plans p where p.id = plan_id and p.is_active and p.is_public));
create policy plan_features_admin_insert on public.plan_features for insert to authenticated
  with check ((select public.is_admin()));
create policy plan_features_admin_update on public.plan_features for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

grant select on public.subscriptions, public.payments, public.payment_events to authenticated;
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy payments_read on public.payments for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy payment_events_admin_read on public.payment_events for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 8. Study plans and AI — read own; writes through the server.
-- ---------------------------------------------------------------------------
grant select on public.study_plans, public.study_plan_tasks, public.ai_sessions,
  public.ai_messages, public.ai_usage, public.ai_generated_questions to authenticated;

create policy study_plans_read on public.study_plans for select to authenticated
  using (user_id = (select auth.uid()) or (select public.can_view_students()));
create policy study_plan_tasks_read on public.study_plan_tasks for select to authenticated
  using (user_id = (select auth.uid()) or (select public.can_view_students()));
create policy ai_sessions_read on public.ai_sessions for select to authenticated
  using (user_id = (select auth.uid()));
create policy ai_messages_read on public.ai_messages for select to authenticated
  using (user_id = (select auth.uid()));
create policy ai_usage_read on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
-- Generated questions contain the answer key: staff only (students get safe payloads from the API).
create policy ai_generated_questions_staff_read on public.ai_generated_questions for select to authenticated
  using ((select public.is_staff()));

-- ---------------------------------------------------------------------------
-- 9. Platform
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.bookmarks to authenticated;
create policy bookmarks_select_own on public.bookmarks for select to authenticated
  using (user_id = (select auth.uid()));
create policy bookmarks_insert_own on public.bookmarks for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy bookmarks_update_own on public.bookmarks for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy bookmarks_delete_own on public.bookmarks for delete to authenticated
  using (user_id = (select auth.uid()));

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on public.audit_logs to authenticated;
create policy audit_logs_admin_read on public.audit_logs for select to authenticated
  using ((select public.is_admin()));

grant select on public.platform_settings to anon, authenticated;
grant update on public.platform_settings to authenticated;
create policy platform_settings_read on public.platform_settings for select to anon, authenticated
  using (is_public or (select public.is_admin()));
create policy platform_settings_admin_update on public.platform_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

grant select on public.contact_requests to authenticated;
create policy contact_requests_admin_read on public.contact_requests for select to authenticated
  using ((select public.is_admin()));

-- rate_limits: no client access at all (RLS enabled, no policies, no grants).
