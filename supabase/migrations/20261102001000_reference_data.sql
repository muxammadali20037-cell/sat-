-- SAT MASTER · 0010 · Reference data (safe for production)
-- The Digital SAT content framework, initial plan configuration (pricing hypotheses —
-- editable in /admin), platform defaults and diagnostic definitions.
-- No student activity, revenue, or questions here: sample questions live in supabase/seed/dev_seed.sql.

insert into public.subjects (code, name, description, position) values
  ('math', 'Math', 'Digital SAT Math: 44 questions in two 35-minute modules. Calculator allowed throughout.', 1),
  ('reading_writing', 'Reading and Writing', 'Digital SAT Reading and Writing: 54 short-passage questions in two 32-minute modules.', 2);

with s as (select id, code from public.subjects)
insert into public.domains (subject_id, code, name, description, weight_percent, position)
select s.id, d.code, d.name, d.description, d.weight, d.pos
from (values
  ('math','algebra','Algebra','Linear equations, functions, systems and inequalities.',35,1),
  ('math','advanced_math','Advanced Math','Nonlinear functions, equations and equivalent expressions.',35,2),
  ('math','problem_solving_data_analysis','Problem-Solving and Data Analysis','Ratios, percentages, data, probability and statistical reasoning.',15,3),
  ('math','geometry_trigonometry','Geometry and Trigonometry','Area, volume, angles, triangles, trigonometry and circles.',15,4),
  ('reading_writing','craft_structure','Craft and Structure','Vocabulary in context, text structure and purpose, cross-text connections.',28,1),
  ('reading_writing','information_ideas','Information and Ideas','Central ideas, evidence (textual and quantitative) and inferences.',26,2),
  ('reading_writing','standard_english_conventions','Standard English Conventions','Sentence boundaries, form, structure and sense.',26,3),
  ('reading_writing','expression_of_ideas','Expression of Ideas','Rhetorical synthesis and transitions.',20,4)
) as d(subject_code, code, name, description, weight, pos)
join s on s.code = d.subject_code;

with dm as (select id, code from public.domains)
insert into public.skills (domain_id, code, name, description, position)
select dm.id, k.code, k.name, k.description, k.pos
from (values
  ('algebra','linear_equations_one_variable','Linear equations in one variable','Create, solve and interpret linear equations in one variable.',1),
  ('algebra','linear_functions','Linear functions','Interpret and use linear functions in context and in tables, graphs and equations.',2),
  ('algebra','linear_equations_two_variables','Linear equations in two variables','Create, interpret and graph linear equations in two variables.',3),
  ('algebra','systems_linear_equations','Systems of two linear equations in two variables','Solve and interpret systems algebraically and graphically.',4),
  ('algebra','linear_inequalities','Linear inequalities in one or two variables','Create, solve and interpret linear inequalities.',5),
  ('advanced_math','nonlinear_functions','Nonlinear functions','Quadratic, exponential, polynomial, rational and radical functions.',1),
  ('advanced_math','nonlinear_equations_systems','Nonlinear equations in one variable and systems of equations in two variables','Solve nonlinear equations and systems.',2),
  ('advanced_math','equivalent_expressions','Equivalent expressions','Rewrite and identify equivalent algebraic expressions.',3),
  ('problem_solving_data_analysis','ratios_rates_proportions_units','Ratios, rates, proportional relationships, and units','Solve problems with ratios, rates and unit conversion.',1),
  ('problem_solving_data_analysis','percentages','Percentages','Percent change, percent of a quantity and related reasoning.',2),
  ('problem_solving_data_analysis','one_variable_data','One-variable data: distributions and measures of center and spread','Mean, median, range, standard deviation and distributions.',3),
  ('problem_solving_data_analysis','two_variable_data','Two-variable data: models and scatterplots','Interpret scatterplots and linear, quadratic and exponential models.',4),
  ('problem_solving_data_analysis','probability_conditional','Probability and conditional probability','Compute probabilities from tables and descriptions.',5),
  ('problem_solving_data_analysis','inference_margin_of_error','Inference from sample statistics and margin of error','Reason about populations from samples.',6),
  ('problem_solving_data_analysis','evaluating_statistical_claims','Evaluating statistical claims: observational studies and experiments','Judge conclusions from study design.',7),
  ('geometry_trigonometry','area_volume','Area and volume','Area, surface area and volume of figures.',1),
  ('geometry_trigonometry','lines_angles_triangles','Lines, angles, and triangles','Angle relationships, similarity and congruence.',2),
  ('geometry_trigonometry','right_triangles_trigonometry','Right triangles and trigonometry','Pythagorean theorem, special right triangles, sine, cosine, tangent.',3),
  ('geometry_trigonometry','circles','Circles','Arc length, sectors, central angles and circle equations.',4),
  ('craft_structure','words_in_context','Words in context','Determine the meaning of a word or phrase as used in a text.',1),
  ('craft_structure','text_structure_purpose','Text structure and purpose','Analyze the structure and purpose of a text.',2),
  ('craft_structure','cross_text_connections','Cross-text connections','Relate ideas across two texts on the same topic.',3),
  ('information_ideas','central_ideas_details','Central ideas and details','Identify central ideas and key supporting details.',1),
  ('information_ideas','command_of_evidence_textual','Command of evidence: textual','Choose textual evidence that supports a claim.',2),
  ('information_ideas','command_of_evidence_quantitative','Command of evidence: quantitative','Use data from tables and graphs to support a claim.',3),
  ('information_ideas','inferences','Inferences','Draw a logical conclusion from a text.',4),
  ('standard_english_conventions','boundaries','Boundaries','Punctuation and sentence boundaries: clauses, run-ons, fragments.',1),
  ('standard_english_conventions','form_structure_sense','Form, structure, and sense','Agreement, verb forms, pronouns, modifiers and possessives.',2),
  ('expression_of_ideas','rhetorical_synthesis','Rhetorical synthesis','Use notes to accomplish a stated rhetorical goal.',1),
  ('expression_of_ideas','transitions','Transitions','Choose the transition that best connects ideas.',2)
) as k(domain_code, code, name, description, pos)
join dm on dm.code = k.domain_code;

