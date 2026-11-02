-- SAT MASTER · seed / content integrity checks (read-only).
-- Run after loading supabase/seed/dev_seed.sql:
--   psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 54329 -U postgres -d <db> -f scripts/db/check-seed.sql
-- Every problem found is collected and reported in one RAISE EXCEPTION, so psql exits non-zero.
-- The generic checks (sections A–F) apply to any database; section G checks the dev seed itself.

\set QUIET on
\pset footer off

do $$
declare
  v_problems text[] := '{}';
  r record;
  v_seed_author constant uuid := '00000000-0000-4000-8000-000000000001';
  v_exam_id uuid;
begin
  -- A. Every published question is complete (same rule as the publish guard).
  for r in select q.id from public.questions q
            where q.status = 'published' and not public.question_is_complete(q.id) loop
    v_problems := v_problems || format('question %s is published but incomplete', r.id);
  end loop;

  -- A2. Multiple choice: exactly 4 options labelled A-D, exactly one correct; no SPR answers.
  for r in select q.id,
                  (select count(*) from public.answer_options o where o.question_id = q.id) as n_opt,
                  (select count(*) from public.answer_options o where o.question_id = q.id and o.is_correct) as n_ok,
                  (select count(distinct o.label) from public.answer_options o where o.question_id = q.id) as n_lbl,
                  (select count(*) from public.question_spr_answers s where s.question_id = q.id) as n_spr
             from public.questions q
            where q.status = 'published' and q.question_type = 'multiple_choice' loop
    if r.n_opt <> 4 or r.n_ok <> 1 or r.n_lbl <> 4 or r.n_spr <> 0 then
      v_problems := v_problems || format('MC question %s: %s options, %s correct, %s labels, %s SPR answers',
                                         r.id, r.n_opt, r.n_ok, r.n_lbl, r.n_spr);
    end if;
  end loop;

  -- A3. SPR answers follow the Digital SAT entry rules (5 chars, 6 with a minus sign).
  for r in select s.question_id, s.value
             from public.question_spr_answers s
             join public.questions q on q.id = s.question_id
            where q.status = 'published'
              and (s.value !~ '^-?(\d+(\.\d*)?|\.\d+|\d+/\d+)$'
                   or char_length(s.value) > case when s.value like '-%' then 6 else 5 end
                   or s.value ~ '/0+$') loop
    v_problems := v_problems || format('SPR answer %L of question %s is not a valid entry', r.value, r.question_id);
  end loop;
  for r in select q.id from public.questions q
            where q.status = 'published' and q.question_type = 'student_produced_response'
              and (exists (select 1 from public.answer_options o where o.question_id = q.id)
                   or not exists (select 1 from public.question_spr_answers s where s.question_id = q.id)) loop
    v_problems := v_problems || format('SPR question %s has options or no accepted answers', r.id);
  end loop;

  -- A4. Passage-based questions carry their passage; text fields are non-empty.
  for r in select q.id from public.questions q
            where q.status = 'published'
              and (btrim(q.stem) = '' or (q.stimulus_type = 'passage' and btrim(coalesce(q.passage, '')) = '')) loop
    v_problems := v_problems || format('question %s has an empty stem or passage', r.id);
  end loop;

  -- B. Bank depth: at least 8 published questions per domain.
  for r in select d.code, count(q.id) as n
             from public.domains d
             left join public.questions q on q.domain_id = d.id and q.status = 'published'
            group by d.code loop
    if r.n < 8 then
      v_problems := v_problems || format('domain %s has only %s published questions (need >= 8)', r.code, r.n);
    end if;
  end loop;

  -- B2. Every published diagnostic can be assembled from the published bank.
  for r in select t.slug, d.code, t.questions_per_domain,
                  (select count(*) from public.questions q where q.domain_id = d.id and q.status = 'published') as n
             from public.diagnostic_tests t
             join public.subjects s on t.subject_scope in (s.code, 'both')
             join public.domains d on d.subject_id = s.id
            where t.status = 'published' loop
    if r.n < r.questions_per_domain then
      v_problems := v_problems || format('diagnostic %s needs %s questions in %s, bank has %s',
                                         r.slug, r.questions_per_domain, r.code, r.n);
    end if;
  end loop;

  -- C. Demo mock exam structure.
  select id into v_exam_id from public.mock_exams where slug = 'demo-mock-exam' and status = 'published';
  if v_exam_id is null then
    v_problems := v_problems || 'published mock exam demo-mock-exam not found'::text;
  else
    if (select count(*) from public.mock_exam_modules where mock_exam_id = v_exam_id) <> 6
       or exists (select 1 from (values ('reading_writing',1,'standard'), ('reading_writing',2,'easier'),
                                        ('reading_writing',2,'harder'), ('math',1,'standard'),
                                        ('math',2,'easier'), ('math',2,'harder')) as e(sec, num, var)
                   where not exists (select 1 from public.mock_exam_modules m
                                      where m.mock_exam_id = v_exam_id and m.section = e.sec
                                        and m.module_number = e.num and m.variant = e.var)) then
      v_problems := v_problems || 'demo-mock-exam must have exactly RW/Math x (M1 standard, M2 easier, M2 harder)'::text;
    end if;
    for r in select m.section, m.module_number, m.variant,
                    count(mq.id) as n, count(distinct mq.question_id) as n_distinct,
                    count(distinct mq.position) filter (where mq.position between 1 and 8) as n_pos,
                    count(*) filter (where q.status <> 'published') as n_unpublished,
                    count(*) filter (where s.code <> m.section) as n_wrong_subject,
                    count(*) filter (where m.variant = 'easier' and q.difficulty = 'hard') as n_too_hard,
                    count(*) filter (where m.variant = 'harder' and q.difficulty = 'easy') as n_too_easy,
                    count(distinct q.domain_id) as n_domains
               from public.mock_exam_modules m
               left join public.mock_exam_questions mq on mq.module_id = m.id
               left join public.questions q on q.id = mq.question_id
               left join public.subjects s on s.id = q.subject_id
              where m.mock_exam_id = v_exam_id
              group by m.id, m.section, m.module_number, m.variant loop
      if r.n <> 8 or r.n_distinct <> 8 or r.n_pos <> 8 then
        v_problems := v_problems || format('demo exam %s M%s %s: %s questions, %s distinct, %s valid positions (need 8/8/8)',
                                           r.section, r.module_number, r.variant, r.n, r.n_distinct, r.n_pos);
      end if;
      if r.n_unpublished > 0 or r.n_wrong_subject > 0 then
        v_problems := v_problems || format('demo exam %s M%s %s: %s unpublished, %s from the wrong subject',
                                           r.section, r.module_number, r.variant, r.n_unpublished, r.n_wrong_subject);
      end if;
      if r.n_too_hard > 0 or r.n_too_easy > 0 then
        v_problems := v_problems || format('demo exam %s M2 %s has questions outside its difficulty band', r.section, r.variant);
      end if;
      if r.module_number = 1 and r.n_domains < 4 then
        v_problems := v_problems || format('demo exam %s M1 covers only %s domains', r.section, r.n_domains);
      end if;
    end loop;
    for r in select m.section, mq.question_id, count(*) as n
               from public.mock_exam_questions mq
               join public.mock_exam_modules m on m.id = mq.module_id
              where m.mock_exam_id = v_exam_id
              group by m.section, mq.question_id
             having count(*) > 1 loop
      v_problems := v_problems || format('demo exam: question %s appears in %s %s modules', r.question_id, r.n, r.section);
    end loop;
  end if;

  -- D. Published text lessons have substantial notes (~180+ words) and a consistent skill.
  for r in select l.slug, char_length(coalesce(c.body, '')) as chars,
                  coalesce(array_length(regexp_split_to_array(btrim(coalesce(c.body, '')), '\s+'), 1), 0) as words
             from public.lessons l
             left join public.lesson_contents c on c.lesson_id = l.id
            where l.status = 'published' and l.video_provider = 'none' loop
    if r.chars < 900 or r.words < 180 then
      v_problems := v_problems || format('lesson %s notes too short (%s chars, %s words)', r.slug, r.chars, r.words);
    end if;
  end loop;
  for r in select l.slug from public.lessons l
             join public.courses co on co.id = l.course_id
             join public.skills sk on sk.id = l.skill_id
             join public.domains d on d.id = sk.domain_id
            where d.subject_id <> co.subject_id loop
    v_problems := v_problems || format('lesson %s is mapped to a skill from another subject', r.slug);
  end loop;

  -- E. Practice sets: every question in a published set is published and matches the set's scope.
  for r in select ps.title, q.id as question_id, q.status
             from public.practice_sets ps
             join public.practice_set_questions psq on psq.practice_set_id = ps.id
             join public.questions q on q.id = psq.question_id
            where ps.status = 'published'
              and (q.status <> 'published' or q.subject_id <> ps.subject_id
                   or (ps.domain_id is not null and q.domain_id <> ps.domain_id)
                   or (ps.skill_id is not null and q.skill_id <> ps.skill_id)) loop
    v_problems := v_problems || format('practice set %L contains question %s (%s) outside its scope or unpublished',
                                       r.title, r.question_id, r.status);
  end loop;
  for r in select ps.title, count(psq.id) as n
             from public.practice_sets ps
             left join public.practice_set_questions psq on psq.practice_set_id = ps.id
            where ps.status = 'published'
            group by ps.id, ps.title
           having count(psq.id) < 1 loop
    v_problems := v_problems || format('practice set %L is published but empty', r.title);
  end loop;

  -- F. Published courses are reachable: each has at least one published lesson.
  for r in select co.slug from public.courses co
            where co.status = 'published'
              and not exists (select 1 from public.lessons l where l.course_id = co.id and l.status = 'published') loop
    v_problems := v_problems || format('course %s is published but has no published lessons', r.slug);
  end loop;

  -- G. Dev seed specifics (skipped automatically when the seed author is absent).
  if exists (select 1 from public.profiles where id = v_seed_author) then
    if (select role from public.profiles where id = v_seed_author) <> 'CONTENT_EDITOR' then
      v_problems := v_problems || 'seed author profile is not CONTENT_EDITOR'::text;
    end if;
    if (select count(*) from public.questions where created_by = v_seed_author and status = 'published') < 64 then
      v_problems := v_problems || 'fewer than 64 published seed questions'::text;
    end if;
    if exists (select 1 from public.domains d
                where (select count(*) from public.questions q
                        where q.domain_id = d.id and q.created_by = v_seed_author and q.status = 'published') < 8) then
      v_problems := v_problems || 'some domain has fewer than 8 published seed questions'::text;
    end if;
    if (select count(*) from public.questions q join public.subjects s on s.id = q.subject_id
         where q.created_by = v_seed_author and s.code = 'math'
           and q.question_type = 'student_produced_response' and q.status = 'published') < 7 then
      v_problems := v_problems || 'fewer than 7 published seed Math SPR questions'::text;
    end if;
    if (select count(*) from public.question_explanations e join public.questions q on q.id = e.question_id
         where q.created_by = v_seed_author and e.locale = 'uz') < 20 then
      v_problems := v_problems || 'fewer than 20 seed questions have Uzbek explanations'::text;
    end if;
    if exists (select 1 from public.questions q
                where q.created_by = v_seed_author
                  and (q.reviewed_by is distinct from v_seed_author or q.reviewed_at is null or q.published_at is null)) then
      v_problems := v_problems || 'some seed questions lack review/publish metadata'::text;
    end if;
    if (select count(*) from public.courses
         where slug in ('digital-sat-math-core', 'digital-sat-reading-writing-core') and status = 'published') <> 2 then
      v_problems := v_problems || 'seed courses missing or unpublished'::text;
    end if;
    if (select count(*) from public.lessons l join public.courses co on co.id = l.course_id
         where co.slug in ('digital-sat-math-core', 'digital-sat-reading-writing-core') and l.status = 'published') < 16 then
      v_problems := v_problems || 'fewer than 16 published seed lessons'::text;
    end if;
    for r in select co.slug from public.courses co
              where co.slug in ('digital-sat-math-core', 'digital-sat-reading-writing-core')
                and not exists (select 1 from public.lessons l where l.course_id = co.id and l.position = 1
                                   and l.is_free_preview and l.status = 'published') loop
      v_problems := v_problems || format('first lesson of %s is not a published free preview', r.slug);
    end loop;
    if exists (select 1 from public.domains d
                where (select count(*) from public.lessons l
                         join public.skills sk on sk.id = l.skill_id
                        where sk.domain_id = d.id and l.status = 'published'
                          and l.created_by = v_seed_author) < 2) then
      v_problems := v_problems || 'some domain has fewer than 2 published seed lessons'::text;
    end if;
    if (select count(*) from public.practice_sets ps
         where ps.created_by = v_seed_author and ps.status = 'published'
           and (select count(*) from public.practice_set_questions psq where psq.practice_set_id = ps.id) between 5 and 8) < 4 then
      v_problems := v_problems || 'fewer than 4 published seed practice sets with 5-8 questions'::text;
    end if;
  end if;

  if cardinality(v_problems) > 0 then
    raise exception E'Seed check failed (% problems):\n  - %', cardinality(v_problems), array_to_string(v_problems, E'\n  - ');
  end if;
  raise notice 'Seed check passed.';
