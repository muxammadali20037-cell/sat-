-- SAT MASTER · 0016 · Telegram Mini App accounts
-- One Telegram account per SAT MASTER account and vice versa. Rows are written only by the server
-- (service role) after validating Telegram's signed launch data; students can read their own link.
-- No payment data lives here: the Mini App never sells anything (Telegram requires Stars for
-- digital goods inside bots and Mini Apps, so subscriptions are bought on the website).

create table public.telegram_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  telegram_user_id bigint not null unique check (telegram_user_id > 0),
  username text check (char_length(username) <= 64),
  first_name text check (char_length(first_name) <= 128),
  last_name text check (char_length(last_name) <= 128),
  language_code text check (char_length(language_code) <= 16),
  -- 'mini_app': the account was created from Telegram; 'link': an existing account was connected.
  created_via text not null check (created_via in ('mini_app', 'link')),
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.telegram_accounts enable row level security;
revoke all on public.telegram_accounts from anon, authenticated;
grant select on public.telegram_accounts to authenticated;
grant all on public.telegram_accounts to service_role;

create policy telegram_accounts_select_own on public.telegram_accounts
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.can_view_students()));
