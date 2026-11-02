-- =============================================================================
-- SAT MASTER · DEVELOPMENT/DEMO SEED ONLY
-- =============================================================================
-- Original sample content written for SAT MASTER. It is NOT College Board material
-- and does not reproduce or paraphrase any official SAT, Bluebook or Khan Academy item.
--
-- NEVER load this file into production. Production content is authored and reviewed
-- in /admin by content editors.
--
-- Contents (see supabase/seed/README.md):
--   * 1 seed author (auth user without a password, profile role CONTENT_EDITOR)
--   * 64 published questions: 8 per domain (3 easy, 3 medium, 2 hard), 32 Math
--     (10 student-produced response) and 32 Reading and Writing, with English
--     explanations for every question and Uzbek explanations for 24
--   * 2 published courses with 16 published text lessons (2 per domain)
--   * 4 published practice sets
--   * 1 published, shortened adaptive mock exam (slug demo-mock-exam)
--
-- Re-runnable: fixed UUIDs + "on conflict do nothing"; rows that already exist are
-- left untouched. Questions and lessons are inserted as drafts and published only
-- after their answer keys, explanations and notes exist, so the publish guards
-- (questions_guard_status, lessons_guard_publish) verify completeness.
--
-- Load:  scripts/db/test-db.sh reset --seed            (local test cluster)
--        psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/dev_seed.sql
-- Check: psql ... -f scripts/db/check-seed.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Seed author: no password, cannot log in. The profile is created by the
--    on_auth_user_created trigger; then it is promoted to CONTENT_EDITOR.
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000001', 'content-seed@satmaster.invalid',
        '{"full_name":"SAT MASTER sample content (dev)"}')
on conflict do nothing;

update public.profiles
   set role = 'CONTENT_EDITOR'
 where id = '00000000-0000-4000-8000-000000000001'
   and role <> 'CONTENT_EDITOR';


-- -----------------------------------------------------------------------------
-- 2. Questions (inserted as drafts; published in section 3)
-- -----------------------------------------------------------------------------

-- ===== Math · algebra =====

