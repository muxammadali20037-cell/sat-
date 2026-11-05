-- SAT MASTER · 0030 · Daily short drills in Telegram
--
-- A student who connected Telegram can turn on a daily drill: the bot sends five short items one by
-- one (three word meanings, preferring the student's "My words", and two short published SAT
-- questions) and grades each answer from its buttons.
--   * telegram_accounts.drills_enabled / drills_last_sent_on: the student's choice and the last day sent.
--   * telegram_drill_items: one row per item per day. The correct choice lives only here and only the
--     server reads this table: clients have no access at all.
-- Additive only: 2 new columns (default off) and 1 new table.

alter table public.telegram_accounts
  add column drills_enabled boolean not null default false,
  add column drills_last_sent_on date;

create table public.telegram_drill_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  drill_date date not null,
  position smallint not null check (position between 1 and 10),
  kind text not null check (kind in ('word', 'question')),
  ref text not null check (char_length(ref) between 1 and 80),
  prompt text not null check (char_length(prompt) between 1 and 3500),
  choices jsonb not null check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) between 2 and 4),
  correct_index smallint not null check (correct_index between 0 and 3),
  explanation text check (char_length(explanation) <= 1200),
  sent_at timestamptz,
  message_id bigint,
  answered_index smallint check (answered_index between 0 and 3),
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, drill_date, position)
);
create index telegram_drill_items_user_idx on public.telegram_drill_items (user_id, drill_date desc);

alter table public.telegram_drill_items enable row level security;
revoke all on public.telegram_drill_items from anon, authenticated;
grant all on public.telegram_drill_items to service_role;
