-- SAT MASTER · 0033 · Indexes for the busiest foreign-key lookups
--
-- The Supabase performance advisor lists foreign keys without a covering index. These are the ones
-- on hot paths: grading and reviewing answers, building and taking mock exams, lesson progress,
-- practice sets and subscriptions. Additive only: indexes, no data change. "if not exists" keeps it
-- safe to re-run. Tables are small, so a plain (non-concurrent) build takes well under a second.

create index if not exists attempt_answers_question_idx on public.attempt_answers (question_id);
create index if not exists attempt_questions_attempt_module_idx on public.attempt_questions (attempt_module_id);
create index if not exists attempt_questions_question_idx on public.attempt_questions (question_id);
create index if not exists attempt_modules_module_idx on public.attempt_modules (module_id);
create index if not exists attempts_mock_exam_idx on public.attempts (mock_exam_id);
create index if not exists attempts_diagnostic_test_idx on public.attempts (diagnostic_test_id);
create index if not exists mock_exam_questions_question_idx on public.mock_exam_questions (question_id);
create index if not exists lesson_progress_lesson_idx on public.lesson_progress (lesson_id);
create index if not exists practice_set_questions_question_idx on public.practice_set_questions (question_id);
create index if not exists subscriptions_plan_idx on public.subscriptions (plan_id);
create index if not exists questions_skill_domain_idx on public.questions (skill_id, domain_id);
create index if not exists questions_domain_subject_idx on public.questions (domain_id, subject_id);
create index if not exists bookmarks_question_idx on public.bookmarks (question_id);