end $$;

-- Summary (informational)
\echo 'Published questions by subject / domain / difficulty / type:'
select s.code as subject, d.code as domain,
       count(*) filter (where q.difficulty = 'easy') as easy,
       count(*) filter (where q.difficulty = 'medium') as medium,
       count(*) filter (where q.difficulty = 'hard') as hard,
       count(*) filter (where q.question_type = 'multiple_choice') as mc,
       count(*) filter (where q.question_type = 'student_produced_response') as spr,
       count(e.id) as uz_expl,
       count(*) as total
  from public.questions q
  join public.subjects s on s.id = q.subject_id
  join public.domains d on d.id = q.domain_id
  left join public.question_explanations e on e.question_id = q.id and e.locale = 'uz'
 where q.status = 'published'
 group by s.code, s.position, d.code, d.position
 order by s.position, d.position;

\echo 'Content totals:'
select (select count(*) from public.courses where status = 'published') as courses,
       (select count(*) from public.lessons where status = 'published') as lessons,
       (select count(*) from public.lessons where status = 'published' and is_free_preview) as free_preview_lessons,
       (select count(*) from public.practice_sets where status = 'published') as practice_sets,
       (select count(*) from public.mock_exams where status = 'published') as mock_exams,
       (select count(*) from public.mock_exam_questions mq join public.mock_exam_modules m on m.id = mq.module_id
          join public.mock_exams x on x.id = m.mock_exam_id where x.slug = 'demo-mock-exam') as demo_exam_slots;