-- ---------------------------------------------------------------------------
-- Plans (initial pricing hypotheses; UZS minor unit = tiyin)
-- ---------------------------------------------------------------------------
insert into public.plans (code, name, description, price_minor, currency, interval_months, highlight, position) values
  ('free',    'Free',    'Diagnostic test, limited daily practice and a taste of the AI tutor.', 0, 'UZS', 1, false, 0),
  ('starter', 'Starter', 'Full video course, daily practice, study plan and one mock exam a month.', 9900000, 'UZS', 1, false, 1),
  ('pro',     'Pro',     'Unlimited practice, more AI tutoring and four mock exams a month.', 19900000, 'UZS', 1, true, 2),
  ('premium', 'Premium', 'Everything unlimited with the highest AI tutor allowance.', 39900000, 'UZS', 1, false, 3);

insert into public.plan_prices (plan_id, currency, amount_minor)
select p.id, v.currency, v.amount from public.plans p
join (values ('starter','USD',900), ('pro','USD',1900), ('premium','USD',3900)) as v(code, currency, amount)
  on v.code = p.code;

insert into public.plan_features (plan_id, feature_key, is_enabled, limit_value)
select p.id, f.feature_key, f.is_enabled, f.limit_value
from public.plans p
join (values
  ('free','diagnostic',true,null), ('free','video_lessons',false,null), ('free','practice_questions_daily',true,20),
  ('free','ai_requests_daily',true,3), ('free','mock_exams_monthly',false,0), ('free','analytics_full',false,null),
  ('free','study_plan',false,null),
  ('starter','diagnostic',true,null), ('starter','video_lessons',true,null), ('starter','practice_questions_daily',true,100),
  ('starter','ai_requests_daily',true,15), ('starter','mock_exams_monthly',true,1), ('starter','analytics_full',true,null),
  ('starter','study_plan',true,null),
  ('pro','diagnostic',true,null), ('pro','video_lessons',true,null), ('pro','practice_questions_daily',true,null),
  ('pro','ai_requests_daily',true,50), ('pro','mock_exams_monthly',true,4), ('pro','analytics_full',true,null),
  ('pro','study_plan',true,null),
  ('premium','diagnostic',true,null), ('premium','video_lessons',true,null), ('premium','practice_questions_daily',true,null),
  ('premium','ai_requests_daily',true,150), ('premium','mock_exams_monthly',true,null), ('premium','analytics_full',true,null),
  ('premium','study_plan',true,null)
) as f(plan_code, feature_key, is_enabled, limit_value) on f.plan_code = p.code;

-- ---------------------------------------------------------------------------
-- Platform defaults
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value, description, is_public) values
  ('billing.grace_period_days', '3', 'Days of continued access after a subscription period ends without renewal.', true),
  ('billing.renewal_reminder_days', '3', 'Days before period end to notify students about renewal.', false),
  ('practice.max_questions_per_session', '30', 'Upper bound for a custom practice session.', true),
  ('exams.answer_grace_seconds', '5', 'Network grace after a module deadline during which answers are still accepted.', false),
  ('lessons.completion_ratio', '0.9', 'Share of a lesson that must be watched (not skipped) to complete it.', true),
  ('ai.rate_limit_per_minute', '10', 'AI tutor requests allowed per student per minute (burst limit).', false),
  ('ai.pricing_usd_per_mtok', '{"claude-sonnet-5-5": {"input": 3, "output": 15}, "claude-haiku-5-5": {"input": 1, "output": 5}}',
     'USD per million tokens used for AI cost tracking. UNVERIFIED DEFAULTS — set from current Anthropic pricing before launch.', false),
  ('contact.support_email', '""', 'Public support email shown on the contact page (empty = hidden).', true);

-- ---------------------------------------------------------------------------
-- Diagnostic definitions (questions are drawn from the published bank at start time)
-- ---------------------------------------------------------------------------
insert into public.diagnostic_tests (slug, title, description, subject_scope, questions_per_domain, duration_seconds, status) values
  ('full-diagnostic', 'Full diagnostic', 'Both sections, two questions per domain. About 25 minutes.', 'both', 2, 1500, 'published'),
  ('math-diagnostic', 'Math diagnostic', 'Three questions from each Math domain. About 20 minutes.', 'math', 3, 1200, 'published'),
  ('reading-writing-diagnostic', 'Reading and Writing diagnostic', 'Three questions from each Reading and Writing domain. About 15 minutes.', 'reading_writing', 3, 900, 'published');