-- Q01 [A1] linear_equations_one_variable · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000001',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'algebra'),
  (select id from public.skills where code = 'linear_equations_one_variable'),
  'easy', 'multiple_choice', 'text',
  $sm$If $\frac{3}{4}x + 2 = 11$, what is the value of $x$?$sm$,
  null,
  60, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000010001', '10000000-0000-4000-8000-000000000001', 'A', $sm$$\frac{27}{4}$$sm$, false, 1),
  ('11000000-0000-4000-8000-000000010002', '10000000-0000-4000-8000-000000000001', 'B', $sm$$12$$sm$, true, 2),
  ('11000000-0000-4000-8000-000000010003', '10000000-0000-4000-8000-000000000001', 'C', $sm$$\frac{52}{3}$$sm$, false, 3),
  ('11000000-0000-4000-8000-000000010004', '10000000-0000-4000-8000-000000000001', 'D', $sm$$9$$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000010001', '10000000-0000-4000-8000-000000000001', 'en', $sm$Subtract 2 from both sides to get $\frac{3}{4}x = 9$, then multiply both sides by $\frac{4}{3}$ to get $x = 12$. Choice A comes from multiplying 9 by $\frac{3}{4}$ instead of $\frac{4}{3}$. Choice C comes from adding 2 to both sides instead of subtracting it. Choice D is the value of $\frac{3}{4}x$, not of $x$.$sm$),
  ('12000000-0000-4000-8000-000000010002', '10000000-0000-4000-8000-000000000001', 'uz', $sm$Avval tenglamaning ikkala tomonidan 2 ni ayiramiz: $\frac{3}{4}x = 9$. Keyin ikkala tomonni $\frac{4}{3}$ ga ko'paytiramiz va $x = 12$ ni olamiz. A javob 9 ni $\frac{4}{3}$ o'rniga $\frac{3}{4}$ ga ko'paytirishdan kelib chiqadi. C javob 2 ni ayirish o'rniga qo'shishdan hosil bo'ladi. D javob $x$ ning emas, $\frac{3}{4}x$ ning qiymati.$sm$)
on conflict do nothing;

-- Q02 [A2] linear_functions · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000002',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'algebra'),
  (select id from public.skills where code = 'linear_functions'),
  'easy', 'multiple_choice', 'text',
  $sm$A taxi company charges a fixed fee for each ride plus an additional amount for each kilometer traveled. The total cost $C$, in dollars, of a ride of $k$ kilometers is given by $C = 1.5k + 4$. What is the best interpretation of the number 4 in this context?$sm$,
  null,
  60, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000020001', '10000000-0000-4000-8000-000000000002', 'A', $sm$The cost, in dollars, for each kilometer traveled$sm$, false, 1),
  ('11000000-0000-4000-8000-000000020002', '10000000-0000-4000-8000-000000000002', 'B', $sm$The fixed fee, in dollars, charged for every ride$sm$, true, 2),
  ('11000000-0000-4000-8000-000000020003', '10000000-0000-4000-8000-000000000002', 'C', $sm$The total cost, in dollars, of a 4-kilometer ride$sm$, false, 3),
  ('11000000-0000-4000-8000-000000020004', '10000000-0000-4000-8000-000000000002', 'D', $sm$The number of kilometers that can be traveled for 1.5 dollars$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000020001', '10000000-0000-4000-8000-000000000002', 'en', $sm$When $k = 0$, the cost is $C = 4$, so 4 is the amount charged before any distance is traveled: the fixed fee for every ride. Choice A describes 1.5, the coefficient of $k$. Choice C is incorrect because a 4-kilometer ride costs $1.5(4) + 4 = 10$ dollars. Choice D misreads the equation; nothing in it describes distance per 1.5 dollars.$sm$),
  ('12000000-0000-4000-8000-000000020002', '10000000-0000-4000-8000-000000000002', 'uz', $sm$Tenglamada $k = 0$ bo'lganda ham $C = 4$ bo'ladi, ya'ni 4 dollar — masofaga bog'liq bo'lmagan, har bir safar uchun olinadigan qat'iy to'lov. A javob $k$ oldidagi koeffitsiyent 1.5 ning ma'nosini bildiradi. C javob noto'g'ri, chunki 4 kilometrlik safar narxi $1.5(4) + 4 = 10$ dollar. D javob tenglamani noto'g'ri o'qishdan kelib chiqadi.$sm$)
on conflict do nothing;

-- Q03 [A3] systems_linear_equations · easy · student_produced_response
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000003',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'algebra'),
  (select id from public.skills where code = 'systems_linear_equations'),
  'easy', 'student_produced_response', 'text',
  $sm$$$3x + y = 5$$
$$x + y = \frac{7}{2}$$

If $(x, y)$ is the solution to the system of equations above, what is the value of $x$?$sm$,
  null,
  75, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.question_spr_answers (id, question_id, value) values
  ('13000000-0000-4000-8000-000000030001', '10000000-0000-4000-8000-000000000003', '3/4'),
  ('13000000-0000-4000-8000-000000030002', '10000000-0000-4000-8000-000000000003', '.75'),
  ('13000000-0000-4000-8000-000000030003', '10000000-0000-4000-8000-000000000003', '0.75')
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000030001', '10000000-0000-4000-8000-000000000003', 'en', $sm$Subtract the second equation from the first: $(3x + y) - (x + y) = 5 - \frac{7}{2}$, which gives $2x = \frac{3}{2}$, so $x = \frac{3}{4}$. Check: then $y = \frac{7}{2} - \frac{3}{4} = \frac{11}{4}$, and $3\left(\frac{3}{4}\right) + \frac{11}{4} = \frac{20}{4} = 5$. Any of 3/4, .75 or 0.75 is accepted.$sm$)
on conflict do nothing;

-- Q04 [A4] linear_equations_two_variables · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000004',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'algebra'),
  (select id from public.skills where code = 'linear_equations_two_variables'),
  'medium', 'multiple_choice', 'text',
  $sm$A line in the $xy$-plane passes through the points $(-2, 5)$ and $(4, -7)$. Which equation defines this line?$sm$,
  null,
  80, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000040001', '10000000-0000-4000-8000-000000000004', 'A', $sm$$y = -2x + 1$$sm$, true, 1),
  ('11000000-0000-4000-8000-000000040002', '10000000-0000-4000-8000-000000000004', 'B', $sm$$y = -2x + 9$$sm$, false, 2),
  ('11000000-0000-4000-8000-000000040003', '10000000-0000-4000-8000-000000000004', 'C', $sm$$y = 2x + 9$$sm$, false, 3),
  ('11000000-0000-4000-8000-000000040004', '10000000-0000-4000-8000-000000000004', 'D', $sm$$y = -\frac{1}{2}x + 4$$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000040001', '10000000-0000-4000-8000-000000000004', 'en', $sm$The slope is $\frac{-7 - 5}{4 - (-2)} = \frac{-12}{6} = -2$. Substituting $(-2, 5)$ into $y = -2x + b$ gives $5 = 4 + b$, so $b = 1$. Choice B does not pass through $(-2, 5)$; it comes from a sign error with the point. Choice C uses the wrong sign for the slope, and choice D uses the reciprocal of the slope; both pass through $(-2, 5)$ but not through $(4, -7)$.$sm$),
  ('12000000-0000-4000-8000-000000040002', '10000000-0000-4000-8000-000000000004', 'uz', $sm$Qiyalik: $\frac{-7 - 5}{4 - (-2)} = \frac{-12}{6} = -2$. $y = -2x + b$ tenglamaga $(-2, 5)$ nuqtani qo'yamiz: $5 = 4 + b$, demak $b = 1$. B javobdagi chiziq $(-2, 5)$ nuqtadan o'tmaydi. C javobda qiyalik ishorasi, D javobda esa qiyalikning o'zi xato olingan: ular $(-2, 5)$ dan o'tadi, lekin $(4, -7)$ dan o'tmaydi.$sm$)
on conflict do nothing;

-- Q05 [A5] linear_inequalities · medium · student_produced_response
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000005',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'algebra'),
  (select id from public.skills where code = 'linear_inequalities'),
  'medium', 'student_produced_response', 'text',
  $sm$A delivery van can carry at most 1,200 kilograms, including the driver. The driver has a mass of 80 kilograms, and each box loaded into the van has a mass of 35 kilograms. What is the greatest number of boxes the van can carry on one trip?$sm$,
  null,
  90, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.question_spr_answers (id, question_id, value) values
  ('13000000-0000-4000-8000-000000050001', '10000000-0000-4000-8000-000000000005', '32')
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000050001', '10000000-0000-4000-8000-000000000005', 'en', $sm$The total mass must satisfy $80 + 35b \le 1200$, where $b$ is the number of boxes. Then $35b \le 1120$, so $b \le 32$. Since 32 boxes give exactly $80 + 1120 = 1200$ kilograms, the greatest number is 32. A common mistake is to ignore the driver and compute $1200 \div 35 \approx 34.3$.$sm$),
  ('12000000-0000-4000-8000-000000050002', '10000000-0000-4000-8000-000000000005', 'uz', $sm$Haydovchi va qutilarning umumiy massasi 1,200 kg dan oshmasligi kerak: $80 + 35b \le 1200$. Bundan $35b \le 1120$ va $b \le 32$. 32 ta quti bilan massa roppa-rosa 1,200 kg bo'ladi, shuning uchun javob 32. Haydovchi massasini hisobga olmasangiz, $1200 \div 35 \approx 34.3$ chiqadi va xato javob berasiz.$sm$)
on conflict do nothing;

-- Q06 [A6] linear_functions · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000006',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'algebra'),
  (select id from public.skills where code = 'linear_functions'),
  'medium', 'multiple_choice', 'text',
  $sm$For the linear function $f$, $f(2) = 11$ and $f(6) = 23$. What is the value of $f(10)$?$sm$,
  null,
  75, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000060001', '10000000-0000-4000-8000-000000000006', 'A', $sm$$30$$sm$, false, 1),
  ('11000000-0000-4000-8000-000000060002', '10000000-0000-4000-8000-000000000006', 'B', $sm$$35$$sm$, true, 2),
  ('11000000-0000-4000-8000-000000060003', '10000000-0000-4000-8000-000000000006', 'C', $sm$$39$$sm$, false, 3),
  ('11000000-0000-4000-8000-000000060004', '10000000-0000-4000-8000-000000000006', 'D', $sm$$46$$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000060001', '10000000-0000-4000-8000-000000000006', 'en', $sm$The slope is $\frac{23 - 11}{6 - 2} = 3$, so $f(x) = 3x + b$ with $11 = 6 + b$, giving $b = 5$. Then $f(10) = 3(10) + 5 = 35$. Choice A omits the $y$-intercept. Choice C treats the change in $x$ (4) as the rate of change. Choice D assumes $f$ is proportional and doubles $f(6)$, which is not valid because $f(0) = 5$, not 0.$sm$)
on conflict do nothing;

-- Q07 [A7] systems_linear_equations · hard · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000007',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'algebra'),
  (select id from public.skills where code = 'systems_linear_equations'),
  'hard', 'multiple_choice', 'text',
  $sm$$$kx - 3y = 7$$
$$4x + 6y = 9$$

In the system of equations above, $k$ is a constant. For what value of $k$ does the system have no solution?$sm$,
  null,
  110, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000070001', '10000000-0000-4000-8000-000000000007', 'A', $sm$$-2$$sm$, true, 1),
  ('11000000-0000-4000-8000-000000070002', '10000000-0000-4000-8000-000000000007', 'B', $sm$$2$$sm$, false, 2),
  ('11000000-0000-4000-8000-000000070003', '10000000-0000-4000-8000-000000000007', 'C', $sm$$-8$$sm$, false, 3),
  ('11000000-0000-4000-8000-000000070004', '10000000-0000-4000-8000-000000000007', 'D', $sm$$8$$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000070001', '10000000-0000-4000-8000-000000000007', 'en', $sm$A linear system has no solution when the lines are parallel and distinct, so the coefficients of $x$ and $y$ must be proportional while the constants are not: $\frac{k}{4} = \frac{-3}{6}$, which gives $k = -2$. With $k = -2$ the first equation becomes $-2x - 3y = 7$, or $2x + 3y = -7$, while the second is $2x + 3y = 4.5$, so the lines are parallel and distinct. Choice B gives slopes of opposite sign, so the lines intersect. Choice C comes from inverting one of the ratios, and choice D combines both errors.$sm$)
on conflict do nothing;

-- Q08 [A8] linear_equations_one_variable · hard · student_produced_response
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000008',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'algebra'),
  (select id from public.skills where code = 'linear_equations_one_variable'),
  'hard', 'student_produced_response', 'text',
  $sm$$$a(3x - 4) + 2x = 14x - 16$$

In the equation above, $a$ is a constant. If the equation has infinitely many solutions, what is the value of $a$?$sm$,
  null,
  100, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.question_spr_answers (id, question_id, value) values
  ('13000000-0000-4000-8000-000000080001', '10000000-0000-4000-8000-000000000008', '4')
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000080001', '10000000-0000-4000-8000-000000000008', 'en', $sm$Expanding the left side gives $(3a + 2)x - 4a$. An equation has infinitely many solutions when both sides are identical, so $3a + 2 = 14$ and $-4a = -16$. Both conditions give $a = 4$, which confirms the answer. A common error is to set $3a = 14$ and forget the $2x$ term.$sm$)
on conflict do nothing;

-- ===== Math · advanced_math =====

-- Q09 [B1] equivalent_expressions · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000009',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'advanced_math'),
  (select id from public.skills where code = 'equivalent_expressions'),
  'easy', 'multiple_choice', 'text',
  $sm$Which expression is equivalent to $(2x + 3)(x - 4)$?$sm$,
  null,
  60, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000090001', '10000000-0000-4000-8000-000000000009', 'A', $sm$$2x^2 - 5x - 12$$sm$, true, 1),
  ('11000000-0000-4000-8000-000000090002', '10000000-0000-4000-8000-000000000009', 'B', $sm$$2x^2 - 11x - 12$$sm$, false, 2),
  ('11000000-0000-4000-8000-000000090003', '10000000-0000-4000-8000-000000000009', 'C', $sm$$2x^2 + 5x - 12$$sm$, false, 3),
  ('11000000-0000-4000-8000-000000090004', '10000000-0000-4000-8000-000000000009', 'D', $sm$$2x^2 - 12$$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000090001', '10000000-0000-4000-8000-000000000009', 'en', $sm$Distribute each term: $2x \cdot x - 2x \cdot 4 + 3 \cdot x - 3 \cdot 4 = 2x^2 - 8x + 3x - 12 = 2x^2 - 5x - 12$. Choice B subtracts $3x$ instead of adding it. Choice C has the wrong sign on the middle term. Choice D multiplies only the first terms and the last terms and drops the middle terms.$sm$),
  ('12000000-0000-4000-8000-000000090002', '10000000-0000-4000-8000-000000000009', 'uz', $sm$Qavslarni ochamiz: $2x \cdot x - 2x \cdot 4 + 3 \cdot x - 3 \cdot 4 = 2x^2 - 8x + 3x - 12 = 2x^2 - 5x - 12$. B javobda $3x$ qo'shilish o'rniga ayirilgan. C javobda o'rta hadning ishorasi xato. D javobda faqat birinchi va oxirgi hadlar ko'paytirilib, o'rta hadlar tashlab yuborilgan.$sm$)
on conflict do nothing;

-- Q10 [B2] nonlinear_functions · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000010',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'advanced_math'),
  (select id from public.skills where code = 'nonlinear_functions'),
  'easy', 'multiple_choice', 'text',
  $sm$The function $f$ is defined by $f(x) = x^2 - 3x + 7$. What is the value of $f(-2)$?$sm$,
  null,
  60, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000100001', '10000000-0000-4000-8000-000000000010', 'A', $sm$$5$$sm$, false, 1),
  ('11000000-0000-4000-8000-000000100002', '10000000-0000-4000-8000-000000000010', 'B', $sm$$9$$sm$, false, 2),
  ('11000000-0000-4000-8000-000000100003', '10000000-0000-4000-8000-000000000010', 'C', $sm$$17$$sm$, true, 3),
  ('11000000-0000-4000-8000-000000100004', '10000000-0000-4000-8000-000000000010', 'D', $sm$$-3$$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000100001', '10000000-0000-4000-8000-000000000010', 'en', $sm$Substitute carefully: $f(-2) = (-2)^2 - 3(-2) + 7 = 4 + 6 + 7 = 17$. Choice A treats $-3(-2)$ as $-6$. Choice B treats $(-2)^2$ as $-4$. Choice D makes both sign errors.$sm$)
on conflict do nothing;

-- Q11 [B3] nonlinear_equations_systems · easy · student_produced_response
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000011',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'advanced_math'),
  (select id from public.skills where code = 'nonlinear_equations_systems'),
  'easy', 'student_produced_response', 'text',
  $sm$What is the positive solution to the equation $(x - 3)^2 = 25$?$sm$,
  null,
  60, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.question_spr_answers (id, question_id, value) values
  ('13000000-0000-4000-8000-000000110001', '10000000-0000-4000-8000-000000000011', '8')
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000110001', '10000000-0000-4000-8000-000000000011', 'en', $sm$Taking square roots gives $x - 3 = 5$ or $x - 3 = -5$, so $x = 8$ or $x = -2$. The positive solution is 8. Remember to consider both the positive and the negative square root.$sm$),
  ('12000000-0000-4000-8000-000000110002', '10000000-0000-4000-8000-000000000011', 'uz', $sm$Ikkala tomondan kvadrat ildiz olamiz: $x - 3 = 5$ yoki $x - 3 = -5$. Bundan $x = 8$ yoki $x = -2$. Musbat yechim — 8. Faqat musbat ildizni emas, manfiy ildizni ham hisobga olish kerak.$sm$)
on conflict do nothing;

-- Q12 [B4] nonlinear_functions · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000012',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'advanced_math'),
  (select id from public.skills where code = 'nonlinear_functions'),
  'medium', 'multiple_choice', 'text',
  $sm$The number of bacteria in a laboratory culture $t$ hours after an experiment begins is modeled by $P(t) = 500(1.08)^t$. Which statement is the best interpretation of 1.08 in this context?$sm$,
  null,
  75, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000120001', '10000000-0000-4000-8000-000000000012', 'A', $sm$The number of bacteria increases by 8% each hour.$sm$, true, 1),
  ('11000000-0000-4000-8000-000000120002', '10000000-0000-4000-8000-000000000012', 'B', $sm$The number of bacteria increases by 1.08 each hour.$sm$, false, 2),
  ('11000000-0000-4000-8000-000000120003', '10000000-0000-4000-8000-000000000012', 'C', $sm$The number of bacteria increases by 108% each hour.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000120004', '10000000-0000-4000-8000-000000000012', 'D', $sm$The initial number of bacteria is 1.08 times 500.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000120001', '10000000-0000-4000-8000-000000000012', 'en', $sm$In a model of the form $a(b)^t$, the base $b$ is the growth factor per unit of time. Each hour the population is multiplied by 1.08, which means it becomes 108% of its previous size, an increase of 8%. Choice B describes linear growth, not exponential growth. Choice C would require a growth factor of 2.08. Choice D is incorrect because the initial number, $P(0)$, is 500.$sm$),
  ('12000000-0000-4000-8000-000000120002', '10000000-0000-4000-8000-000000000012', 'uz', $sm$$a(b)^t$ ko'rinishidagi modelda $b$ asos har bir vaqt birligidagi o'sish ko'paytuvchisidir. Har soatda bakteriyalar soni 1.08 ga ko'payadi, ya'ni oldingi qiymatning 108% iga teng bo'ladi — bu 8% o'sish. B javob chiziqli o'sishni tasvirlaydi. C javob to'g'ri bo'lishi uchun ko'paytuvchi 2.08 bo'lishi kerak edi. D javob noto'g'ri, chunki boshlang'ich son $P(0) = 500$.$sm$)
on conflict do nothing;

-- Q13 [B5] equivalent_expressions · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000013',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'advanced_math'),
  (select id from public.skills where code = 'equivalent_expressions'),
  'medium', 'multiple_choice', 'text',
  $sm$Which expression is equivalent to $\frac{4}{x - 2} + \frac{3}{x + 2}$ for $x > 2$?$sm$,
  null,
  90, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000130001', '10000000-0000-4000-8000-000000000013', 'A', $sm$$\frac{7}{2x}$$sm$, false, 1),
  ('11000000-0000-4000-8000-000000130002', '10000000-0000-4000-8000-000000000013', 'B', $sm$$\frac{7x - 2}{x^2 - 4}$$sm$, false, 2),
  ('11000000-0000-4000-8000-000000130003', '10000000-0000-4000-8000-000000000013', 'C', $sm$$\frac{7x + 2}{x^2 - 4}$$sm$, true, 3),
  ('11000000-0000-4000-8000-000000130004', '10000000-0000-4000-8000-000000000013', 'D', $sm$$\frac{7}{x^2 - 4}$$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000130001', '10000000-0000-4000-8000-000000000013', 'en', $sm$Use the common denominator $(x - 2)(x + 2) = x^2 - 4$: $\frac{4(x + 2) + 3(x - 2)}{x^2 - 4} = \frac{4x + 8 + 3x - 6}{x^2 - 4} = \frac{7x + 2}{x^2 - 4}$. Choice A adds the numerators and adds the denominators, which is not a valid operation. Choice B multiplies each numerator by its own denominator instead of the other one. Choice D adds the numerators without rewriting them over the common denominator.$sm$)
on conflict do nothing;

-- Q14 [B6] nonlinear_equations_systems · medium · student_produced_response
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000014',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'advanced_math'),
  (select id from public.skills where code = 'nonlinear_equations_systems'),
  'medium', 'student_produced_response', 'text',
  $sm$$$y = x^2 - 2x + 1$$
$$y = x + 5$$

If $(a, b)$ is a solution to the system of equations above and $a > 0$, what is the value of $b$?$sm$,
  null,
  100, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.question_spr_answers (id, question_id, value) values
  ('13000000-0000-4000-8000-000000140001', '10000000-0000-4000-8000-000000000014', '9')
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000140001', '10000000-0000-4000-8000-000000000014', 'en', $sm$Set the expressions for $y$ equal: $x^2 - 2x + 1 = x + 5$, so $x^2 - 3x - 4 = 0$ and $(x - 4)(x + 1) = 0$. The solutions are $x = 4$ and $x = -1$; since $a > 0$, $a = 4$. Then $b = 4 + 5 = 9$, which matches $4^2 - 2(4) + 1 = 9$.$sm$)
on conflict do nothing;

-- Q15 [B7] nonlinear_functions · hard · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000015',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'advanced_math'),
  (select id from public.skills where code = 'nonlinear_functions'),
  'hard', 'multiple_choice', 'text',
  $sm$The function $h$ is defined by $h(x) = 2x^2 - 12x + c$, where $c$ is a constant. If the minimum value of $h(x)$ is 5, what is the value of $c$?$sm$,
  null,
  110, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000150001', '10000000-0000-4000-8000-000000000015', 'A', $sm$$5$$sm$, false, 1),
  ('11000000-0000-4000-8000-000000150002', '10000000-0000-4000-8000-000000000015', 'B', $sm$$-13$$sm$, false, 2),
  ('11000000-0000-4000-8000-000000150003', '10000000-0000-4000-8000-000000000015', 'C', $sm$$23$$sm$, true, 3),
  ('11000000-0000-4000-8000-000000150004', '10000000-0000-4000-8000-000000000015', 'D', $sm$$41$$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000150001', '10000000-0000-4000-8000-000000000015', 'en', $sm$The parabola opens upward, so its minimum occurs at the vertex, $x = -\frac{-12}{2(2)} = 3$. Then $h(3) = 2(9) - 36 + c = c - 18$. Setting $c - 18 = 5$ gives $c = 23$. Choice A confuses the minimum value with $c$. Choice B subtracts 18 instead of adding it, and choice D comes from evaluating $-12x$ at $x = 3$ but forgetting the $2x^2$ term.$sm$)
on conflict do nothing;

-- Q16 [B8] nonlinear_equations_systems · hard · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000016',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'advanced_math'),
  (select id from public.skills where code = 'nonlinear_equations_systems'),
  'hard', 'multiple_choice', 'text',
  $sm$$$kx^2 - 4x + 1 = 0$$

In the equation above, $k$ is a positive constant. If the equation has exactly one real solution, what is that solution?$sm$,
  null,
  120, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000160001', '10000000-0000-4000-8000-000000000016', 'A', $sm$$\frac{1}{4}$$sm$, false, 1),
  ('11000000-0000-4000-8000-000000160002', '10000000-0000-4000-8000-000000000016', 'B', $sm$$\frac{1}{2}$$sm$, true, 2),
  ('11000000-0000-4000-8000-000000160003', '10000000-0000-4000-8000-000000000016', 'C', $sm$$2$$sm$, false, 3),
  ('11000000-0000-4000-8000-000000160004', '10000000-0000-4000-8000-000000000016', 'D', $sm$$4$$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000160001', '10000000-0000-4000-8000-000000000016', 'en', $sm$A quadratic has exactly one real solution when its discriminant is 0: $(-4)^2 - 4(k)(1) = 0$, so $k = 4$. The equation is then $4x^2 - 4x + 1 = 0$, or $(2x - 1)^2 = 0$, so $x = \frac{1}{2}$. Choice D is the value of $k$, not the solution. Choice C uses $-\frac{b}{2}$ instead of $-\frac{b}{2a}$, and choice A is $\frac{1}{k}$.$sm$)
on conflict do nothing;

-- ===== Math · problem_solving_data_analysis =====

-- Q17 [C1] ratios_rates_proportions_units · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000017',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'problem_solving_data_analysis'),
  (select id from public.skills where code = 'ratios_rates_proportions_units'),
  'easy', 'multiple_choice', 'text',
  $sm$A bread recipe uses 3 cups of flour for every 2 cups of milk. At this rate, how many cups of flour are needed for 8 cups of milk?$sm$,
  null,
  60, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000170001', '10000000-0000-4000-8000-000000000017', 'A', $sm$$\frac{16}{3}$$sm$, false, 1),
  ('11000000-0000-4000-8000-000000170002', '10000000-0000-4000-8000-000000000017', 'B', $sm$$9$$sm$, false, 2),
  ('11000000-0000-4000-8000-000000170003', '10000000-0000-4000-8000-000000000017', 'C', $sm$$12$$sm$, true, 3),
  ('11000000-0000-4000-8000-000000170004', '10000000-0000-4000-8000-000000000017', 'D', $sm$$24$$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000170001', '10000000-0000-4000-8000-000000000017', 'en', $sm$The ratio of flour to milk is $3 : 2$. Eight cups of milk is 4 times 2 cups, so the flour must also be multiplied by 4: $3 \times 4 = 12$ cups. Choice A inverts the ratio. Choice B keeps the difference between flour and milk (1 cup) constant instead of the ratio. Choice D multiplies 8 by 3 without dividing by 2.$sm$),
  ('12000000-0000-4000-8000-000000170002', '10000000-0000-4000-8000-000000000017', 'uz', $sm$Un va sut nisbati $3 : 2$. Sut miqdori 2 stakandan 8 stakanga, ya'ni 4 marta ortdi, shuning uchun un ham 4 marta ortadi: $3 \times 4 = 12$ stakan. A javobda nisbat teskari olingan. B javob un va sut orasidagi farqni (1 stakan) saqlashga urinishdan kelib chiqadi, lekin proporsiyada nisbat saqlanadi. D javobda 8 shunchaki 3 ga ko'paytirilgan.$sm$)
on conflict do nothing;

-- Q18 [C2] percentages · easy · student_produced_response
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000018',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'problem_solving_data_analysis'),
  (select id from public.skills where code = 'percentages'),
  'easy', 'student_produced_response', 'text',
  $sm$A jacket originally priced at \$80 is on sale for 25% off the original price. What is the sale price of the jacket, in dollars?$sm$,
  null,
  60, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.question_spr_answers (id, question_id, value) values
  ('13000000-0000-4000-8000-000000180001', '10000000-0000-4000-8000-000000000018', '60')
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000180001', '10000000-0000-4000-8000-000000000018', 'en', $sm$A 25% discount removes $0.25 \times 80 = 20$ dollars, so the sale price is $80 - 20 = 60$ dollars. Equivalently, the sale price is 75% of the original price: $0.75 \times 80 = 60$. Enter 60 without a dollar sign.$sm$),
  ('12000000-0000-4000-8000-000000180002', '10000000-0000-4000-8000-000000000018', 'uz', $sm$25% chegirma narxdan $0.25 \times 80 = 20$ dollarni olib tashlaydi, shuning uchun sotuv narxi $80 - 20 = 60$ dollar. Boshqa usul: sotuv narxi asl narxning 75% i, ya'ni $0.75 \times 80 = 60$. Javobni dollar belgisisiz, faqat 60 deb kiriting.$sm$)
on conflict do nothing;

-- Q19 [C3] one_variable_data · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000019',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'problem_solving_data_analysis'),
  (select id from public.skills where code = 'one_variable_data'),
  'easy', 'multiple_choice', 'text',
  $sm$A data set consists of the values 4, 7, 7, 9 and 13. If the value 13 is replaced with 23, which statement about the mean and the median of the data set is true?$sm$,
  null,
  70, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000190001', '10000000-0000-4000-8000-000000000019', 'A', $sm$Both the mean and the median increase.$sm$, false, 1),
  ('11000000-0000-4000-8000-000000190002', '10000000-0000-4000-8000-000000000019', 'B', $sm$The mean increases by 2, and the median does not change.$sm$, true, 2),
  ('11000000-0000-4000-8000-000000190003', '10000000-0000-4000-8000-000000000019', 'C', $sm$The mean does not change, and the median increases.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000190004', '10000000-0000-4000-8000-000000000019', 'D', $sm$The mean increases by 10, and the median does not change.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000190001', '10000000-0000-4000-8000-000000000019', 'en', $sm$The original sum is 40, so the mean is $40 \div 5 = 8$; the new sum is 50, so the new mean is 10, an increase of 2. The median is the middle value of the ordered list, which is 7 in both cases because only the largest value changed. Choice A is wrong because the median stays the same. Choice D gives the change in the sum, not the change in the mean.$sm$)
on conflict do nothing;

-- Q20 [C4] two_variable_data · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000020',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'problem_solving_data_analysis'),
  (select id from public.skills where code = 'two_variable_data'),
  'medium', 'multiple_choice', 'text',
  $sm$A teacher recorded the number of hours $h$ that each of 30 students spent studying for a test and each student's test score. The line of best fit for the data is $s = 4.2h + 61$, where $s$ is the predicted test score. Which statement is the best interpretation of 4.2 in this context?$sm$,
  null,
  75, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000200001', '10000000-0000-4000-8000-000000000020', 'A', $sm$For each additional hour spent studying, the predicted test score increases by 4.2 points.$sm$, true, 1),
  ('11000000-0000-4000-8000-000000200002', '10000000-0000-4000-8000-000000000020', 'B', $sm$The predicted test score for a student who spends 0 hours studying is 4.2 points.$sm$, false, 2),
  ('11000000-0000-4000-8000-000000200003', '10000000-0000-4000-8000-000000000020', 'C', $sm$Every student's test score increased by exactly 4.2 points for each hour spent studying.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000200004', '10000000-0000-4000-8000-000000000020', 'D', $sm$A student must study for 4.2 hours to increase the predicted test score by 1 point.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000200001', '10000000-0000-4000-8000-000000000020', 'en', $sm$In a line of best fit, the slope is the predicted change in the output for each one-unit increase in the input, so 4.2 is the predicted increase in score per additional hour of study. Choice B describes the $s$-intercept, which is 61. Choice C is wrong because a line of best fit describes a trend in predicted values, not the exact result for every student. Choice D inverts the rate.$sm$)
on conflict do nothing;

-- Q21 [C5] probability_conditional · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000021',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'problem_solving_data_analysis'),
  (select id from public.skills where code = 'probability_conditional'),
  'medium', 'multiple_choice', 'text',
  $sm$A survey of 200 students recorded whether each student plays a sport and whether each student plays a musical instrument. The results are shown below.

- Plays a sport and an instrument: 36 students
- Plays a sport but not an instrument: 84 students
- Plays an instrument but not a sport: 24 students
- Plays neither: 56 students

If one of the students who plays an instrument is selected at random, what is the probability that the student also plays a sport?$sm$,
  null,
  90, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000210001', '10000000-0000-4000-8000-000000000021', 'A', $sm$$0.18$$sm$, false, 1),
  ('11000000-0000-4000-8000-000000210002', '10000000-0000-4000-8000-000000000021', 'B', $sm$$0.30$$sm$, false, 2),
  ('11000000-0000-4000-8000-000000210003', '10000000-0000-4000-8000-000000000021', 'C', $sm$$0.40$$sm$, false, 3),
  ('11000000-0000-4000-8000-000000210004', '10000000-0000-4000-8000-000000000021', 'D', $sm$$0.60$$sm$, true, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000210001', '10000000-0000-4000-8000-000000000021', 'en', $sm$The selection is made only from students who play an instrument, so the denominator is $36 + 24 = 60$. Of those, 36 also play a sport, so the probability is $\frac{36}{60} = 0.60$. Choice A uses all 200 students as the denominator. Choice B uses the 120 students who play a sport as the denominator. Choice C is the probability that an instrument player does not play a sport.$sm$),
  ('12000000-0000-4000-8000-000000210002', '10000000-0000-4000-8000-000000000021', 'uz', $sm$Tanlov faqat musiqa asbobi chaladigan o'quvchilar orasidan amalga oshiriladi, shuning uchun maxraj $36 + 24 = 60$. Ulardan 36 nafari sport bilan ham shug'ullanadi, demak ehtimollik $\frac{36}{60} = 0.60$. A javob barcha 200 o'quvchini maxraj qilib olgan. B javob sport bilan shug'ullanadigan 120 o'quvchini maxraj qilib olgan. C javob esa asbob chaladiganlardan sport bilan shug'ullanmaydiganlarning ulushi.$sm$)
on conflict do nothing;

-- Q22 [C6] ratios_rates_proportions_units · medium · student_produced_response
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000022',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'problem_solving_data_analysis'),
  (select id from public.skills where code = 'ratios_rates_proportions_units'),
  'medium', 'student_produced_response', 'text',
  $sm$A train travels at a constant speed of 72 kilometers per hour. How many meters does the train travel in one second? (1 kilometer = 1,000 meters)$sm$,
  null,
  80, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.question_spr_answers (id, question_id, value) values
  ('13000000-0000-4000-8000-000000220001', '10000000-0000-4000-8000-000000000022', '20')
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000220001', '10000000-0000-4000-8000-000000000022', 'en', $sm$Convert both units: $72 \text{ km/h} = \frac{72 \times 1000 \text{ m}}{3600 \text{ s}} = \frac{72000}{3600} = 20$ meters per second. A common error is to convert kilometers to meters but forget that one hour is 3,600 seconds.$sm$)
on conflict do nothing;

-- Q23 [C7] inference_margin_of_error · hard · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000023',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'problem_solving_data_analysis'),
  (select id from public.skills where code = 'inference_margin_of_error'),
  'hard', 'multiple_choice', 'text',
  $sm$A researcher selected 400 households at random from all households in a city and found that 38% of the sampled households own at least one bicycle. The margin of error for this estimate, at a 95% confidence level, is 4.5 percentage points. Which conclusion is best supported by these results?$sm$,
  null,
  100, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000230001', '10000000-0000-4000-8000-000000000023', 'A', $sm$Exactly 38% of all households in the city own at least one bicycle.$sm$, false, 1),
  ('11000000-0000-4000-8000-000000230002', '10000000-0000-4000-8000-000000000023', 'B', $sm$It is plausible that between 33.5% and 42.5% of all households in the city own at least one bicycle.$sm$, true, 2),
  ('11000000-0000-4000-8000-000000230003', '10000000-0000-4000-8000-000000000023', 'C', $sm$Between 33.5% and 42.5% of households in every city in the country own at least one bicycle.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000230004', '10000000-0000-4000-8000-000000000023', 'D', $sm$If the survey were repeated with a random sample of 1,600 households from the city, the margin of error would most likely be greater than 4.5 percentage points.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000230001', '10000000-0000-4000-8000-000000000023', 'en', $sm$A sample percentage with a margin of error gives a plausible range for the population value: $38\% \pm 4.5\%$, or 33.5% to 42.5%, for households in this city. Choice A ignores sampling variability. Choice C extends the result to other cities, which were not sampled. Choice D is backwards: a larger random sample generally produces a smaller margin of error.$sm$)
on conflict do nothing;

-- Q24 [C8] evaluating_statistical_claims · hard · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000024',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'problem_solving_data_analysis'),
  (select id from public.skills where code = 'evaluating_statistical_claims'),
  'hard', 'multiple_choice', 'text',
  $sm$Researchers recruited 300 adult volunteers who wanted to learn a new language. Half of the volunteers were randomly assigned to use a vocabulary app for 20 minutes each day, and the other half did not use the app. After 8 weeks, the group that used the app had a significantly higher average score on a vocabulary test. Which conclusion is best supported by this study?$sm$,
  null,
  110, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000240001', '10000000-0000-4000-8000-000000000024', 'A', $sm$Using the app causes higher vocabulary scores for all language learners in the world.$sm$, false, 1),
  ('11000000-0000-4000-8000-000000240002', '10000000-0000-4000-8000-000000000024', 'B', $sm$Using the app likely caused higher vocabulary scores among people similar to the volunteers in the study.$sm$, true, 2),
  ('11000000-0000-4000-8000-000000240003', '10000000-0000-4000-8000-000000000024', 'C', $sm$Using the app causes higher vocabulary scores for all adults in the country where the study took place.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000240004', '10000000-0000-4000-8000-000000000024', 'D', $sm$No conclusion about cause and effect can be drawn, because the participants were volunteers.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000240001', '10000000-0000-4000-8000-000000000024', 'en', $sm$Because the volunteers were randomly assigned to the two groups, the study supports a cause-and-effect conclusion for the participants. Because the volunteers were not randomly selected from a larger population, the conclusion should be limited to people similar to them. Choices A and C generalize to populations that were not sampled. Choice D confuses random selection, which affects generalization, with random assignment, which supports causal conclusions.$sm$)
on conflict do nothing;

-- ===== Math · geometry_trigonometry =====

-- Q25 [D1] area_volume · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000025',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'geometry_trigonometry'),
  (select id from public.skills where code = 'area_volume'),
  'easy', 'multiple_choice', 'text',
  $sm$A closed rectangular box has a length of 6 centimeters, a width of 4 centimeters and a height of 5 centimeters. What is the volume of the box, in cubic centimeters?$sm$,
  null,
  60, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000250001', '10000000-0000-4000-8000-000000000025', 'A', $sm$$15$$sm$, false, 1),
  ('11000000-0000-4000-8000-000000250002', '10000000-0000-4000-8000-000000000025', 'B', $sm$$74$$sm$, false, 2),
  ('11000000-0000-4000-8000-000000250003', '10000000-0000-4000-8000-000000000025', 'C', $sm$$120$$sm$, true, 3),
  ('11000000-0000-4000-8000-000000250004', '10000000-0000-4000-8000-000000000025', 'D', $sm$$148$$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000250001', '10000000-0000-4000-8000-000000000025', 'en', $sm$The volume of a rectangular box is length times width times height: $6 \times 4 \times 5 = 120$ cubic centimeters. Choice D is the total surface area, $2(24 + 30 + 20) = 148$, and choice B is half of it. Choice A adds the dimensions instead of multiplying them.$sm$),
  ('12000000-0000-4000-8000-000000250002', '10000000-0000-4000-8000-000000000025', 'uz', $sm$To'g'ri burchakli quti hajmi uzunlik, kenglik va balandlik ko'paytmasiga teng: $6 \times 4 \times 5 = 120$ kub santimetr. D javob — qutining to'liq sirt yuzi: $2(24 + 30 + 20) = 148$, B javob esa uning yarmi. A javob o'lchamlarni ko'paytirish o'rniga qo'shishdan kelib chiqadi.$sm$)
on conflict do nothing;

-- Q26 [D2] lines_angles_triangles · easy · student_produced_response
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000026',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'geometry_trigonometry'),
  (select id from public.skills where code = 'lines_angles_triangles'),
  'easy', 'student_produced_response', 'text',
  $sm$Two angles of a triangle measure $47^\circ$ and $68^\circ$. What is the measure, in degrees, of the third angle of the triangle?$sm$,
  null,
  60, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.question_spr_answers (id, question_id, value) values
  ('13000000-0000-4000-8000-000000260001', '10000000-0000-4000-8000-000000000026', '65')
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000260001', '10000000-0000-4000-8000-000000000026', 'en', $sm$The angle measures of a triangle add up to $180^\circ$. The third angle is $180 - 47 - 68 = 65$ degrees.$sm$)
on conflict do nothing;

-- Q27 [D3] right_triangles_trigonometry · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000027',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'geometry_trigonometry'),
  (select id from public.skills where code = 'right_triangles_trigonometry'),
  'easy', 'multiple_choice', 'text',
  $sm$The legs of a right triangle have lengths 9 and 12. What is the length of the hypotenuse?$sm$,
  null,
  60, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000270001', '10000000-0000-4000-8000-000000000027', 'A', $sm$$\sqrt{63}$$sm$, false, 1),
  ('11000000-0000-4000-8000-000000270002', '10000000-0000-4000-8000-000000000027', 'B', $sm$$15$$sm$, true, 2),
  ('11000000-0000-4000-8000-000000270003', '10000000-0000-4000-8000-000000000027', 'C', $sm$$21$$sm$, false, 3),
  ('11000000-0000-4000-8000-000000270004', '10000000-0000-4000-8000-000000000027', 'D', $sm$$225$$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000270001', '10000000-0000-4000-8000-000000000027', 'en', $sm$By the Pythagorean theorem, $c^2 = 9^2 + 12^2 = 81 + 144 = 225$, so $c = 15$. Choice D forgets to take the square root. Choice C adds the leg lengths. Choice A subtracts the squares instead of adding them.$sm$),
  ('12000000-0000-4000-8000-000000270002', '10000000-0000-4000-8000-000000000027', 'uz', $sm$Pifagor teoremasiga ko'ra $c^2 = 9^2 + 12^2 = 81 + 144 = 225$, demak $c = 15$. D javobda kvadrat ildiz olinmagan. C javob katetlarni shunchaki qo'shishdan kelib chiqadi. A javobda kvadratlar qo'shilish o'rniga ayirilgan: $\sqrt{144 - 81} = \sqrt{63}$.$sm$)
on conflict do nothing;

-- Q28 [D4] circles · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000028',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'geometry_trigonometry'),
  (select id from public.skills where code = 'circles'),
  'medium', 'multiple_choice', 'text',
  $sm$A circle in the $xy$-plane has the equation $(x - 2)^2 + (y + 5)^2 = 36$. Which of the following gives the center and the radius of the circle?$sm$,
  null,
  70, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000280001', '10000000-0000-4000-8000-000000000028', 'A', $sm$Center $(2, -5)$, radius 6$sm$, true, 1),
  ('11000000-0000-4000-8000-000000280002', '10000000-0000-4000-8000-000000000028', 'B', $sm$Center $(-2, 5)$, radius 6$sm$, false, 2),
  ('11000000-0000-4000-8000-000000280003', '10000000-0000-4000-8000-000000000028', 'C', $sm$Center $(2, -5)$, radius 36$sm$, false, 3),
  ('11000000-0000-4000-8000-000000280004', '10000000-0000-4000-8000-000000000028', 'D', $sm$Center $(-2, 5)$, radius 36$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000280001', '10000000-0000-4000-8000-000000000028', 'en', $sm$The equation $(x - h)^2 + (y - k)^2 = r^2$ describes a circle with center $(h, k)$ and radius $r$. Here $h = 2$, $k = -5$ (because $y + 5 = y - (-5)$) and $r^2 = 36$, so $r = 6$. Choices B and D reverse the signs of the center coordinates, and choices C and D use $r^2$ as the radius.$sm$)
on conflict do nothing;

-- Q29 [D5] right_triangles_trigonometry · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000029',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'geometry_trigonometry'),
  (select id from public.skills where code = 'right_triangles_trigonometry'),
  'medium', 'multiple_choice', 'text',
  $sm$In right triangle $ABC$, angle $C$ is the right angle and $\sin A = \frac{5}{13}$. What is the value of $\cos B$?$sm$,
  null,
  80, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000290001', '10000000-0000-4000-8000-000000000029', 'A', $sm$$\frac{5}{13}$$sm$, true, 1),
  ('11000000-0000-4000-8000-000000290002', '10000000-0000-4000-8000-000000000029', 'B', $sm$$\frac{12}{13}$$sm$, false, 2),
  ('11000000-0000-4000-8000-000000290003', '10000000-0000-4000-8000-000000000029', 'C', $sm$$\frac{5}{12}$$sm$, false, 3),
  ('11000000-0000-4000-8000-000000290004', '10000000-0000-4000-8000-000000000029', 'D', $sm$$\frac{13}{5}$$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000290001', '10000000-0000-4000-8000-000000000029', 'en', $sm$Angles $A$ and $B$ are complementary. The leg opposite angle $A$ is the same segment as the leg adjacent to angle $B$, so $\cos B = \frac{\text{adjacent to } B}{\text{hypotenuse}} = \sin A = \frac{5}{13}$. Choice B is $\cos A$ (and $\sin B$). Choice C is $\tan A$, and choice D is the reciprocal of $\sin A$.$sm$)
on conflict do nothing;

-- Q30 [D6] area_volume · medium · student_produced_response
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000030',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'geometry_trigonometry'),
  (select id from public.skills where code = 'area_volume'),
  'medium', 'student_produced_response', 'text',
  $sm$A right circular cylinder has a radius of 3 inches and a volume of $72\pi$ cubic inches. What is the height of the cylinder, in inches?$sm$,
  null,
  80, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.question_spr_answers (id, question_id, value) values
  ('13000000-0000-4000-8000-000000300001', '10000000-0000-4000-8000-000000000030', '8')
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000300001', '10000000-0000-4000-8000-000000000030', 'en', $sm$The volume of a cylinder is $V = \pi r^2 h$. Substituting gives $72\pi = \pi (3)^2 h = 9\pi h$, so $h = 8$ inches.$sm$)
on conflict do nothing;

-- Q31 [D7] lines_angles_triangles · hard · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000031',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'geometry_trigonometry'),
  (select id from public.skills where code = 'lines_angles_triangles'),
  'hard', 'multiple_choice', 'text',
  $sm$In triangle $PQR$, point $S$ lies on side $PQ$ and point $T$ lies on side $PR$ so that segment $ST$ is parallel to segment $QR$. If $PS = 4$, $SQ = 6$ and $ST = 5$, what is the length of $QR$?$sm$,
  null,
  100, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000310001', '10000000-0000-4000-8000-000000000031', 'A', $sm$$2$$sm$, false, 1),
  ('11000000-0000-4000-8000-000000310002', '10000000-0000-4000-8000-000000000031', 'B', $sm$$7.5$$sm$, false, 2),
  ('11000000-0000-4000-8000-000000310003', '10000000-0000-4000-8000-000000000031', 'C', $sm$$11$$sm$, false, 3),
  ('11000000-0000-4000-8000-000000310004', '10000000-0000-4000-8000-000000000031', 'D', $sm$$12.5$$sm$, true, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000310001', '10000000-0000-4000-8000-000000000031', 'en', $sm$Because $ST$ is parallel to $QR$, triangle $PST$ is similar to triangle $PQR$. Corresponding sides are proportional: $\frac{ST}{QR} = \frac{PS}{PQ} = \frac{4}{4 + 6} = \frac{4}{10}$, so $QR = 5 \times \frac{10}{4} = 12.5$. Choice B uses $SQ$ instead of $PQ$ in the ratio. Choice A inverts the scale factor, and choice C simply adds 5 and 6.$sm$)
on conflict do nothing;

-- Q32 [D8] circles · hard · student_produced_response
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000032',
  (select id from public.subjects where code = 'math'),
  (select id from public.domains where code = 'geometry_trigonometry'),
  (select id from public.skills where code = 'circles'),
  'hard', 'student_produced_response', 'text',
  $sm$A circle has a radius of 9 units. A sector of this circle has an arc length of $4\pi$ units. The area of the sector is $k\pi$ square units. What is the value of $k$?$sm$,
  null,
  110, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.question_spr_answers (id, question_id, value) values
  ('13000000-0000-4000-8000-000000320001', '10000000-0000-4000-8000-000000000032', '18')
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000320001', '10000000-0000-4000-8000-000000000032', 'en', $sm$The circumference is $2\pi(9) = 18\pi$, so the arc is $\frac{4\pi}{18\pi} = \frac{2}{9}$ of the circle. The sector is the same fraction of the circle's area: $\frac{2}{9} \times 81\pi = 18\pi$, so $k = 18$. Using radians gives the same result: the central angle is $\frac{4\pi}{9}$ and the area is $\frac{1}{2}(9)^2 \cdot \frac{4\pi}{9} = 18\pi$.$sm$)
on conflict do nothing;

-- ===== Reading and Writing · craft_structure =====

-- Q33 [R1] words_in_context · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000033',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'craft_structure'),
  (select id from public.skills where code = 'words_in_context'),
  'easy', 'multiple_choice', 'passage',
  $sm$Which choice completes the text with the most logical and precise word or phrase?$sm$,
  $sm$Marine biologist Ayesha Rahman spent three seasons tracking leatherback turtles along a stretch of tropical coastline. Her first satellite tags fell off within weeks, but she refused to let these setbacks ______ the project. She redesigned the harness that held the tags, and by the final season she was recording months of uninterrupted migration data.$sm$,
  60, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000330001', '10000000-0000-4000-8000-000000000033', 'A', $sm$derail$sm$, true, 1),
  ('11000000-0000-4000-8000-000000330002', '10000000-0000-4000-8000-000000000033', 'B', $sm$inspire$sm$, false, 2),
  ('11000000-0000-4000-8000-000000330003', '10000000-0000-4000-8000-000000000033', 'C', $sm$describe$sm$, false, 3),
  ('11000000-0000-4000-8000-000000330004', '10000000-0000-4000-8000-000000000033', 'D', $sm$accelerate$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000330001', '10000000-0000-4000-8000-000000000033', 'en', $sm$The text says that Rahman kept working despite failed tags, redesigned the harness and eventually collected long records, so she did not let the setbacks "derail," or knock off course, the project. "Inspire" and "accelerate" describe positive effects that she would have no reason to refuse. "Describe" does not make sense, because setbacks cannot describe a project.$sm$),
  ('12000000-0000-4000-8000-000000330002', '10000000-0000-4000-8000-000000000033', 'uz', $sm$Matnda Rahman muvaffaqiyatsizliklarga qaramay ishni davom ettirgani, jihozni qayta loyihalab, oxir-oqibat uzoq muddatli ma'lumotlar to'plagani aytiladi. Demak, u muvaffaqiyatsizliklarning loyihani "izdan chiqarishiga" (derail) yo'l qo'ymagan. "Inspire" (ilhomlantirmoq) va "accelerate" (tezlashtirmoq) ijobiy ta'sirni bildiradi, ularga yo'l qo'ymaslik mantiqsiz. "Describe" (tasvirlamoq) esa jumla mazmuniga umuman mos kelmaydi.$sm$)
on conflict do nothing;

-- Q34 [R2] words_in_context · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000034',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'craft_structure'),
  (select id from public.skills where code = 'words_in_context'),
  'easy', 'multiple_choice', 'passage',
  $sm$Which choice completes the text with the most logical and precise word or phrase?$sm$,
  $sm$In the novel's opening chapters, the village bakery is far more than a place to buy bread. Farmers trade news at its counter, children wait inside for the school bus on cold mornings, and the owner keeps a notebook of messages for neighbors who have no telephone. Through these details, the author presents the bakery as ______ to the daily life of the community.$sm$,
  55, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000340001', '10000000-0000-4000-8000-000000000034', 'A', $sm$central$sm$, true, 1),
  ('11000000-0000-4000-8000-000000340002', '10000000-0000-4000-8000-000000000034', 'B', $sm$hostile$sm$, false, 2),
  ('11000000-0000-4000-8000-000000340003', '10000000-0000-4000-8000-000000000034', 'C', $sm$irrelevant$sm$, false, 3),
  ('11000000-0000-4000-8000-000000340004', '10000000-0000-4000-8000-000000000034', 'D', $sm$temporary$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000340001', '10000000-0000-4000-8000-000000000034', 'en', $sm$Every detail shows the bakery as a place where community life happens: news, shelter for children and messages for neighbors. "Central" captures this importance. "Hostile" contradicts the welcoming details, "irrelevant" is the opposite of what the details show, and nothing in the text suggests the bakery's role is "temporary."$sm$)
on conflict do nothing;

-- Q35 [R3] words_in_context · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000035',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'craft_structure'),
  (select id from public.skills where code = 'words_in_context'),
  'medium', 'multiple_choice', 'passage',
  $sm$As used in the text, what does the word "check" most nearly mean?$sm$,
  $sm$In many river towns, early planners built earthen levees to check the seasonal floods that had repeatedly damaged homes and markets. The embankments did not hold back the water completely, but they slowed its spread long enough for residents to carry their goods to higher ground.$sm$,
  65, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000350001', '10000000-0000-4000-8000-000000000035', 'A', $sm$examine$sm$, false, 1),
  ('11000000-0000-4000-8000-000000350002', '10000000-0000-4000-8000-000000000035', 'B', $sm$restrain$sm$, true, 2),
  ('11000000-0000-4000-8000-000000350003', '10000000-0000-4000-8000-000000000035', 'C', $sm$mark$sm$, false, 3),
  ('11000000-0000-4000-8000-000000350004', '10000000-0000-4000-8000-000000000035', 'D', $sm$pay$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000350001', '10000000-0000-4000-8000-000000000035', 'en', $sm$The text explains that the levees slowed the spread of the water without stopping it completely, so "check" means "restrain" or "hold back." "Examine" is a common meaning of the word, but levees do not inspect floods. "Mark" and "pay" are meanings of "check" in other contexts and do not fit here.$sm$),
  ('12000000-0000-4000-8000-000000350002', '10000000-0000-4000-8000-000000000035', 'uz', $sm$Matnda to'g'onlar suvni butunlay to'xtatmagani, lekin uning tarqalishini sekinlashtirgani aytiladi. Demak, bu yerda "check" so'zi "cheklamoq, to'xtatib turmoq" (restrain) ma'nosida ishlatilgan. "Examine" (tekshirmoq) so'zning eng ko'p uchraydigan ma'nosi, ammo to'g'on toshqinni tekshira olmaydi. "Mark" va "pay" boshqa kontekstlardagi ma'nolar bo'lib, bu yerga mos kelmaydi.$sm$)
on conflict do nothing;

-- Q36 [R4] words_in_context · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000036',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'craft_structure'),
  (select id from public.skills where code = 'words_in_context'),
  'medium', 'multiple_choice', 'passage',
  $sm$Which choice completes the text with the most logical and precise word or phrase?$sm$,
  $sm$When the composer first included recorded street noise in her symphonies (car horns, market calls, the rattle of metal shutters), several critics dismissed the sounds as a gimmick. Over the following decade, however, listeners came to regard these recordings as ______ element of her music: removing them would change the character of every piece.$sm$,
  70, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000360001', '10000000-0000-4000-8000-000000000036', 'A', $sm$an incidental$sm$, false, 1),
  ('11000000-0000-4000-8000-000000360002', '10000000-0000-4000-8000-000000000036', 'B', $sm$an integral$sm$, true, 2),
  ('11000000-0000-4000-8000-000000360003', '10000000-0000-4000-8000-000000000036', 'C', $sm$a fleeting$sm$, false, 3),
  ('11000000-0000-4000-8000-000000360004', '10000000-0000-4000-8000-000000000036', 'D', $sm$an ornamental$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000360001', '10000000-0000-4000-8000-000000000036', 'en', $sm$The colon introduces an explanation: removing the sounds would change every piece, so the sounds are essential, or "integral." "Incidental" and "ornamental" suggest the sounds are minor or decorative, which is the critics' original view that the text says listeners moved away from. "Fleeting" means brief, which does not explain why removing the sounds would change the music.$sm$)
on conflict do nothing;

-- Q37 [R5] words_in_context · hard · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000037',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'craft_structure'),
  (select id from public.skills where code = 'words_in_context'),
  'hard', 'multiple_choice', 'passage',
  $sm$As used in the text, what does the word "qualified" most nearly mean?$sm$,
  $sm$The planning committee's support for the new transit proposal was qualified. Members praised the plan's expanded bus routes, which would serve neighborhoods that currently lack public transportation, but they insisted that the costly rail extension be reconsidered before any construction begins.$sm$,
  80, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000370001', '10000000-0000-4000-8000-000000000037', 'A', $sm$limited$sm$, true, 1),
  ('11000000-0000-4000-8000-000000370002', '10000000-0000-4000-8000-000000000037', 'B', $sm$certified$sm$, false, 2),
  ('11000000-0000-4000-8000-000000370003', '10000000-0000-4000-8000-000000000037', 'C', $sm$skilled$sm$, false, 3),
  ('11000000-0000-4000-8000-000000370004', '10000000-0000-4000-8000-000000000037', 'D', $sm$eligible$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000370001', '10000000-0000-4000-8000-000000000037', 'en', $sm$The committee supported part of the plan (the bus routes) but not another part (the rail extension) without further review, so its support was "limited," or restricted by conditions. "Certified," "skilled" and "eligible" reflect the common meaning of "qualified" as competent or officially approved, which does not describe support that comes with reservations.$sm$)
on conflict do nothing;

-- Q38 [R6] text_structure_purpose · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000038',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'craft_structure'),
  (select id from public.skills where code = 'text_structure_purpose'),
  'easy', 'multiple_choice', 'passage',
  $sm$Which choice best describes the overall structure of the text?$sm$,
  $sm$For decades, many botanists assumed that desert plants survive mainly by storing water in thick stems and leaves. A recent field study of a coastal desert complicated that view. Researchers found that several small shrubs there rely on fine hairs on their leaves to capture droplets from the fog that drifts in from the ocean each morning, a water source the storage explanation had largely overlooked.$sm$,
  60, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000380001', '10000000-0000-4000-8000-000000000038', 'A', $sm$It presents a long-held assumption and then describes a finding that complicates it.$sm$, true, 1),
  ('11000000-0000-4000-8000-000000380002', '10000000-0000-4000-8000-000000000038', 'B', $sm$It describes an experiment and then explains why the experiment failed.$sm$, false, 2),
  ('11000000-0000-4000-8000-000000380003', '10000000-0000-4000-8000-000000000038', 'C', $sm$It compares two deserts and then explains which one receives more rain.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000380004', '10000000-0000-4000-8000-000000000038', 'D', $sm$It introduces a theory and then presents evidence that fully confirms it.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000380001', '10000000-0000-4000-8000-000000000038', 'en', $sm$The first sentence states what botanists "assumed" for decades, and the rest of the text describes a study that "complicated that view." Choice B is wrong because nothing suggests the study failed. Choice C is wrong because only one desert is discussed. Choice D is wrong because the new evidence adds to and complicates the earlier explanation rather than confirming it.$sm$),
  ('12000000-0000-4000-8000-000000380002', '10000000-0000-4000-8000-000000000038', 'uz', $sm$Matn avval botaniklarning o'nlab yillar davomida qabul qilgan taxminini (cho'l o'simliklari suvni poya va barglarda saqlaydi) keltiradi, so'ngra bu qarashni murakkablashtiruvchi yangi tadqiqot natijasini bayon qiladi. B javob noto'g'ri, chunki tadqiqot muvaffaqiyatsiz bo'lgani aytilmagan. C javob noto'g'ri, chunki matnda faqat bitta cho'l haqida gap boradi. D javob ham noto'g'ri: yangi dalil eski nazariyani tasdiqlamaydi, balki uni murakkablashtiradi.$sm$)
on conflict do nothing;

-- Q39 [R7] text_structure_purpose · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000039',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'craft_structure'),
  (select id from public.skills where code = 'text_structure_purpose'),
  'medium', 'multiple_choice', 'passage',
  $sm$Which choice best states the main purpose of the text?$sm$,
  $sm$When architect Tomas Ellery designed a secondary school in a hot, dry region, he chose walls of compressed earth brick made from soil dug on the building site. The thick walls absorb heat during the day and release it slowly at night, keeping classrooms comfortable without air conditioning. Because local workers produced the bricks, the project also cost less than a concrete building would have, and residents later used their new skills to build homes of their own.$sm$,
  70, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000390001', '10000000-0000-4000-8000-000000000039', 'A', $sm$To explain how one building material helped a project respond to both the local climate and the needs of the community$sm$, true, 1),
  ('11000000-0000-4000-8000-000000390002', '10000000-0000-4000-8000-000000000039', 'B', $sm$To argue that air conditioning should not be used in any school buildings$sm$, false, 2),
  ('11000000-0000-4000-8000-000000390003', '10000000-0000-4000-8000-000000000039', 'C', $sm$To trace the history of brickmaking techniques in a dry region$sm$, false, 3),
  ('11000000-0000-4000-8000-000000390004', '10000000-0000-4000-8000-000000000039', 'D', $sm$To criticize an architect for ignoring traditional building methods$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000390001', '10000000-0000-4000-8000-000000000039', 'en', $sm$The text describes one choice, earth brick walls, and explains two kinds of benefits: comfortable classrooms in a hot climate, and lower costs and new skills for local residents. Choice B overstates the text, which makes no argument about all schools. Choice C is wrong because the text does not discuss the history of brickmaking. Choice D is wrong because the text presents the architect's choices positively.$sm$)
on conflict do nothing;

-- Q40 [R8] cross_text_connections · hard · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000040',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'craft_structure'),
  (select id from public.skills where code = 'cross_text_connections'),
  'hard', 'multiple_choice', 'passage',
  $sm$Based on the texts, how would Okafor (Text 2) most likely respond to the reasoning described in Text 1?$sm$,
  $sm$**Text 1**

Many teachers encourage students to take notes by hand rather than on laptops. Their reasoning is that handwriting is slower, which forces students to summarize ideas in their own words instead of copying a lecture word for word. According to this view, the act of summarizing is what helps students remember material later.

**Text 2**

Education researcher Lina Okafor agrees that summarizing aids memory, but she argues that the tool matters less than the habit. In her classroom trials, students who had been taught to paraphrase while typing remembered as much as students who wrote by hand. What made the difference, she found, was whether students had been trained to condense information, not whether they used a pen.$sm$,
  90, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000400001', '10000000-0000-4000-8000-000000000040', 'A', $sm$She would agree that summarizing helps memory but question whether handwriting is necessary to produce that benefit.$sm$, true, 1),
  ('11000000-0000-4000-8000-000000400002', '10000000-0000-4000-8000-000000000040', 'B', $sm$She would reject the idea that summarizing information helps students remember it.$sm$, false, 2),
  ('11000000-0000-4000-8000-000000400003', '10000000-0000-4000-8000-000000000040', 'C', $sm$She would argue that taking notes on a laptop always leads to better memory than handwriting.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000400004', '10000000-0000-4000-8000-000000000040', 'D', $sm$She would claim that the slower speed of handwriting is the most important factor in remembering lectures.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000400001', '10000000-0000-4000-8000-000000000040', 'en', $sm$Text 2 says Okafor "agrees that summarizing aids memory" but found that trained typists remembered as much as students writing by hand, so she would question the claim that handwriting is needed. Choice B contradicts her stated agreement about summarizing. Choice C overstates her finding, which showed equal results, not better results for laptops. Choice D is the opposite of her view that the habit matters more than the tool.$sm$)
on conflict do nothing;

-- ===== Reading and Writing · information_ideas =====

-- Q41 [I1] central_ideas_details · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000041',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'information_ideas'),
  (select id from public.skills where code = 'central_ideas_details'),
  'easy', 'multiple_choice', 'passage',
  $sm$Which choice best states the main idea of the text?$sm$,
  $sm$Community gardens in many cities do more than produce vegetables. In neighborhoods where residents rarely interact, a shared garden gives people a reason to meet regularly, exchange advice and divide tasks such as watering and weeding. Organizers often report that friendships formed in the garden continue long after the harvest, with neighbors helping one another with childcare, repairs and errands.$sm$,
  55, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000410001', '10000000-0000-4000-8000-000000000041', 'A', $sm$Community gardens can strengthen social connections among neighbors.$sm$, true, 1),
  ('11000000-0000-4000-8000-000000410002', '10000000-0000-4000-8000-000000000041', 'B', $sm$Community gardens produce more vegetables than private gardens do.$sm$, false, 2),
  ('11000000-0000-4000-8000-000000410003', '10000000-0000-4000-8000-000000000041', 'C', $sm$Watering and weeding are the most difficult tasks in a garden.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000410004', '10000000-0000-4000-8000-000000000041', 'D', $sm$Most city residents prefer to garden alone rather than with neighbors.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000410001', '10000000-0000-4000-8000-000000000041', 'en', $sm$The first sentence says the gardens "do more than produce vegetables," and the rest of the text describes regular meetings, shared work and lasting friendships, all of which are social connections. Choice B makes a comparison the text never makes. Choice C turns a minor detail into the main idea. Choice D contradicts the text.$sm$),
  ('12000000-0000-4000-8000-000000410002', '10000000-0000-4000-8000-000000000041', 'uz', $sm$Matnning birinchi jumlasi bog'lar "sabzavot yetishtirishdan ko'proq narsa beradi" deydi, qolgan tafsilotlar — muntazam uchrashuvlar, birgalikdagi ish va hosildan keyin ham davom etadigan do'stlik — qo'shnilar o'rtasidagi ijtimoiy aloqalarni ko'rsatadi. B javobdagi taqqoslash matnda yo'q. C javob kichik tafsilotni asosiy g'oyaga aylantiradi. D javob esa matnga zid.$sm$)
on conflict do nothing;

-- Q42 [I2] central_ideas_details · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000042',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'information_ideas'),
  (select id from public.skills where code = 'central_ideas_details'),
  'medium', 'multiple_choice', 'passage',
  $sm$According to the text, why did the engineers use narrower supports in the new bridge?$sm$,
  $sm$When engineers in a mountain town redesigned the main bridge over the river, they replaced its wide stone piers with fewer, narrower steel supports. The change was not mainly about cost. Hydrologists had shown that the old piers trapped branches and other debris during spring floods, causing water to back up and spill into nearby streets. The narrower supports allow floating debris to pass through.$sm$,
  65, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000420001', '10000000-0000-4000-8000-000000000042', 'A', $sm$To lower the cost of building the bridge$sm$, false, 1),
  ('11000000-0000-4000-8000-000000420002', '10000000-0000-4000-8000-000000000042', 'B', $sm$To reduce flooding caused by debris collecting around the supports$sm$, true, 2),
  ('11000000-0000-4000-8000-000000420003', '10000000-0000-4000-8000-000000000042', 'C', $sm$To make the bridge more attractive to visitors$sm$, false, 3),
  ('11000000-0000-4000-8000-000000420004', '10000000-0000-4000-8000-000000000042', 'D', $sm$To allow larger boats to pass beneath the bridge$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000420001', '10000000-0000-4000-8000-000000000042', 'en', $sm$The text explains that the old piers trapped debris, which made water back up into the streets, and that the narrower supports let debris pass. Choice A is directly ruled out: "The change was not mainly about cost." Choices C and D mention reasons that the text never gives.$sm$)
on conflict do nothing;

-- Q43 [I3] command_of_evidence_textual · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000043',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'information_ideas'),
  (select id from public.skills where code = 'command_of_evidence_textual'),
  'easy', 'multiple_choice', 'passage',
  $sm$Which finding, if true, would most directly support the biologist's hypothesis?$sm$,
  $sm$A biologist studying a common songbird species has noticed that birds living in cities tend to sing at a higher pitch than birds of the same species living in the countryside. She hypothesizes that the difference exists because low-pitched songs are harder to hear over the low-frequency rumble of city traffic.$sm$,
  70, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000430001', '10000000-0000-4000-8000-000000000043', 'A', $sm$City birds of the species sing at a higher pitch on weekdays, when traffic is heavy, than on holidays, when streets are quiet.$sm$, true, 1),
  ('11000000-0000-4000-8000-000000430002', '10000000-0000-4000-8000-000000000043', 'B', $sm$Countryside birds of the species build their nests earlier in the spring than city birds do.$sm$, false, 2),
  ('11000000-0000-4000-8000-000000430003', '10000000-0000-4000-8000-000000000043', 'C', $sm$City birds of the species are slightly larger, on average, than countryside birds of the species.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000430004', '10000000-0000-4000-8000-000000000043', 'D', $sm$Both city and countryside birds of the species sing most often in the early morning.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000430001', '10000000-0000-4000-8000-000000000043', 'en', $sm$The hypothesis links higher pitch to traffic noise. If the same city birds raise their pitch when traffic is heavy and lower it when traffic is light, that pattern directly connects pitch to traffic noise. Choices B and C describe differences unrelated to song pitch or noise. Choice D describes a similarity between the groups, which cannot explain a difference.$sm$)
on conflict do nothing;

-- Q44 [I4] command_of_evidence_textual · hard · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000044',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'information_ideas'),
  (select id from public.skills where code = 'command_of_evidence_textual'),
  'hard', 'multiple_choice', 'passage',
  $sm$Which quotation from the story most effectively illustrates this claim?$sm$,
  $sm$"The Keeper's Ledger" is a short story about Mira, who tends a lighthouse on a remote stretch of coast. Throughout the story, Mira is portrayed as someone who notices small changes in her surroundings that other people overlook.$sm$,
  85, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000440001', '10000000-0000-4000-8000-000000000044', 'A', $sm$"Mira climbed the tower's ninety-two steps every evening, just as her father had done before her."$sm$, false, 1),
  ('11000000-0000-4000-8000-000000440002', '10000000-0000-4000-8000-000000000044', 'B', $sm$"Each morning Mira recorded the color of the sea, and she was the first to see that the gray band along the horizon had widened by a finger's width since spring."$sm$, true, 2),
  ('11000000-0000-4000-8000-000000440003', '10000000-0000-4000-8000-000000000044', 'C', $sm$"When the great storm came, the whole village gathered on the hill to watch the waves break over the harbor wall."$sm$, false, 3),
  ('11000000-0000-4000-8000-000000440004', '10000000-0000-4000-8000-000000000044', 'D', $sm$"Mira preferred the winter months, when fewer ships passed and the nights stretched long and quiet."$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000440001', '10000000-0000-4000-8000-000000000044', 'en', $sm$The claim has two parts: Mira notices small changes, and others overlook them. Choice B shows both: she sees a tiny change (a finger's width) and is "the first" to see it. Choice A shows routine, not observation. Choice C describes a dramatic event that everyone noticed. Choice D describes a preference, not an observation.$sm$)
on conflict do nothing;

-- Q45 [I5] command_of_evidence_quantitative · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000045',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'information_ideas'),
  (select id from public.skills where code = 'command_of_evidence_quantitative'),
  'medium', 'multiple_choice', 'passage',
  $sm$Which choice most effectively uses data from the results to support the student's conclusion?$sm$,
  $sm$A student investigated how different mulches affect soil moisture. She measured the average soil moisture, as a percentage of water by volume, in garden beds one week after watering. Her results were as follows:

- No mulch: 14%
- Straw mulch: 22%
- Wood-chip mulch: 25%
- Gravel mulch: 17%

The student concludes that the organic mulches in her study, straw and wood chips, kept the soil wetter than the other conditions did.$sm$,
  80, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000450001', '10000000-0000-4000-8000-000000000045', 'A', $sm$The beds with straw mulch (22%) and wood-chip mulch (25%) both had higher soil moisture than the beds with gravel mulch (17%) or no mulch (14%).$sm$, true, 1),
  ('11000000-0000-4000-8000-000000450002', '10000000-0000-4000-8000-000000000045', 'B', $sm$The beds with gravel mulch had higher soil moisture (17%) than the beds with no mulch (14%).$sm$, false, 2),
  ('11000000-0000-4000-8000-000000450003', '10000000-0000-4000-8000-000000000045', 'C', $sm$The beds with wood-chip mulch had higher soil moisture (25%) than the beds with straw mulch (22%).$sm$, false, 3),
  ('11000000-0000-4000-8000-000000450004', '10000000-0000-4000-8000-000000000045', 'D', $sm$The beds with no mulch had the lowest soil moisture of all the conditions, at 14%.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000450001', '10000000-0000-4000-8000-000000000045', 'en', $sm$The conclusion compares both organic mulches with both other conditions, so the supporting data must show that straw and wood chips each beat gravel and no mulch. Only choice A makes that full comparison. Choice B compares the two non-organic conditions, choice C compares the two organic mulches with each other, and choice D does not mention the organic mulches at all.$sm$),
  ('12000000-0000-4000-8000-000000450002', '10000000-0000-4000-8000-000000000045', 'uz', $sm$Talabaning xulosasi ikkala organik mulcha (somon va yog'och qipig'i) qolgan ikki holatga — shag'al mulcha va mulchasiz holatga — nisbatan tuproqni namroq saqlaganini aytadi. Faqat A javob ikkala organik mulchani ikkala boshqa holat bilan taqqoslaydi. B javob faqat noorganik holatlarni, C javob esa ikki organik mulchani o'zaro solishtiradi. D javob somon va yog'och qipig'ini umuman tilga olmaydi.$sm$)
on conflict do nothing;

-- Q46 [I6] command_of_evidence_quantitative · hard · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000046',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'information_ideas'),
  (select id from public.skills where code = 'command_of_evidence_quantitative'),
  'hard', 'multiple_choice', 'passage',
  $sm$Which choice most effectively uses data from the text to complete the statement?$sm$,
  $sm$Researchers counted the average number of daily bicycle trips on three city streets one year before and one year after protected bike lanes were added to two of the streets:

- Elm Street (new protected lane): 410 trips before, 690 trips after
- Harbor Road (new protected lane): 520 trips before, 560 trips after
- Mill Lane (no new lane): 300 trips before, 310 trips after

The researchers noted that the increase in cycling was not uniform across the streets that received protected lanes, ______$sm$,
  90, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000460001', '10000000-0000-4000-8000-000000000046', 'A', $sm$since Elm Street gained 280 daily trips, while Harbor Road gained only 40.$sm$, true, 1),
  ('11000000-0000-4000-8000-000000460002', '10000000-0000-4000-8000-000000000046', 'B', $sm$since Mill Lane, which received no new lane, gained 10 daily trips.$sm$, false, 2),
  ('11000000-0000-4000-8000-000000460003', '10000000-0000-4000-8000-000000000046', 'C', $sm$since Harbor Road had more daily trips than Elm Street before the lanes were added.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000460004', '10000000-0000-4000-8000-000000000046', 'D', $sm$since both Elm Street and Harbor Road had more daily trips after the lanes were added than before.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000460001', '10000000-0000-4000-8000-000000000046', 'en', $sm$The statement is about unequal increases on the two streets that received lanes. Elm Street rose from 410 to 690 (an increase of 280), while Harbor Road rose from 520 to 560 (an increase of 40), so choice A shows the increase was not uniform. Choice B concerns a street without a new lane. Choice C compares starting values rather than increases. Choice D shows that both streets increased, not that they increased by different amounts.$sm$)
on conflict do nothing;

-- Q47 [I7] inferences · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000047',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'information_ideas'),
  (select id from public.skills where code = 'inferences'),
  'easy', 'multiple_choice', 'passage',
  $sm$Which choice most logically completes the text?$sm$,
  $sm$Some plants release their seeds only after a fire: the heat opens their tough seed cases, and the seeds then sprout in ash-rich soil with little competition from other plants. In a forest where fires have been prevented for many decades, a botanist would most likely expect such plants to ______$sm$,
  60, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000470001', '10000000-0000-4000-8000-000000000047', 'A', $sm$be rare among the forest's young seedlings.$sm$, true, 1),
  ('11000000-0000-4000-8000-000000470002', '10000000-0000-4000-8000-000000000047', 'B', $sm$dominate the youngest generation of plants in the forest.$sm$, false, 2),
  ('11000000-0000-4000-8000-000000470003', '10000000-0000-4000-8000-000000000047', 'C', $sm$release more seeds each year than they did when fires were common.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000470004', '10000000-0000-4000-8000-000000000047', 'D', $sm$grow faster than plants whose seeds do not depend on fire.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000470001', '10000000-0000-4000-8000-000000000047', 'en', $sm$If the seeds open only after fire and there have been no fires for decades, few new plants of this kind could have sprouted, so they would be rare among young seedlings. Choice B states the opposite. Choices C and D are not supported: nothing in the text suggests seeds are released without fire or that these plants grow unusually fast.$sm$),
  ('12000000-0000-4000-8000-000000470002', '10000000-0000-4000-8000-000000000047', 'uz', $sm$Matnga ko'ra, bu o'simliklarning urug'lari faqat yong'in issiqligidan keyin ochiladi. Agar o'rmonda o'nlab yillar davomida yong'in bo'lmagan bo'lsa, urug'lar ochilmaydi va yangi nihollar deyarli paydo bo'lmaydi, shuning uchun bunday o'simliklar yosh nihollar orasida kam uchraydi. B javob buning aksini aytadi. C va D javoblar matnda asoslanmagan.$sm$)
on conflict do nothing;

-- Q48 [I8] inferences · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000048',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'information_ideas'),
  (select id from public.skills where code = 'inferences'),
  'medium', 'multiple_choice', 'passage',
  $sm$Which choice most logically completes the text?$sm$,
  $sm$Archaeologists excavating an ancient settlement found many pots made from a type of clay that does not occur within 200 kilometers of the site. There is no sign that the pots were made locally: the team found no kilns, unfinished pieces or stored clay. Yet the pots appear in ordinary households, not just in the homes of wealthy families. These findings suggest that ______$sm$,
  75, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000480001', '10000000-0000-4000-8000-000000000048', 'A', $sm$the residents obtained the pots through trade networks that reached ordinary households.$sm$, true, 1),
  ('11000000-0000-4000-8000-000000480002', '10000000-0000-4000-8000-000000000048', 'B', $sm$the residents made the pots from clay found near the settlement.$sm$, false, 2),
  ('11000000-0000-4000-8000-000000480003', '10000000-0000-4000-8000-000000000048', 'C', $sm$only the wealthiest residents had access to goods from distant places.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000480004', '10000000-0000-4000-8000-000000000048', 'D', $sm$the clay deposits near the settlement were used up early in its history.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000480001', '10000000-0000-4000-8000-000000000048', 'en', $sm$The clay came from far away, the pots were not made at the site, and ordinary families owned them, so the pots most likely arrived through trade that reached ordinary people. Choice B contradicts the evidence that the clay is not local and there are no signs of local production. Choice C contradicts the finding that the pots appear in ordinary households. Choice D has no support, since the clay does not occur near the site at all.$sm$)
on conflict do nothing;

-- ===== Reading and Writing · standard_english_conventions =====

-- Q49 [S1] boundaries · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000049',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'standard_english_conventions'),
  (select id from public.skills where code = 'boundaries'),
  'easy', 'multiple_choice', 'passage',
  $sm$Which choice completes the text so that it conforms to the conventions of Standard English?$sm$,
  $sm$The city museum's newest exhibit features handwoven textiles from twelve countries ______ visitors can touch sample fabrics at a station near the entrance and compare how different fibers feel.$sm$,
  50, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000490001', '10000000-0000-4000-8000-000000000049', 'A', $sm$countries, visitors$sm$, false, 1),
  ('11000000-0000-4000-8000-000000490002', '10000000-0000-4000-8000-000000000049', 'B', $sm$countries visitors$sm$, false, 2),
  ('11000000-0000-4000-8000-000000490003', '10000000-0000-4000-8000-000000000049', 'C', $sm$countries; visitors$sm$, true, 3),
  ('11000000-0000-4000-8000-000000490004', '10000000-0000-4000-8000-000000000049', 'D', $sm$countries and, visitors$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000490001', '10000000-0000-4000-8000-000000000049', 'en', $sm$The text joins two independent clauses ("The city museum's newest exhibit features..." and "visitors can touch..."). A semicolon can join two independent clauses without a conjunction. Choice A is a comma splice, choice B is a run-on sentence with no punctuation, and choice D places the comma after "and" instead of before it.$sm$),
  ('12000000-0000-4000-8000-000000490002', '10000000-0000-4000-8000-000000000049', 'uz', $sm$Bo'sh joydan oldingi va keyingi qismlar ikkita mustaqil gapdir (har birida ega va kesim bor). Ikki mustaqil gapni bog'lovchisiz birlashtirish uchun nuqtali vergul ishlatiladi, shuning uchun C javob to'g'ri. A javob ularni faqat vergul bilan bog'laydi (comma splice xatosi), B javobda tinish belgisi umuman yo'q (run-on xatosi), D javobda esa vergul "and" dan oldin emas, keyin qo'yilgan.$sm$)
on conflict do nothing;

-- Q50 [S2] boundaries · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000050',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'standard_english_conventions'),
  (select id from public.skills where code = 'boundaries'),
  'easy', 'multiple_choice', 'passage',
  $sm$Which choice completes the text so that it conforms to the conventions of Standard English?$sm$,
  $sm$To prepare for the long hike through the national park, the guide packed only three essentials ______ a water filter, a first-aid kit and a printed map of the trail. Everything else stayed behind at the camp.$sm$,
  50, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000500001', '10000000-0000-4000-8000-000000000050', 'A', $sm$essentials;$sm$, false, 1),
  ('11000000-0000-4000-8000-000000500002', '10000000-0000-4000-8000-000000000050', 'B', $sm$essentials:$sm$, true, 2),
  ('11000000-0000-4000-8000-000000500003', '10000000-0000-4000-8000-000000000050', 'C', $sm$essentials.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000500004', '10000000-0000-4000-8000-000000000050', 'D', $sm$essentials, which$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000500001', '10000000-0000-4000-8000-000000000050', 'en', $sm$A colon is used after an independent clause to introduce a list that explains it; here the list names the three essentials. Choice A is incorrect because a semicolon must be followed by an independent clause, not a list. Choice C leaves the list as a sentence fragment. Choice D creates an ungrammatical relative clause with no verb.$sm$)
on conflict do nothing;

-- Q51 [S3] boundaries · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000051',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'standard_english_conventions'),
  (select id from public.skills where code = 'boundaries'),
  'medium', 'multiple_choice', 'passage',
  $sm$Which choice completes the text so that it conforms to the conventions of Standard English?$sm$,
  $sm$Earthquake-resistant housing has long interested Nadia Ferreira ______ a structural engineer based in Lisbon. Her recent work tests whether frames made of bamboo can flex without breaking during strong tremors.$sm$,
  60, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000510001', '10000000-0000-4000-8000-000000000051', 'A', $sm$Ferreira;$sm$, false, 1),
  ('11000000-0000-4000-8000-000000510002', '10000000-0000-4000-8000-000000000051', 'B', $sm$Ferreira.$sm$, false, 2),
  ('11000000-0000-4000-8000-000000510003', '10000000-0000-4000-8000-000000000051', 'C', $sm$Ferreira, she is$sm$, false, 3),
  ('11000000-0000-4000-8000-000000510004', '10000000-0000-4000-8000-000000000051', 'D', $sm$Ferreira,$sm$, true, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000510001', '10000000-0000-4000-8000-000000000051', 'en', $sm$"A structural engineer based in Lisbon" is a nonessential appositive that describes Ferreira, so it should be set off with a comma. Choice A uses a semicolon before a phrase that is not an independent clause. Choice B turns the appositive into a sentence fragment. Choice C creates a comma splice by joining two independent clauses with only a comma.$sm$)
on conflict do nothing;

-- Q52 [S4] boundaries · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000052',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'standard_english_conventions'),
  (select id from public.skills where code = 'boundaries'),
  'medium', 'multiple_choice', 'passage',
  $sm$Which choice completes the text so that it conforms to the conventions of Standard English?$sm$,
  $sm$The town's oldest library ______ built in 1891 from local limestone, still uses its original oak shelves. Volunteers restored the shelves last year without replacing a single board.$sm$,
  60, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000520001', '10000000-0000-4000-8000-000000000052', 'A', $sm$library,$sm$, true, 1),
  ('11000000-0000-4000-8000-000000520002', '10000000-0000-4000-8000-000000000052', 'B', $sm$library—$sm$, false, 2),
  ('11000000-0000-4000-8000-000000520003', '10000000-0000-4000-8000-000000000052', 'C', $sm$library;$sm$, false, 3),
  ('11000000-0000-4000-8000-000000520004', '10000000-0000-4000-8000-000000000052', 'D', $sm$library.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000520001', '10000000-0000-4000-8000-000000000052', 'en', $sm$The phrase "built in 1891 from local limestone" interrupts the main clause and already ends with a comma, so it must also begin with a comma. Choice B mixes a dash with a comma; a pair of dashes or a pair of commas must match. Choice C uses a semicolon where no independent clause precedes it. Choice D separates the subject "library" from its verb "uses."$sm$)
on conflict do nothing;

-- Q53 [S5] boundaries · hard · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000053',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'standard_english_conventions'),
  (select id from public.skills where code = 'boundaries'),
  'hard', 'multiple_choice', 'passage',
  $sm$Which choice completes the text so that it conforms to the conventions of Standard English?$sm$,
  $sm$The first prototype of the solar-powered water pump performed well in laboratory tests ______ in the field, dust quickly clogged its intake valve, and the engineers had to redesign the filter.$sm$,
  75, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000530001', '10000000-0000-4000-8000-000000000053', 'A', $sm$tests, however,$sm$, false, 1),
  ('11000000-0000-4000-8000-000000530002', '10000000-0000-4000-8000-000000000053', 'B', $sm$tests; however,$sm$, true, 2),
  ('11000000-0000-4000-8000-000000530003', '10000000-0000-4000-8000-000000000053', 'C', $sm$tests however,$sm$, false, 3),
  ('11000000-0000-4000-8000-000000530004', '10000000-0000-4000-8000-000000000053', 'D', $sm$tests, however$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000530001', '10000000-0000-4000-8000-000000000053', 'en', $sm$"However" begins a new independent clause that contrasts with the first one. Two independent clauses joined by a conjunctive adverb need a semicolon before the adverb and a comma after it. Choices A and D are comma splices, because a comma alone cannot join two independent clauses. Choice C is a run-on sentence.$sm$)
on conflict do nothing;

-- Q54 [S6] form_structure_sense · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000054',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'standard_english_conventions'),
  (select id from public.skills where code = 'form_structure_sense'),
  'easy', 'multiple_choice', 'passage',
  $sm$Which choice completes the text so that it conforms to the conventions of Standard English?$sm$,
  $sm$The collection of rare maps, which includes charts drawn by early navigators, ______ on display in the library's east wing until the end of the month. Visitors may view it free of charge.$sm$,
  50, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000540001', '10000000-0000-4000-8000-000000000054', 'A', $sm$are$sm$, false, 1),
  ('11000000-0000-4000-8000-000000540002', '10000000-0000-4000-8000-000000000054', 'B', $sm$were$sm$, false, 2),
  ('11000000-0000-4000-8000-000000540003', '10000000-0000-4000-8000-000000000054', 'C', $sm$is$sm$, true, 3),
  ('11000000-0000-4000-8000-000000540004', '10000000-0000-4000-8000-000000000054', 'D', $sm$have been$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000540001', '10000000-0000-4000-8000-000000000054', 'en', $sm$The subject of the sentence is the singular noun "collection," so the verb must be singular: "is." The phrase "of rare maps" and the clause between the commas only describe the subject. Choices A, B and D are plural verbs that wrongly agree with nearby plural nouns such as "maps" or "navigators."$sm$),
  ('12000000-0000-4000-8000-000000540002', '10000000-0000-4000-8000-000000000054', 'uz', $sm$Gapning egasi — birlikdagi "collection" (to'plam) so'zi, shuning uchun kesim ham birlikda bo'lishi kerak: "is". "Of rare maps" birikmasi va vergullar orasidagi qism egani faqat aniqlab keladi. A, B va D javoblar ko'plikdagi kesimlar bo'lib, ular yaqin turgan "maps" yoki "navigators" so'zlariga noto'g'ri moslashtirilgan.$sm$)
on conflict do nothing;

-- Q55 [S7] form_structure_sense · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000055',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'standard_english_conventions'),
  (select id from public.skills where code = 'form_structure_sense'),
  'medium', 'multiple_choice', 'passage',
  $sm$Which choice completes the text so that it conforms to the conventions of Standard English?$sm$,
  $sm$Visitors to the botanical garden often stop first at the glass greenhouse, where dozens of orchids display ______ brightest blooms in late winter, long before the outdoor flower beds turn green.$sm$,
  55, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000550001', '10000000-0000-4000-8000-000000000055', 'A', $sm$its$sm$, false, 1),
  ('11000000-0000-4000-8000-000000550002', '10000000-0000-4000-8000-000000000055', 'B', $sm$it's$sm$, false, 2),
  ('11000000-0000-4000-8000-000000550003', '10000000-0000-4000-8000-000000000055', 'C', $sm$their$sm$, true, 3),
  ('11000000-0000-4000-8000-000000550004', '10000000-0000-4000-8000-000000000055', 'D', $sm$they're$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000550001', '10000000-0000-4000-8000-000000000055', 'en', $sm$The pronoun refers to "orchids," a plural noun, and it must show possession, so "their" is correct. Choice A is a singular possessive pronoun. Choice B is a contraction of "it is," and choice D is a contraction of "they are"; neither shows possession.$sm$),
  ('12000000-0000-4000-8000-000000550002', '10000000-0000-4000-8000-000000000055', 'uz', $sm$Olmosh ko'plikdagi "orchids" (orxideyalar) so'ziga ishora qiladi va egalikni bildirishi kerak, shuning uchun "their" to'g'ri. "Its" birlikdagi egalik olmoshi. "It's" — "it is" ning, "they're" esa "they are" ning qisqartmasi; ular egalikni bildirmaydi.$sm$)
on conflict do nothing;

-- Q56 [S8] form_structure_sense · hard · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000056',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'standard_english_conventions'),
  (select id from public.skills where code = 'form_structure_sense'),
  'hard', 'multiple_choice', 'passage',
  $sm$Which choice completes the text so that it conforms to the conventions of Standard English?$sm$,
  $sm$Having studied coral samples from the same reef for three years, ______ Her report showed that the corals had regrown faster than earlier models had predicted.$sm$,
  75, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000560001', '10000000-0000-4000-8000-000000000056', 'A', $sm$the reef's recovery was finally documented by the marine biologist.$sm$, false, 1),
  ('11000000-0000-4000-8000-000000560002', '10000000-0000-4000-8000-000000000056', 'B', $sm$the marine biologist finally documented the reef's recovery.$sm$, true, 2),
  ('11000000-0000-4000-8000-000000560003', '10000000-0000-4000-8000-000000000056', 'C', $sm$the documentation of the reef's recovery was finally completed.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000560004', '10000000-0000-4000-8000-000000000056', 'D', $sm$finally, the reef's recovery was documented by the marine biologist.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000560001', '10000000-0000-4000-8000-000000000056', 'en', $sm$The introductory phrase "Having studied coral samples..." must be followed immediately by the person who did the studying, the marine biologist. Only choice B places "the marine biologist" right after the phrase. Choices A, C and D create dangling modifiers that say the recovery or the documentation studied the samples.$sm$)
on conflict do nothing;

-- ===== Reading and Writing · expression_of_ideas =====

-- Q57 [X1] rhetorical_synthesis · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000057',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'expression_of_ideas'),
  (select id from public.skills where code = 'rhetorical_synthesis'),
  'easy', 'multiple_choice', 'passage',
  $sm$The student wants to introduce Rosa Delgado's exhibition to an audience unfamiliar with her work. Which choice most effectively uses relevant information from the notes to accomplish this goal?$sm$,
  $sm$While researching a topic, a student has taken the following notes:

- Rosa Delgado is a textile artist.
- She weaves tapestries from wool that she dyes with plants she grows herself.
- Her 2024 exhibition, *Field Colors*, featured 18 tapestries.
- Each tapestry shows the landscape where its dye plants were harvested.$sm$,
  65, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000570001', '10000000-0000-4000-8000-000000000057', 'A', $sm$Textile artist Rosa Delgado's 2024 exhibition, *Field Colors*, featured 18 tapestries woven from wool she dyed with plants she grows herself.$sm$, true, 1),
  ('11000000-0000-4000-8000-000000570002', '10000000-0000-4000-8000-000000000057', 'B', $sm$*Field Colors* featured 18 tapestries.$sm$, false, 2),
  ('11000000-0000-4000-8000-000000570003', '10000000-0000-4000-8000-000000000057', 'C', $sm$Each tapestry shows the landscape where its dye plants were harvested.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000570004', '10000000-0000-4000-8000-000000000057', 'D', $sm$Rosa Delgado grows plants and uses them to dye wool.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000570001', '10000000-0000-4000-8000-000000000057', 'en', $sm$An audience unfamiliar with Delgado needs to learn who she is and what the exhibition contains. Choice A identifies her as a textile artist, names the exhibition and its year, and describes the tapestries. Choice B does not say who Delgado is. Choice C mentions neither the artist nor the exhibition, and choice D does not mention the exhibition.$sm$),
  ('12000000-0000-4000-8000-000000570002', '10000000-0000-4000-8000-000000000057', 'uz', $sm$Maqsad — Delgado ijodi bilan tanish bo'lmagan o'quvchilarga uning ko'rgazmasini tanishtirish. Buning uchun rassom kimligi, ko'rgazma nomi va unda nimalar borligini aytish kerak; A javob bularning barchasini o'z ichiga oladi. B javob rassomni tanishtirmaydi. C javob na rassomni, na ko'rgazmani tilga oladi, D javob esa ko'rgazma haqida hech narsa demaydi.$sm$)
on conflict do nothing;

-- Q58 [X2] rhetorical_synthesis · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000058',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'expression_of_ideas'),
  (select id from public.skills where code = 'rhetorical_synthesis'),
  'medium', 'multiple_choice', 'passage',
  $sm$The student wants to emphasize a difference in cost between the two models. Which choice most effectively uses relevant information from the notes to accomplish this goal?$sm$,
  $sm$While researching a topic, a student has taken the following notes:

- A city tested two models of rooftop solar panels.
- Model R converted 21% of sunlight into electricity and cost \$310 per panel.
- Model T converted 17% of sunlight into electricity and cost \$220 per panel.
- Both models came with a 25-year warranty.$sm$,
  70, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000580001', '10000000-0000-4000-8000-000000000058', 'A', $sm$Model T cost \$90 less per panel than Model R did.$sm$, true, 1),
  ('11000000-0000-4000-8000-000000580002', '10000000-0000-4000-8000-000000000058', 'B', $sm$Both models of solar panels came with a 25-year warranty.$sm$, false, 2),
  ('11000000-0000-4000-8000-000000580003', '10000000-0000-4000-8000-000000000058', 'C', $sm$Model R converted 21% of sunlight into electricity, while Model T converted 17%.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000580004', '10000000-0000-4000-8000-000000000058', 'D', $sm$The city tested two models of rooftop solar panels, Model R and Model T.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000580001', '10000000-0000-4000-8000-000000000058', 'en', $sm$The goal is a difference in cost. Choice A states that Model T was \$90 cheaper per panel, since $310 - 220 = 90$. Choice B describes a similarity, not a difference. Choice C emphasizes a difference in efficiency rather than cost. Choice D only names the models.$sm$)
on conflict do nothing;

-- Q59 [X3] rhetorical_synthesis · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000059',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'expression_of_ideas'),
  (select id from public.skills where code = 'rhetorical_synthesis'),
  'easy', 'multiple_choice', 'passage',
  $sm$The student wants to present the conclusion of Nandakumar's study. Which choice most effectively uses relevant information from the notes to accomplish this goal?$sm$,
  $sm$While researching a topic, a student has taken the following notes:

- Ecologist Priya Nandakumar studied urban parks in three cities.
- She counted the number of bee species in parks with and without unmowed meadow areas.
- Parks with unmowed areas had, on average, 40% more bee species.
- She concluded that leaving parts of parks unmowed can support pollinator diversity.$sm$,
  60, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000590001', '10000000-0000-4000-8000-000000000059', 'A', $sm$Nandakumar studied urban parks in three cities.$sm$, false, 1),
  ('11000000-0000-4000-8000-000000590002', '10000000-0000-4000-8000-000000000059', 'B', $sm$Based on her study, Nandakumar concluded that leaving parts of parks unmowed can support pollinator diversity.$sm$, true, 2),
  ('11000000-0000-4000-8000-000000590003', '10000000-0000-4000-8000-000000000059', 'C', $sm$Nandakumar counted the number of bee species in parks.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000590004', '10000000-0000-4000-8000-000000000059', 'D', $sm$Some of the parks in the study had unmowed meadow areas.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000590001', '10000000-0000-4000-8000-000000000059', 'en', $sm$Only choice B states what Nandakumar concluded from her research. Choices A and C describe the study's methods, and choice D gives a detail about the parks; none of them presents the conclusion.$sm$)
on conflict do nothing;

-- Q60 [X4] rhetorical_synthesis · hard · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000060',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'expression_of_ideas'),
  (select id from public.skills where code = 'rhetorical_synthesis'),
  'hard', 'multiple_choice', 'passage',
  $sm$The student wants to emphasize why fog nets might appeal to communities without a reliable supply of electricity. Which choice most effectively uses relevant information from the notes to accomplish this goal?$sm$,
  $sm$While researching a topic, a student has taken the following notes:

- Fog nets are panels of fine mesh set up on hillsides.
- Water droplets in passing fog collect on the mesh and drip into troughs.
- In one coastal village, 30 fog nets collected an average of 4,500 liters of water per day during the foggy season.
- Fog nets need no electricity or fuel to operate.$sm$,
  80, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000600001', '10000000-0000-4000-8000-000000000060', 'A', $sm$Fog nets, which are panels of fine mesh set up on hillsides, collect water droplets that drip into troughs.$sm$, false, 1),
  ('11000000-0000-4000-8000-000000600002', '10000000-0000-4000-8000-000000000060', 'B', $sm$Because fog nets need no electricity or fuel to operate, they can supply water even where power is unreliable.$sm$, true, 2),
  ('11000000-0000-4000-8000-000000600003', '10000000-0000-4000-8000-000000000060', 'C', $sm$In one coastal village, 30 fog nets collected an average of 4,500 liters of water per day during the foggy season.$sm$, false, 3),
  ('11000000-0000-4000-8000-000000600004', '10000000-0000-4000-8000-000000000060', 'D', $sm$Water droplets from passing fog can be collected on panels of fine mesh called fog nets.$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000600001', '10000000-0000-4000-8000-000000000060', 'en', $sm$The goal connects fog nets to communities without reliable electricity, so the sentence must use the note that the nets need no electricity or fuel. Choice B does this and explains the benefit. Choices A and D explain how the nets work, and choice C reports how much water they collected; none of them addresses electricity.$sm$)
on conflict do nothing;

-- Q61 [X5] transitions · easy · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000061',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'expression_of_ideas'),
  (select id from public.skills where code = 'transitions'),
  'easy', 'multiple_choice', 'passage',
  $sm$Which choice completes the text with the most logical transition?$sm$,
  $sm$Snow leopards are well adapted to cold mountain environments. Their thick fur and wide, fur-covered paws help them stay warm and walk on deep snow. ______ their long tails help them balance on steep, rocky slopes and can be wrapped around their bodies for warmth while they rest.$sm$,
  50, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000610001', '10000000-0000-4000-8000-000000000061', 'A', $sm$However,$sm$, false, 1),
  ('11000000-0000-4000-8000-000000610002', '10000000-0000-4000-8000-000000000061', 'B', $sm$Additionally,$sm$, true, 2),
  ('11000000-0000-4000-8000-000000610003', '10000000-0000-4000-8000-000000000061', 'C', $sm$Instead,$sm$, false, 3),
  ('11000000-0000-4000-8000-000000610004', '10000000-0000-4000-8000-000000000061', 'D', $sm$As a result,$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000610001', '10000000-0000-4000-8000-000000000061', 'en', $sm$The text lists adaptations, and the final sentence adds another one (the tail), so "Additionally" fits. "However" and "Instead" signal contrast, but there is none. "As a result" signals cause and effect, but the tail is not a result of the fur or paws.$sm$),
  ('12000000-0000-4000-8000-000000610002', '10000000-0000-4000-8000-000000000061', 'uz', $sm$Matn qor qoploni moslashuvining bir nechta belgisini (qalin mo'yna, keng panjalar) sanaydi, oxirgi gap esa yana bir belgini — uzun dumni qo'shadi. Shuning uchun qo'shimcha ma'lumot bildiruvchi "Additionally" to'g'ri. "However" va "Instead" qarama-qarshilikni bildiradi, lekin bu yerda qarama-qarshilik yo'q. "As a result" sabab-oqibatni bildiradi, ammo uzun dum mo'ynaning natijasi emas.$sm$)
on conflict do nothing;

-- Q62 [X6] transitions · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000062',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'expression_of_ideas'),
  (select id from public.skills where code = 'transitions'),
  'medium', 'multiple_choice', 'passage',
  $sm$Which choice completes the text with the most logical transition?$sm$,
  $sm$The town council expected the new pedestrian zone to hurt sales at downtown shops, since customers would no longer be able to park directly in front of them. ______ shop owners reported a 12 percent rise in sales during the zone's first six months, as more people strolled through the area.$sm$,
  55, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000620001', '10000000-0000-4000-8000-000000000062', 'A', $sm$Similarly,$sm$, false, 1),
  ('11000000-0000-4000-8000-000000620002', '10000000-0000-4000-8000-000000000062', 'B', $sm$For example,$sm$, false, 2),
  ('11000000-0000-4000-8000-000000620003', '10000000-0000-4000-8000-000000000062', 'C', $sm$Therefore,$sm$, false, 3),
  ('11000000-0000-4000-8000-000000620004', '10000000-0000-4000-8000-000000000062', 'D', $sm$Contrary to these expectations,$sm$, true, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000620001', '10000000-0000-4000-8000-000000000062', 'en', $sm$The council expected sales to fall, but sales rose, so the transition must signal that the result contradicted the expectation. "Similarly" signals likeness, "For example" introduces an illustration of the previous claim, and "Therefore" signals a logical result; none fits a result that is the opposite of what was predicted.$sm$),
  ('12000000-0000-4000-8000-000000620002', '10000000-0000-4000-8000-000000000062', 'uz', $sm$Kengash piyodalar zonasi do'konlar savdosiga zarar keltiradi deb kutgan edi, keyingi gapda esa savdo 12 foizga oshgani aytiladi. Bu kutilganning aksi, shuning uchun "Contrary to these expectations" to'g'ri. "Similarly" o'xshashlikni, "For example" misolni, "Therefore" esa mantiqiy natijani bildiradi — ularning hech biri kutilganga zid natijaga mos kelmaydi.$sm$)
on conflict do nothing;

-- Q63 [X7] transitions · medium · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000063',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'expression_of_ideas'),
  (select id from public.skills where code = 'transitions'),
  'medium', 'multiple_choice', 'passage',
  $sm$Which choice completes the text with the most logical transition?$sm$,
  $sm$Honeybee colonies regulate the temperature inside the hive carefully, because developing larvae are harmed if the brood area becomes too hot or too cold. On hot days, worker bees fan their wings at the hive entrance to move cooler air inside. ______ when temperatures drop, the workers cluster over the brood and shiver their flight muscles to produce heat.$sm$,
  60, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000630001', '10000000-0000-4000-8000-000000000063', 'A', $sm$As a result,$sm$, false, 1),
  ('11000000-0000-4000-8000-000000630002', '10000000-0000-4000-8000-000000000063', 'B', $sm$Specifically,$sm$, false, 2),
  ('11000000-0000-4000-8000-000000630003', '10000000-0000-4000-8000-000000000063', 'C', $sm$Conversely,$sm$, true, 3),
  ('11000000-0000-4000-8000-000000630004', '10000000-0000-4000-8000-000000000063', 'D', $sm$In other words,$sm$, false, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000630001', '10000000-0000-4000-8000-000000000063', 'en', $sm$The last two sentences describe opposite situations, hot days and cold days, and opposite responses, cooling and warming. "Conversely" signals this reversal. "As a result" wrongly suggests the clustering is caused by the fanning. "Specifically" and "In other words" would introduce more detail about, or a restatement of, the hot-day behavior.$sm$)
on conflict do nothing;

-- Q64 [X8] transitions · hard · multiple_choice
insert into public.questions
  (id, subject_id, domain_id, skill_id, difficulty, question_type, stimulus_type,
   stem, passage, estimated_seconds, source, tags, status, created_by)
values (
  '10000000-0000-4000-8000-000000000064',
  (select id from public.subjects where code = 'reading_writing'),
  (select id from public.domains where code = 'expression_of_ideas'),
  (select id from public.skills where code = 'transitions'),
  'hard', 'multiple_choice', 'passage',
  $sm$Which choice completes the text with the most logical transition?$sm$,
  $sm$Building the new seawall will take at least eight years, and its cost has already exceeded early estimates. ______ city engineers maintain that the project is essential, pointing to models showing that, without the wall, storm surges would flood the harbor district several times per decade.$sm$,
  65, 'original', array['dev-seed'], 'draft', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.answer_options (id, question_id, label, content, is_correct, position) values
  ('11000000-0000-4000-8000-000000640001', '10000000-0000-4000-8000-000000000064', 'A', $sm$Consequently,$sm$, false, 1),
  ('11000000-0000-4000-8000-000000640002', '10000000-0000-4000-8000-000000000064', 'B', $sm$Moreover,$sm$, false, 2),
  ('11000000-0000-4000-8000-000000640003', '10000000-0000-4000-8000-000000000064', 'C', $sm$Specifically,$sm$, false, 3),
  ('11000000-0000-4000-8000-000000640004', '10000000-0000-4000-8000-000000000064', 'D', $sm$Nonetheless,$sm$, true, 4)
on conflict do nothing;
insert into public.question_explanations (id, question_id, locale, content) values
  ('12000000-0000-4000-8000-000000640001', '10000000-0000-4000-8000-000000000064', 'en', $sm$The first sentence gives reasons to doubt the project (time and cost), and the second says engineers still support it. "Nonetheless" signals a conclusion that holds despite the preceding drawbacks. "Consequently" wrongly presents the engineers' support as caused by the delays and costs. "Moreover" would add another point in the same direction, and "Specifically" would introduce a detail of the previous sentence.$sm$)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 3. Publish. The questions_guard_status trigger rejects any question that lacks
--    an English explanation or a valid answer key, so this proves completeness.
-- -----------------------------------------------------------------------------
update public.questions
   set status = 'published', reviewed_by = '00000000-0000-4000-8000-000000000001', reviewed_at = now()
 where status = 'draft'
   and id = any (array[
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000007',
  '10000000-0000-4000-8000-000000000008',
  '10000000-0000-4000-8000-000000000009',
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000013',
  '10000000-0000-4000-8000-000000000014',
  '10000000-0000-4000-8000-000000000015',
  '10000000-0000-4000-8000-000000000016',
  '10000000-0000-4000-8000-000000000017',
  '10000000-0000-4000-8000-000000000018',
  '10000000-0000-4000-8000-000000000019',
  '10000000-0000-4000-8000-000000000020',
  '10000000-0000-4000-8000-000000000021',
  '10000000-0000-4000-8000-000000000022',
  '10000000-0000-4000-8000-000000000023',
  '10000000-0000-4000-8000-000000000024',
  '10000000-0000-4000-8000-000000000025',
  '10000000-0000-4000-8000-000000000026',
  '10000000-0000-4000-8000-000000000027',
  '10000000-0000-4000-8000-000000000028',
  '10000000-0000-4000-8000-000000000029',
  '10000000-0000-4000-8000-000000000030',
  '10000000-0000-4000-8000-000000000031',
  '10000000-0000-4000-8000-000000000032',
  '10000000-0000-4000-8000-000000000033',
  '10000000-0000-4000-8000-000000000034',
  '10000000-0000-4000-8000-000000000035',
  '10000000-0000-4000-8000-000000000036',
  '10000000-0000-4000-8000-000000000037',
  '10000000-0000-4000-8000-000000000038',
  '10000000-0000-4000-8000-000000000039',
  '10000000-0000-4000-8000-000000000040',
  '10000000-0000-4000-8000-000000000041',
  '10000000-0000-4000-8000-000000000042',
  '10000000-0000-4000-8000-000000000043',
  '10000000-0000-4000-8000-000000000044',
  '10000000-0000-4000-8000-000000000045',
  '10000000-0000-4000-8000-000000000046',
  '10000000-0000-4000-8000-000000000047',
  '10000000-0000-4000-8000-000000000048',
  '10000000-0000-4000-8000-000000000049',
  '10000000-0000-4000-8000-000000000050',
  '10000000-0000-4000-8000-000000000051',
  '10000000-0000-4000-8000-000000000052',
  '10000000-0000-4000-8000-000000000053',
  '10000000-0000-4000-8000-000000000054',
  '10000000-0000-4000-8000-000000000055',
  '10000000-0000-4000-8000-000000000056',
  '10000000-0000-4000-8000-000000000057',
  '10000000-0000-4000-8000-000000000058',
  '10000000-0000-4000-8000-000000000059',
  '10000000-0000-4000-8000-000000000060',
  '10000000-0000-4000-8000-000000000061',
  '10000000-0000-4000-8000-000000000062',
  '10000000-0000-4000-8000-000000000063',
  '10000000-0000-4000-8000-000000000064'
  ]::uuid[]);

-- -----------------------------------------------------------------------------
-- 4. Courses and text lessons (lessons inserted as drafts, notes added, then
--    published so lessons_guard_publish verifies the notes exist)
-- -----------------------------------------------------------------------------
insert into public.courses (id, subject_id, slug, title, description, level, status, position, created_by) values
  ('20000000-0000-4000-8000-000000000001', (select id from public.subjects where code = 'math'), 'digital-sat-math-core',
   $sm$Digital SAT Math: core skills$sm$, $sm$Short text lessons on the core skills in all four Math domains, each with a worked example, common traps and a quick self-check.$sm$, 'all', 'published', 1, '00000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', (select id from public.subjects where code = 'reading_writing'), 'digital-sat-reading-writing-core',
   $sm$Digital SAT Reading and Writing: core skills$sm$, $sm$Short text lessons on the core skills in all four Reading and Writing domains, each with a worked example, common traps and a quick self-check.$sm$, 'all', 'published', 2, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- Lesson 01: Solving linear equations in one variable (linear_equations_one_variable)
insert into public.lessons
  (id, course_id, skill_id, slug, title, description, objectives, video_provider,
   duration_seconds, position, status, is_free_preview, created_by)
values (
  '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  (select id from public.skills where code = 'linear_equations_one_variable'),
  'solving-linear-equations', $sm$Solving linear equations in one variable$sm$,
  $sm$Solve one-variable linear equations step by step and recognize equations with no solution or infinitely many solutions.$sm$,
  array[$sm$Solve linear equations that contain fractions and parentheses$sm$, $sm$Recognize equations with no solution or infinitely many solutions$sm$, $sm$Check a solution by substitution$sm$],
  'none', 300, 1, 'draft', true, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.lesson_contents (id, lesson_id, body) values ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', $sm$**Key idea**

A linear equation in one variable states that two expressions are equal. Solving it means finding the value of the variable that makes the statement true. Every step must keep the two sides balanced: whatever you do to one side, you do to the other. A reliable order is to clear fractions, expand parentheses, collect the variable terms on one side and the constants on the other, and finally divide by the coefficient.

**Worked example**

Solve $\frac{2}{3}(x - 6) + 5 = x - 3$.

- Multiply every term by 3 to clear the fraction: $2(x - 6) + 15 = 3x - 9$.
- Expand and simplify: $2x - 12 + 15 = 3x - 9$, so $2x + 3 = 3x - 9$.
- Subtract $2x$ from both sides and add 9 to both sides: $x = 12$.

Check: $\frac{2}{3}(12 - 6) + 5 = 4 + 5 = 9$ and $12 - 3 = 9$. Both sides match.

**Special cases**

If the variable disappears and you are left with a true statement such as $4 = 4$, the equation has infinitely many solutions. If you are left with a false statement such as $4 = 7$, it has no solution. Questions often ask for the constant that produces one of these cases: make the coefficients of $x$ equal on both sides, then compare the constants.

**Common traps**

- Multiplying only some of the terms when clearing fractions.
- Sign errors when distributing a negative: $-3(x - 4) = -3x + 12$.
- Stopping at $2x = 10$ when the question asks for $x$, or giving $x$ when it asks for $3x + 1$.

**Quick self-check**

Solve $5 - 2(x + 1) = 9$. (Answer: $x = -3$.)$sm$)
on conflict do nothing;

-- Lesson 02: Systems of two linear equations (systems_linear_equations)
insert into public.lessons
  (id, course_id, skill_id, slug, title, description, objectives, video_provider,
   duration_seconds, position, status, is_free_preview, created_by)
values (
  '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
  (select id from public.skills where code = 'systems_linear_equations'),
  'systems-of-linear-equations', $sm$Systems of two linear equations$sm$,
  $sm$Solve systems by substitution and elimination, and decide how many solutions a system has.$sm$,
  array[$sm$Solve a system of two linear equations by elimination or substitution$sm$, $sm$Determine whether a system has one, none or infinitely many solutions$sm$, $sm$Answer the quantity the question actually asks for$sm$],
  'none', 360, 2, 'draft', false, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.lesson_contents (id, lesson_id, body) values ('31000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', $sm$**Key idea**

A system of two linear equations asks for the point $(x, y)$ that makes both equations true. On a graph, that point is where the two lines cross. Two lines can cross once (one solution), be parallel (no solution) or be the same line (infinitely many solutions).

**Two solving methods**

- Substitution: solve one equation for one variable and substitute the result into the other equation. This works well when a variable already has a coefficient of 1.
- Elimination: add or subtract the equations, after multiplying if needed, so that one variable cancels. This is usually the faster method.

**Worked example**

Solve the system $2x + 3y = 12$ and $4x - y = 10$.

Multiply the second equation by 3 to get $12x - 3y = 30$. Adding this to the first equation gives $14x = 42$, so $x = 3$. Substitute into $4x - y = 10$: $12 - y = 10$, so $y = 2$. Check in the first equation: $2(3) + 3(2) = 12$.

**Number of solutions**

Rewrite both equations as $y = mx + b$. Different slopes give exactly one solution. Equal slopes with different intercepts give no solution. Equal slopes and equal intercepts give infinitely many solutions. For $ax + 2y = 5$ and $6x + 4y = 7$, there is no solution when $\frac{a}{6} = \frac{2}{4}$, so $a = 3$; the constants are not in the same ratio, so the lines are parallel and distinct.

**Common traps**

- Forgetting to multiply the constant when scaling an equation.
- Answering with $x$ when the question asks for $y$, $x + y$ or $xy$.
- Assuming that "no solution" means the answer is 0.

**Quick self-check**

If $x + y = 9$ and $x - y = 3$, what is $xy$? (Answer: $x = 6$ and $y = 3$, so $xy = 18$.)$sm$)
on conflict do nothing;

-- Lesson 03: Quadratic functions and their graphs (nonlinear_functions)
insert into public.lessons
  (id, course_id, skill_id, slug, title, description, objectives, video_provider,
   duration_seconds, position, status, is_free_preview, created_by)
values (
  '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001',
  (select id from public.skills where code = 'nonlinear_functions'),
  'quadratic-functions-and-graphs', $sm$Quadratic functions and their graphs$sm$,
  $sm$Read the vertex, intercepts and direction of a parabola from the three forms of a quadratic function.$sm$,
  array[$sm$Identify the vertex, intercepts and direction of opening of a parabola$sm$, $sm$Choose the form of a quadratic that reveals the needed feature$sm$, $sm$Use the symmetry of a parabola to find its axis$sm$],
  'none', 390, 3, 'draft', false, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.lesson_contents (id, lesson_id, body) values ('31000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', $sm$**Key idea**

A quadratic function has the form $f(x) = ax^2 + bx + c$, and its graph is a parabola. If $a > 0$ the parabola opens upward and has a minimum; if $a < 0$ it opens downward and has a maximum. Three forms of the same function each reveal something different:

- Standard form $ax^2 + bx + c$: the $y$-intercept is $c$.
- Vertex form $a(x - h)^2 + k$: the vertex is $(h, k)$.
- Factored form $a(x - r)(x - s)$: the $x$-intercepts are $r$ and $s$.

**Worked example**

For $f(x) = x^2 - 6x + 5$, find the vertex and the $x$-intercepts.

The $x$-coordinate of the vertex is $-\frac{b}{2a} = \frac{6}{2} = 3$, and $f(3) = 9 - 18 + 5 = -4$, so the vertex is $(3, -4)$. Factoring gives $f(x) = (x - 1)(x - 5)$, so the $x$-intercepts are $(1, 0)$ and $(5, 0)$. The vertex lies halfway between the intercepts because the parabola is symmetric about the line $x = 3$.

**Using symmetry**

If two inputs give the same output, the axis of symmetry lies halfway between them. For example, if $g(2) = g(8)$ for a quadratic function $g$, the vertex has $x$-coordinate 5.

**Common traps**

- Reading the vertex of $a(x + 2)^2 + 7$ as $(2, 7)$ instead of $(-2, 7)$.
- Confusing the minimum value (the $y$-coordinate of the vertex) with the $x$-value where it occurs.
- Forgetting that $(-3)^2 = 9$ but $-3^2 = -9$.

**Quick self-check**

What is the minimum value of $f(x) = 2(x - 4)^2 + 3$, and where does it occur? (Answer: the minimum value is 3, at $x = 4$.)$sm$)
on conflict do nothing;

-- Lesson 04: Rewriting algebraic expressions (equivalent_expressions)
insert into public.lessons
  (id, course_id, skill_id, slug, title, description, objectives, video_provider,
   duration_seconds, position, status, is_free_preview, created_by)
values (
  '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001',
  (select id from public.skills where code = 'equivalent_expressions'),
  'rewriting-expressions', $sm$Rewriting algebraic expressions$sm$,
  $sm$Expand, factor and combine expressions to recognize equivalent forms quickly and accurately.$sm$,
  array[$sm$Expand products and special products correctly$sm$, $sm$Apply exponent rules and combine rational expressions$sm$, $sm$Use test values to confirm equivalence$sm$],
  'none', 330, 4, 'draft', false, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.lesson_contents (id, lesson_id, body) values ('31000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', $sm$**Key idea**

Two expressions are equivalent when they give the same value for every allowed input. You usually show equivalence by expanding, factoring or combining fractions, and then comparing the result with the answer choices.

**Core tools**

- Distribute and combine like terms: $3(x - 2) - (x + 4) = 2x - 10$.
- Special products: $(a + b)^2 = a^2 + 2ab + b^2$ and $(a - b)(a + b) = a^2 - b^2$.
- Exponent rules: $x^a \cdot x^b = x^{a+b}$, $(x^a)^b = x^{ab}$ and $x^{-n} = \frac{1}{x^n}$.
- Rational expressions: rewrite them over a common denominator before adding.

**Worked example**

Which expression is equivalent to $(x + 5)^2 - (x - 5)^2$?

Expand each square: $(x^2 + 10x + 25) - (x^2 - 10x + 25)$. Distribute the subtraction to every term: $x^2 + 10x + 25 - x^2 + 10x - 25 = 20x$. Confirm with a test value: at $x = 1$, the original expression is $36 - 16 = 20$, and $20(1) = 20$.

**Test-value strategy**

When the answer choices are long, pick a simple value such as $x = 2$ (avoid 0 and 1, which can hide differences), evaluate the original expression and each choice, and keep only the choices that match.

**Common traps**

- Writing $(x + 5)^2$ as $x^2 + 25$ and losing the middle term.
- Distributing a subtraction sign to the first term only.
- Cancelling terms instead of factors: $\frac{x + 6}{6}$ is not equal to $x$.

**Quick self-check**

Expand $(2x - 3)^2$. (Answer: $4x^2 - 12x + 9$.)$sm$)
on conflict do nothing;

-- Lesson 05: Ratios, rates and unit conversion (ratios_rates_proportions_units)
insert into public.lessons
  (id, course_id, skill_id, slug, title, description, objectives, video_provider,
   duration_seconds, position, status, is_free_preview, created_by)
values (
  '30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001',
  (select id from public.skills where code = 'ratios_rates_proportions_units'),
  'ratios-rates-and-units', $sm$Ratios, rates and unit conversion$sm$,
  $sm$Set up proportions, work with rates and convert units so that they cancel correctly.$sm$,
  array[$sm$Solve problems with ratios and constant rates$sm$, $sm$Convert units using conversion factors$sm$, $sm$Distinguish part-to-part from part-to-whole ratios$sm$],
  'none', 300, 5, 'draft', false, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.lesson_contents (id, lesson_id, body) values ('31000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000005', $sm$**Key idea**

A ratio compares two quantities, and a rate is a ratio with different units, such as kilometers per hour. In a proportional relationship the ratio stays constant, so you can write an equation such as $\frac{a}{b} = \frac{c}{d}$ and cross-multiply.

**Worked example: a constant rate**

A printer produces 45 pages in 3 minutes. At this rate, how long does it take to print 240 pages? The rate is $45 \div 3 = 15$ pages per minute, so the time is $240 \div 15 = 16$ minutes.

**Worked example: unit conversion**

Convert 18 meters per second to kilometers per hour. Multiply by conversion factors arranged so that the unwanted units cancel:

$$18 \, \frac{\text{m}}{\text{s}} \times \frac{3600 \text{ s}}{1 \text{ h}} \times \frac{1 \text{ km}}{1000 \text{ m}} = 64.8 \, \frac{\text{km}}{\text{h}}$$

**Parts and totals**

If the ratio of red beads to blue beads is $2 : 5$, then red beads make up $\frac{2}{7}$ of the total, not $\frac{2}{5}$. Always check whether a question asks about part to part or part to whole.

**Common traps**

- Dividing when you should multiply in a conversion. Write the units and make sure they cancel.
- Forgetting to square the factor for area units: $1 \text{ m}^2 = 10{,}000 \text{ cm}^2$, not 100.
- Treating a constant difference as if it were a constant ratio.

**Quick self-check**

A car uses 6 liters of fuel per 100 kilometers. How many liters does it use for 350 kilometers? (Answer: 21 liters.)$sm$)
on conflict do nothing;

-- Lesson 06: Percentages and percent change (percentages)
insert into public.lessons
  (id, course_id, skill_id, slug, title, description, objectives, video_provider,
   duration_seconds, position, status, is_free_preview, created_by)
values (
  '30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001',
  (select id from public.skills where code = 'percentages'),
  'percentages-and-percent-change', $sm$Percentages and percent change$sm$,
  $sm$Use multipliers to handle percent increases, decreases, percent change and reverse percentages.$sm$,
  array[$sm$Model percent increases and decreases with multipliers$sm$, $sm$Compute percent change from an original value$sm$, $sm$Find an original value after a percent change$sm$],
  'none', 300, 6, 'draft', false, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.lesson_contents (id, lesson_id, body) values ('31000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000006', $sm$**Key idea**

Percent means "per hundred," so $p\%$ of a quantity is $\frac{p}{100}$ times that quantity. The most useful habit is to think in multipliers:

- An increase of $p\%$ multiplies the quantity by $1 + \frac{p}{100}$.
- A decrease of $p\%$ multiplies the quantity by $1 - \frac{p}{100}$.

**Worked example**

A phone costs \$400. Its price rises by 10% and then falls by 10%. What is the final price? Compute $400 \times 1.10 \times 0.90 = 396$, so the final price is \$396, not \$400. The 10% decrease is taken from the larger amount, \$440, so it removes more than the increase added.

**Percent change**

$$\text{percent change} = \frac{\text{new} - \text{original}}{\text{original}} \times 100$$

If attendance grows from 250 to 290, the change is $\frac{40}{250} \times 100 = 16\%$.

**Finding the original value**

If a price after a 20% discount is \$64, then $0.8x = 64$, so $x = 80$. Adding 20% of 64 back on gives \$76.80, which is wrong, because the discount was 20% of the original price, not of the sale price.

**Common traps**

- Dividing by the new value instead of the original value when computing percent change.
- Adding successive percents: a 10% increase followed by a 20% increase is a 32% increase, not 30%.
- Confusing "percent of" with "percent more than": 150 is 150% of 100 but 50% more than 100.

**Quick self-check**

A town of 5,000 people shrinks by 4%. What is the new population? (Answer: $5000 \times 0.96 = 4800$.)$sm$)
on conflict do nothing;

-- Lesson 07: Right triangles and trigonometric ratios (right_triangles_trigonometry)
insert into public.lessons
  (id, course_id, skill_id, slug, title, description, objectives, video_provider,
   duration_seconds, position, status, is_free_preview, created_by)
values (
  '30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001',
  (select id from public.skills where code = 'right_triangles_trigonometry'),
  'right-triangles-and-trigonometry', $sm$Right triangles and trigonometric ratios$sm$,
  $sm$Apply the Pythagorean theorem, special right triangles and sine, cosine and tangent.$sm$,
  array[$sm$Apply the Pythagorean theorem to find a missing side$sm$, $sm$Use sine, cosine and tangent in right triangles$sm$, $sm$Use special right triangles and complementary angles$sm$],
  'none', 360, 7, 'draft', false, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.lesson_contents (id, lesson_id, body) values ('31000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000007', $sm$**Key idea**

In a right triangle with legs $a$ and $b$ and hypotenuse $c$, the Pythagorean theorem states that $a^2 + b^2 = c^2$. For an acute angle $\theta$, the trigonometric ratios compare the sides:

- $\sin \theta = \frac{\text{opposite}}{\text{hypotenuse}}$
- $\cos \theta = \frac{\text{adjacent}}{\text{hypotenuse}}$
- $\tan \theta = \frac{\text{opposite}}{\text{adjacent}}$

**Special right triangles**

A $45^\circ$-$45^\circ$-$90^\circ$ triangle has sides in the ratio $1 : 1 : \sqrt{2}$. A $30^\circ$-$60^\circ$-$90^\circ$ triangle has sides in the ratio $1 : \sqrt{3} : 2$, with the shortest side opposite the $30^\circ$ angle.

**Worked example**

In right triangle $DEF$, angle $F$ is the right angle, $DF = 8$ and $EF = 15$. Find $\sin D$.

First find the hypotenuse: $DE = \sqrt{8^2 + 15^2} = \sqrt{289} = 17$. The side opposite angle $D$ is $EF = 15$, so $\sin D = \frac{15}{17}$.

**Complementary angles**

The two acute angles of a right triangle add up to $90^\circ$, so the sine of one equals the cosine of the other: $\sin x^\circ = \cos(90 - x)^\circ$. In the example, $\cos E = \sin D = \frac{15}{17}$.

**Common traps**

- Labeling "opposite" and "adjacent" from the wrong angle. Always start from the angle named in the question.
- Using the hypotenuse as a leg in the Pythagorean theorem.
- Forgetting that similar triangles have equal trigonometric ratios, whatever their size.

**Quick self-check**

A right triangle has a $30^\circ$ angle and a hypotenuse of length 10. How long is the side opposite the $30^\circ$ angle? (Answer: 5.)$sm$)
on conflict do nothing;

-- Lesson 08: Circles: arcs, sectors and equations (circles)
insert into public.lessons
  (id, course_id, skill_id, slug, title, description, objectives, video_provider,
   duration_seconds, position, status, is_free_preview, created_by)
values (
  '30000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001',
  (select id from public.skills where code = 'circles'),
  'circles-arcs-sectors-equations', $sm$Circles: arcs, sectors and equations$sm$,
  $sm$Find arc lengths and sector areas with proportions, and read circle equations by completing the square.$sm$,
  array[$sm$Compute arc length and sector area from a central angle$sm$, $sm$Find the center and radius from a circle equation$sm$, $sm$Complete the square to rewrite an expanded circle equation$sm$],
  'none', 390, 8, 'draft', false, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.lesson_contents (id, lesson_id, body) values ('31000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000008', $sm$**Key idea**

Many circle questions are really proportion questions. A central angle of $\theta$ degrees cuts off the fraction $\frac{\theta}{360}$ of the whole circle, so:

- arc length $= \frac{\theta}{360} \times 2\pi r$
- sector area $= \frac{\theta}{360} \times \pi r^2$

In radians a full turn is $2\pi$, so the arc length is $r\theta$ and the sector area is $\frac{1}{2}r^2\theta$.

**Worked example**

A circle has radius 6. Find the arc length and the sector area for a central angle of $120^\circ$. The fraction of the circle is $\frac{120}{360} = \frac{1}{3}$. Arc length: $\frac{1}{3} \times 12\pi = 4\pi$. Sector area: $\frac{1}{3} \times 36\pi = 12\pi$.

**Circle equations**

A circle with center $(h, k)$ and radius $r$ has the equation $(x - h)^2 + (y - k)^2 = r^2$. If the equation is expanded, complete the square. For $x^2 + y^2 - 4x + 6y = 12$:

$$(x^2 - 4x + 4) + (y^2 + 6y + 9) = 12 + 4 + 9$$

so $(x - 2)^2 + (y + 3)^2 = 25$, which gives center $(2, -3)$ and radius 5.

**Useful facts**

- A tangent line is perpendicular to the radius at the point of tangency.
- An inscribed angle is half of the central angle that cuts off the same arc.
- To convert degrees to radians, multiply by $\frac{\pi}{180}$.

**Common traps**

- Using $r^2$ as the radius when reading an equation.
- Forgetting to add the completing-the-square constants to both sides.
- Mixing degrees and radians in one formula.

**Quick self-check**

What is the radius of the circle $x^2 + y^2 + 10x = 0$? (Answer: $(x + 5)^2 + y^2 = 25$, so the radius is 5.)$sm$)
on conflict do nothing;

-- Lesson 09: Words in context: choosing the precise word (words_in_context)
insert into public.lessons
  (id, course_id, skill_id, slug, title, description, objectives, video_provider,
   duration_seconds, position, status, is_free_preview, created_by)
values (
  '30000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000002',
  (select id from public.skills where code = 'words_in_context'),
  'words-in-context', $sm$Words in context: choosing the precise word$sm$,
  $sm$Use context clues to choose the most precise word and to identify the meaning of a word as it is used.$sm$,
  array[$sm$Use contrast, cause and restatement clues to predict a missing word$sm$, $sm$Distinguish a word's meaning in context from its most common meaning$sm$, $sm$Eliminate choices with the wrong tone or precision$sm$],
  'none', 300, 1, 'draft', true, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.lesson_contents (id, lesson_id, body) values ('31000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000009', $sm$**Key idea**

Words in context questions ask you either to choose the word that best completes a text or to identify what a word means as it is used in a text. In both cases the answer depends on the sentences around the word, not on the word's most common dictionary meaning.

**A four-step method**

- Read the whole text before looking at the choices.
- Find the clues: contrast words (but, however, although), cause words (because, so) and restatements after a colon or a dash.
- Predict your own word for the blank, in plain language.
- Choose the option closest to your prediction, then reread the sentence with it.

**Worked example**

"The manager's praise was *measured*: she liked the new layout but wanted several changes before approving it." The colon introduces an explanation, and the explanation shows that the praise came with reservations. So *measured* means "restrained" or "careful," not "calculated with a ruler." A simple prediction such as "limited" points straight to the correct choice.

**Common traps**

- Choosing a word because it sounds sophisticated. The right answer is precise, not fancy.
- Picking the familiar meaning of a word with several meanings, such as "check," "qualified" or "sound."
- Choosing a word on the right topic but with the wrong tone, for example a negative word in a positive text.

**Quick self-check**

Complete the sentence: "Although the first results were ______, the team repeated the experiment and found a clear pattern." The choices are conclusive, ambiguous, famous and permanent. (Answer: ambiguous, because "although" signals a contrast with "a clear pattern.")$sm$)
on conflict do nothing;

-- Lesson 10: Text structure and purpose (text_structure_purpose)
insert into public.lessons
  (id, course_id, skill_id, slug, title, description, objectives, video_provider,
   duration_seconds, position, status, is_free_preview, created_by)
values (
  '30000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000002',
  (select id from public.skills where code = 'text_structure_purpose'),
  'text-structure-and-purpose', $sm$Text structure and purpose$sm$,
  $sm$Label what each sentence does to identify how a text is organized and why it was written.$sm$,
  array[$sm$Describe the function of each sentence in a short text$sm$, $sm$Identify the overall structure and main purpose of a text$sm$, $sm$Reject answer choices that are too strong or only partly accurate$sm$],
  'none', 300, 2, 'draft', false, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.lesson_contents (id, lesson_id, body) values ('31000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000010', $sm$**Key idea**

Structure questions ask how a text is organized or what one sentence does within it. Purpose questions ask why the author wrote the text. Both reward a quick summary of what each sentence is doing, rather than what it says.

**Label the moves**

As you read, give each sentence a short label:

- claim or main point
- background or context
- example or evidence
- contrast, complication or counterargument
- conclusion or implication

A text that moves from a common view to new evidence to a revised view has a different structure from one that moves from a problem to a solution to a result.

**Worked example**

"Many people assume that octopuses live entirely solitary lives. Divers off one rocky coast, however, have repeatedly observed several octopuses sharing dens and signaling to one another. These observations suggest that octopus social behavior may be more varied than once thought."

The labels are: common assumption, contrary observation, revised conclusion. So the main purpose is to present observations that challenge an assumption about octopus behavior.

**Answer-choice tips**

- Every word in the correct choice must match the text. A choice that says "proves" when the text says "suggests" is too strong.
- Watch for choices that describe only one part of the text.
- Check the verb in each choice: "criticize," "explain," "compare" and "argue" describe very different purposes.

**Common traps**

- Picking a choice that is true about the topic but does not describe this text.
- Confusing the main purpose of the text with the purpose of a single detail.

**Quick self-check**

A text describes a city's traffic problem, explains a new bus system and reports shorter commute times. What is its structure? (Answer: problem, solution, result.)$sm$)
on conflict do nothing;

-- Lesson 11: Command of evidence: quantitative (command_of_evidence_quantitative)
insert into public.lessons
  (id, course_id, skill_id, slug, title, description, objectives, video_provider,
   duration_seconds, position, status, is_free_preview, created_by)
values (
  '30000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000002',
  (select id from public.skills where code = 'command_of_evidence_quantitative'),
  'command-of-evidence-quantitative', $sm$Command of evidence: quantitative$sm$,
  $sm$Choose data that is both accurate and relevant to the exact claim in the text.$sm$,
  array[$sm$Identify the exact comparison a claim requires$sm$, $sm$Read data labels, units and categories accurately$sm$, $sm$Eliminate accurate but irrelevant data$sm$],
  'none', 360, 3, 'draft', false, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.lesson_contents (id, lesson_id, body) values ('31000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000011', $sm$**Key idea**

These questions pair a short text with data from a table or a graph. You must choose the option that uses the data accurately and supports, or completes, a specific claim. Two things must be true of the correct answer: the numbers must be read correctly, and they must be relevant to the claim.

**A three-step method**

- Identify the exact claim: which groups, which measure, which direction?
- Read the data labels carefully: units, time periods and categories.
- Eliminate choices that are accurate but irrelevant, then check the remaining choice against the data.

**Worked example**

A student claims that a reading program helped younger students more than older students. The results:

- Grade 3: average score rose from 62 to 75
- Grade 6: average score rose from 70 to 74

The strongest support compares the changes: grade 3 improved by 13 points, while grade 6 improved by only 4 points. A choice saying that grade 6 had the higher final score is accurate, but it does not show which group improved more.

**Common traps**

- Accurate but irrelevant data: true numbers that do not match the claim.
- Comparing the wrong measure, such as starting values instead of changes.
- Covering only part of the claim. If the claim names two groups, the answer must address both.
- Reading a trend into a single data point.

**Quick self-check**

A claim says that rainfall increased every year from 2020 to 2023. Which data set would weaken the claim: 410 mm, 450 mm, 430 mm and 480 mm, or 400 mm, 420 mm, 440 mm and 470 mm? (Answer: the first set, because rainfall fell from 450 mm to 430 mm.)$sm$)
on conflict do nothing;

-- Lesson 12: Making logical inferences (inferences)
insert into public.lessons
  (id, course_id, skill_id, slug, title, description, objectives, video_provider,
   duration_seconds, position, status, is_free_preview, created_by)
values (
  '30000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000002',
  (select id from public.skills where code = 'inferences'),
  'making-inferences', $sm$Making logical inferences$sm$,
  $sm$Complete a text with the conclusion that follows from its facts, without adding outside assumptions.$sm$,
  array[$sm$Summarize the facts a conclusion must rest on$sm$, $sm$Predict a modest, text-based conclusion$sm$, $sm$Reject choices that overreach or need outside knowledge$sm$],
  'none', 300, 4, 'draft', false, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.lesson_contents (id, lesson_id, body) values ('31000000-0000-4000-8000-000000000012', '30000000-0000-4000-8000-000000000012', $sm$**Key idea**

Inference questions end with a blank and ask which choice most logically completes the text. The correct answer is the conclusion that follows from the information given. It is usually modest: it goes one step beyond the text, never several.

**How to approach them**

- Summarize the facts in the text in your own words.
- Notice the logical signal before the blank, such as "suggests," "therefore" or "this means that."
- Predict a conclusion that uses only those facts.
- Reject any choice that needs outside knowledge or contradicts a detail.

**Worked example**

"A coastal town's fishing records show that catches of one fish species dropped sharply in years when the water was unusually warm. In cooler years, catches returned to normal. Because the number of fishing boats stayed the same throughout the period, ______"

The constant number of boats rules out fishing effort as the cause, and the catches track water temperature. A logical completion is: "the changes in the catch were likely related to water temperature rather than to fishing effort." A choice claiming that warm water kills the fish goes too far, because the fish may simply have moved to cooler water.

**Common traps**

- Choosing an answer that may be true in the real world but is not supported by the text.
- Picking an extreme word: "always," "never," "proves" or "only."
- Ignoring a detail that rules out an option, such as the constant number of boats above.

**Quick self-check**

"Every student who entered the contest submitted a poem. Ana did not submit a poem." What follows? (Answer: Ana did not enter the contest.)$sm$)
on conflict do nothing;

-- Lesson 13: Sentence boundaries and punctuation (boundaries)
insert into public.lessons
  (id, course_id, skill_id, slug, title, description, objectives, video_provider,
   duration_seconds, position, status, is_free_preview, created_by)
values (
  '30000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000002',
  (select id from public.skills where code = 'boundaries'),
  'sentence-boundaries', $sm$Sentence boundaries and punctuation$sm$,
  $sm$Join and separate clauses correctly with periods, semicolons, colons, commas and dashes.$sm$,
  array[$sm$Identify independent clauses$sm$, $sm$Avoid comma splices, run-ons and fragments$sm$, $sm$Punctuate lists, explanations and interrupting phrases$sm$],
  'none', 360, 5, 'draft', false, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.lesson_contents (id, lesson_id, body) values ('31000000-0000-4000-8000-000000000013', '30000000-0000-4000-8000-000000000013', $sm$**Key idea**

Boundaries questions test where one sentence or clause ends and the next begins. Start by finding the independent clauses: groups of words with a subject and a verb that could stand alone as sentences.

**The rules you need**

- Two independent clauses can be joined by a period, a semicolon, or a comma plus a coordinating conjunction (for, and, nor, but, or, yet, so).
- A comma alone between two independent clauses is a comma splice. No punctuation at all creates a run-on sentence.
- A colon follows an independent clause and introduces an explanation, a list or an example.
- Extra information in the middle of a sentence is enclosed by a matching pair: two commas, two dashes or two parentheses.
- Words such as however, therefore and moreover cannot join clauses by themselves. Between two independent clauses, write "; however,".

**Worked example**

"The bridge reopened in May ______ traffic downtown has improved since then."

Both sides are independent clauses. A semicolon works ("May; traffic"), and so does a comma with a conjunction ("May, and traffic"). A comma alone ("May, traffic") is a comma splice, and "May, however traffic" is also incorrect. On the test, only one valid option will appear among the choices.

**Common traps**

- Mismatched pairs, such as a comma at the start of an interrupting phrase and a dash at its end.
- Putting a single comma between a subject and its verb.
- Placing a semicolon before a phrase that is not an independent clause.

**Quick self-check**

Fix this sentence: "The results were surprising, the team decided to repeat the test." (Answer: replace the comma with a semicolon or a period, or add "so" after the comma.)$sm$)
on conflict do nothing;

-- Lesson 14: Agreement: subjects, verbs and pronouns (form_structure_sense)
insert into public.lessons
  (id, course_id, skill_id, slug, title, description, objectives, video_provider,
   duration_seconds, position, status, is_free_preview, created_by)
values (
  '30000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-000000000002',
  (select id from public.skills where code = 'form_structure_sense'),
  'agreement-subjects-verbs-pronouns', $sm$Agreement: subjects, verbs and pronouns$sm$,
  $sm$Match verbs to their true subjects, pronouns to their antecedents and use possessives correctly.$sm$,
  array[$sm$Find the true subject of a sentence$sm$, $sm$Make verbs and pronouns agree in number$sm$, $sm$Distinguish possessive pronouns from contractions$sm$],
  'none', 330, 6, 'draft', false, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.lesson_contents (id, lesson_id, body) values ('31000000-0000-4000-8000-000000000014', '30000000-0000-4000-8000-000000000014', $sm$**Key idea**

Form, structure and sense questions check that the parts of a sentence fit together. The most frequent topics are subject-verb agreement, pronoun agreement, verb tense and possessives.

**Subject-verb agreement**

Find the true subject, then match the verb to it. Phrases and clauses between the subject and the verb do not change the subject.

"The list of approved books *is* posted online." The subject is "list," not "books."
"Each of the players *has* a locker." The word "each" is singular.

**Pronouns and possessives**

A pronoun must agree in number with the noun it replaces: "The committee announced *its* decision" (one committee), but "The researchers presented *their* results" (several researchers). Do not confuse possessives with contractions:

- its (belonging to it) and it's (it is)
- their (belonging to them) and they're (they are)
- whose (belonging to whom) and who's (who is)

**Worked example**

"The flock of migrating geese, which travels thousands of kilometers each year, ______ in the wetland every October."

The subject is "flock," which is singular, so the verb must be singular: "arrives," not "arrive." Ignore "geese" and "kilometers"; they are not the subject.

**Verb tense**

Look for time clues such as "last year," "currently" or "by 2030," and keep the tense consistent with the rest of the text.

**Common traps**

- Matching the verb to the nearest noun instead of the subject.
- Treating "the number of" as plural: "The number of entries is growing."
- Choosing "it's" because it looks possessive.

**Quick self-check**

Choose the correct verb: "The results of the survey (was / were) published last week." (Answer: were, because the subject is "results.")$sm$)
on conflict do nothing;

-- Lesson 15: Rhetorical synthesis: writing from notes (rhetorical_synthesis)
insert into public.lessons
  (id, course_id, skill_id, slug, title, description, objectives, video_provider,
   duration_seconds, position, status, is_free_preview, created_by)
values (
  '30000000-0000-4000-8000-000000000015', '20000000-0000-4000-8000-000000000002',
  (select id from public.skills where code = 'rhetorical_synthesis'),
  'rhetorical-synthesis', $sm$Rhetorical synthesis: writing from notes$sm$,
  $sm$Turn a stated goal into a checklist and choose the sentence from the notes that meets it.$sm$,
  array[$sm$Translate a rhetorical goal into a checklist$sm$, $sm$Select only the notes that serve the goal$sm$, $sm$Adjust for an audience that is unfamiliar with the topic$sm$],
  'none', 300, 7, 'draft', false, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.lesson_contents (id, lesson_id, body) values ('31000000-0000-4000-8000-000000000015', '30000000-0000-4000-8000-000000000015', $sm$**Key idea**

Rhetorical synthesis questions give you a student's bullet-point notes and a goal, such as "emphasize a similarity," "introduce the study to a new audience" or "present the conclusion." Usually every answer choice is accurate. Only one accomplishes the stated goal.

**A goal-first method**

- Read the goal in the question before reading the notes.
- Turn the goal into a checklist. "Emphasize a difference between X and Y" means the answer must mention both X and Y and show how they differ.
- Skim the notes only for the facts your checklist needs.
- Eliminate any choice that misses an item on the checklist, even if it is true.

**Worked example**

Notes: River A is 320 km long and flows north. River B is 540 km long and also flows north. Goal: emphasize a difference between the rivers.

- "Both rivers flow north." This is a similarity, so it misses the goal.
- "River B is 540 km long." This mentions only one river.
- "At 540 km, River B is 220 km longer than River A." This names both rivers and states one difference, so it is correct.

**Audience matters**

If the goal says the audience is unfamiliar with a person or an idea, the answer must identify or explain it, for example "the architect Maria Lopez" rather than just "Lopez."

**Common traps**

- Choosing the option with the most information. More detail is not better if it does not serve the goal.
- Choosing an option that matches the topic of the goal but not its task, such as describing methods when the goal is the conclusion.

**Quick self-check**

The goal is to "present the study's main finding." Does a sentence that only reports how many people were surveyed meet the goal? (Answer: no, because the method alone does not state the finding.)$sm$)
on conflict do nothing;

-- Lesson 16: Transitions: connecting ideas logically (transitions)
insert into public.lessons
  (id, course_id, skill_id, slug, title, description, objectives, video_provider,
   duration_seconds, position, status, is_free_preview, created_by)
values (
  '30000000-0000-4000-8000-000000000016', '20000000-0000-4000-8000-000000000002',
  (select id from public.skills where code = 'transitions'),
  'transitions', $sm$Transitions: connecting ideas logically$sm$,
  $sm$Identify the logical relationship between two sentences and choose the transition that expresses it.$sm$,
  array[$sm$Name the logical relationship between two ideas$sm$, $sm$Match common transitions to their relationships$sm$, $sm$Avoid transitions chosen for sound rather than logic$sm$],
  'none', 300, 8, 'draft', false, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.lesson_contents (id, lesson_id, body) values ('31000000-0000-4000-8000-000000000016', '30000000-0000-4000-8000-000000000016', $sm$**Key idea**

Transition questions ask which word or phrase best connects two sentences. The answer depends entirely on the logical relationship between the ideas, so identify that relationship before you look at the choices.

**Common relationships**

- Addition: additionally, moreover, furthermore, also
- Contrast: however, by contrast, conversely, on the other hand
- Cause and effect: therefore, as a result, consequently, thus
- Example: for example, for instance
- Concession (true despite a drawback): nonetheless, nevertheless, even so, still
- Sequence: first, next, finally, subsequently
- Restatement or detail: in other words, that is, specifically

**Worked example**

"The new bridge was expected to reduce traffic in the city center. ______ congestion downtown increased during the bridge's first year, as drivers from other districts began using the route."

The second sentence reports the opposite of what was expected, so a contrast transition such as "However" fits. "Therefore" would wrongly suggest that the expectation caused the congestion, and "For example" would wrongly present the congestion as an illustration of reduced traffic.

**Strategy**

Cover the choices, read both sentences, and state the relationship in plain words: "this contrasts with that" or "this adds another example." Then pick the choice from the matching group.

**Common traps**

- Choosing a transition because it sounds formal or academic.
- Reading only the sentence after the blank and ignoring the one before it.

**Quick self-check**

"Solar panels have become much cheaper. ______ more households are installing them." Which relationship fits? (Answer: cause and effect, such as "As a result.")$sm$)
on conflict do nothing;

update public.lessons
   set status = 'published'
 where status = 'draft'
   and id = any (array[
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000005',
  '30000000-0000-4000-8000-000000000006',
  '30000000-0000-4000-8000-000000000007',
  '30000000-0000-4000-8000-000000000008',
  '30000000-0000-4000-8000-000000000009',
  '30000000-0000-4000-8000-000000000010',
  '30000000-0000-4000-8000-000000000011',
  '30000000-0000-4000-8000-000000000012',
  '30000000-0000-4000-8000-000000000013',
  '30000000-0000-4000-8000-000000000014',
  '30000000-0000-4000-8000-000000000015',
  '30000000-0000-4000-8000-000000000016'
  ]::uuid[]);

-- -----------------------------------------------------------------------------
-- 5. Practice sets
-- -----------------------------------------------------------------------------
insert into public.practice_sets (id, title, description, subject_id, domain_id, skill_id, difficulty, status, position, created_by)
values ('40000000-0000-4000-8000-000000000001', $sm$Algebra · Mixed$sm$,
        $sm$Six original algebra questions from easy to medium: linear equations, linear functions, systems and inequalities.$sm$,
        (select id from public.subjects where code = 'math'),
        (select id from public.domains where code = 'algebra'),
        null, 'mixed', 'published', 1, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.practice_set_questions (id, practice_set_id, question_id, position) values
  ('41000000-0000-4000-8000-000000010001', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1),  -- A1 easy
  ('41000000-0000-4000-8000-000000010002', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 2),  -- A2 easy
  ('41000000-0000-4000-8000-000000010003', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 3),  -- A3 easy
  ('41000000-0000-4000-8000-000000010004', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 4),  -- A4 medium
  ('41000000-0000-4000-8000-000000010005', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 5),  -- A5 medium
  ('41000000-0000-4000-8000-000000010006', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 6)  -- A6 medium
on conflict do nothing;

insert into public.practice_sets (id, title, description, subject_id, domain_id, skill_id, difficulty, status, position, created_by)
values ('40000000-0000-4000-8000-000000000002', $sm$Advanced Math · Mixed$sm$,
        $sm$Seven original questions on quadratics, exponential models, nonlinear equations and equivalent expressions.$sm$,
        (select id from public.subjects where code = 'math'),
        (select id from public.domains where code = 'advanced_math'),
        null, 'mixed', 'published', 2, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.practice_set_questions (id, practice_set_id, question_id, position) values
  ('41000000-0000-4000-8000-000000020001', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000009', 1),  -- B1 easy
  ('41000000-0000-4000-8000-000000020002', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000010', 2),  -- B2 easy
  ('41000000-0000-4000-8000-000000020003', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000011', 3),  -- B3 easy
  ('41000000-0000-4000-8000-000000020004', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000012', 4),  -- B4 medium
  ('41000000-0000-4000-8000-000000020005', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000013', 5),  -- B5 medium
  ('41000000-0000-4000-8000-000000020006', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000014', 6),  -- B6 medium
  ('41000000-0000-4000-8000-000000020007', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000015', 7)  -- B7 hard
on conflict do nothing;

insert into public.practice_sets (id, title, description, subject_id, domain_id, skill_id, difficulty, status, position, created_by)
values ('40000000-0000-4000-8000-000000000003', $sm$Words in context · Mixed$sm$,
        $sm$Five original vocabulary-in-context questions, from clear context clues to less common word meanings.$sm$,
        (select id from public.subjects where code = 'reading_writing'),
        (select id from public.domains where code = 'craft_structure'),
        (select id from public.skills where code = 'words_in_context'), 'mixed', 'published', 3, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.practice_set_questions (id, practice_set_id, question_id, position) values
  ('41000000-0000-4000-8000-000000030001', '40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000033', 1),  -- R1 easy
  ('41000000-0000-4000-8000-000000030002', '40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000034', 2),  -- R2 easy
  ('41000000-0000-4000-8000-000000030003', '40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000035', 3),  -- R3 medium
  ('41000000-0000-4000-8000-000000030004', '40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000036', 4),  -- R4 medium
  ('41000000-0000-4000-8000-000000030005', '40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000037', 5)  -- R5 hard
on conflict do nothing;

insert into public.practice_sets (id, title, description, subject_id, domain_id, skill_id, difficulty, status, position, created_by)
values ('40000000-0000-4000-8000-000000000004', $sm$Boundaries · Mixed$sm$,
        $sm$Five original punctuation questions: semicolons, colons, appositives, interrupting phrases and conjunctive adverbs.$sm$,
        (select id from public.subjects where code = 'reading_writing'),
        (select id from public.domains where code = 'standard_english_conventions'),
        (select id from public.skills where code = 'boundaries'), 'mixed', 'published', 4, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.practice_set_questions (id, practice_set_id, question_id, position) values
  ('41000000-0000-4000-8000-000000040001', '40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000049', 1),  -- S1 easy
  ('41000000-0000-4000-8000-000000040002', '40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000050', 2),  -- S2 easy
  ('41000000-0000-4000-8000-000000040003', '40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000051', 3),  -- S3 medium
  ('41000000-0000-4000-8000-000000040004', '40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000052', 4),  -- S4 medium
  ('41000000-0000-4000-8000-000000040005', '40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000053', 5)  -- S5 hard
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 6. Demo mock exam (shortened: 8 questions per module, adaptive module 2)
-- -----------------------------------------------------------------------------
insert into public.mock_exams
  (id, slug, title, description, status, is_adaptive, routing_threshold, break_seconds, is_full_length, created_by)
values ('50000000-0000-4000-8000-000000000001', 'demo-mock-exam', 'Demo mock exam (shortened)',
        $sm$A shortened development exam built from original SAT MASTER sample questions: 8 questions per module instead of a full-length module, with an adaptive second module in each section. Use it to try the exam flow; its results are not meaningful for estimating a score.$sm$,
        'published', true, 0.600, 120, false, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into public.mock_exam_modules (id, mock_exam_id, section, module_number, variant, duration_seconds) values
  ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'reading_writing', 1, 'standard', 600),
  ('51000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'reading_writing', 2, 'easier', 600),
  ('51000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000001', 'reading_writing', 2, 'harder', 600),
  ('51000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000001', 'math', 1, 'standard', 720),
  ('51000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000001', 'math', 2, 'easier', 720),
  ('51000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-000000000001', 'math', 2, 'harder', 720)
on conflict do nothing;

-- reading_writing module 1 (standard)
insert into public.mock_exam_questions (id, module_id, question_id, position) values
  ('52000000-0000-4000-8000-000000010001', '51000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000038', 1),  -- R6 craft_structure easy
  ('52000000-0000-4000-8000-000000010002', '51000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000039', 2),  -- R7 craft_structure medium
  ('52000000-0000-4000-8000-000000010003', '51000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000047', 3),  -- I7 information_ideas easy
  ('52000000-0000-4000-8000-000000010004', '51000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000046', 4),  -- I6 information_ideas hard
  ('52000000-0000-4000-8000-000000010005', '51000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000054', 5),  -- S6 standard_english_conventions easy
  ('52000000-0000-4000-8000-000000010006', '51000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000055', 6),  -- S7 standard_english_conventions medium
  ('52000000-0000-4000-8000-000000010007', '51000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000061', 7),  -- X5 expression_of_ideas easy
  ('52000000-0000-4000-8000-000000010008', '51000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000064', 8)  -- X8 expression_of_ideas hard
on conflict do nothing;

-- reading_writing module 2 (easier)
insert into public.mock_exam_questions (id, module_id, question_id, position) values
  ('52000000-0000-4000-8000-000000020001', '51000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000033', 1),  -- R1 craft_structure easy
  ('52000000-0000-4000-8000-000000020002', '51000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000035', 2),  -- R3 craft_structure medium
  ('52000000-0000-4000-8000-000000020003', '51000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000041', 3),  -- I1 information_ideas easy
  ('52000000-0000-4000-8000-000000020004', '51000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000042', 4),  -- I2 information_ideas medium
  ('52000000-0000-4000-8000-000000020005', '51000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000049', 5),  -- S1 standard_english_conventions easy
  ('52000000-0000-4000-8000-000000020006', '51000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000051', 6),  -- S3 standard_english_conventions medium
  ('52000000-0000-4000-8000-000000020007', '51000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000057', 7),  -- X1 expression_of_ideas easy
  ('52000000-0000-4000-8000-000000020008', '51000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000058', 8)  -- X2 expression_of_ideas medium
on conflict do nothing;

-- reading_writing module 2 (harder)
insert into public.mock_exam_questions (id, module_id, question_id, position) values
  ('52000000-0000-4000-8000-000000030001', '51000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000036', 1),  -- R4 craft_structure medium
  ('52000000-0000-4000-8000-000000030002', '51000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000037', 2),  -- R5 craft_structure hard
  ('52000000-0000-4000-8000-000000030003', '51000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000045', 3),  -- I5 information_ideas medium
  ('52000000-0000-4000-8000-000000030004', '51000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000044', 4),  -- I4 information_ideas hard
  ('52000000-0000-4000-8000-000000030005', '51000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000052', 5),  -- S4 standard_english_conventions medium
  ('52000000-0000-4000-8000-000000030006', '51000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000053', 6),  -- S5 standard_english_conventions hard
  ('52000000-0000-4000-8000-000000030007', '51000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000062', 7),  -- X6 expression_of_ideas medium
  ('52000000-0000-4000-8000-000000030008', '51000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000060', 8)  -- X4 expression_of_ideas hard
on conflict do nothing;

-- math module 1 (standard)
insert into public.mock_exam_questions (id, module_id, question_id, position) values
  ('52000000-0000-4000-8000-000000040001', '51000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 1),  -- A3 algebra easy
  ('52000000-0000-4000-8000-000000040002', '51000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000011', 2),  -- B3 advanced_math easy
  ('52000000-0000-4000-8000-000000040003', '51000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000019', 3),  -- C3 problem_solving_data_analysis easy
  ('52000000-0000-4000-8000-000000040004', '51000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000027', 4),  -- D3 geometry_trigonometry easy
  ('52000000-0000-4000-8000-000000040005', '51000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000006', 5),  -- A6 algebra medium
  ('52000000-0000-4000-8000-000000040006', '51000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000022', 6),  -- C6 problem_solving_data_analysis medium
  ('52000000-0000-4000-8000-000000040007', '51000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000016', 7),  -- B8 advanced_math hard
  ('52000000-0000-4000-8000-000000040008', '51000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000032', 8)  -- D8 geometry_trigonometry hard
on conflict do nothing;

-- math module 2 (easier)
insert into public.mock_exam_questions (id, module_id, question_id, position) values
  ('52000000-0000-4000-8000-000000050001', '51000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 1),  -- A1 algebra easy
  ('52000000-0000-4000-8000-000000050002', '51000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000009', 2),  -- B1 advanced_math easy
  ('52000000-0000-4000-8000-000000050003', '51000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000017', 3),  -- C1 problem_solving_data_analysis easy
  ('52000000-0000-4000-8000-000000050004', '51000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000025', 4),  -- D1 geometry_trigonometry easy
  ('52000000-0000-4000-8000-000000050005', '51000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', 5),  -- A4 algebra medium
  ('52000000-0000-4000-8000-000000050006', '51000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000012', 6),  -- B4 advanced_math medium
  ('52000000-0000-4000-8000-000000050007', '51000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000020', 7),  -- C4 problem_solving_data_analysis medium
  ('52000000-0000-4000-8000-000000050008', '51000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000028', 8)  -- D4 geometry_trigonometry medium
on conflict do nothing;

-- math module 2 (harder)
insert into public.mock_exam_questions (id, module_id, question_id, position) values
  ('52000000-0000-4000-8000-000000060001', '51000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000005', 1),  -- A5 algebra medium
  ('52000000-0000-4000-8000-000000060002', '51000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000013', 2),  -- B5 advanced_math medium
  ('52000000-0000-4000-8000-000000060003', '51000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000021', 3),  -- C5 problem_solving_data_analysis medium
  ('52000000-0000-4000-8000-000000060004', '51000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000029', 4),  -- D5 geometry_trigonometry medium
  ('52000000-0000-4000-8000-000000060005', '51000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000007', 5),  -- A7 algebra hard
  ('52000000-0000-4000-8000-000000060006', '51000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000015', 6),  -- B7 advanced_math hard
  ('52000000-0000-4000-8000-000000060007', '51000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000023', 7),  -- C7 problem_solving_data_analysis hard
  ('52000000-0000-4000-8000-000000060008', '51000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000031', 8)  -- D7 geometry_trigonometry hard
on conflict do nothing;

commit;
