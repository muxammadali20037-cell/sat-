-- SAT MASTER · 0017 · Sign in on the website with Telegram, and phone numbers shared in Telegram
-- Flow: the website creates a request and opens t.me/<bot>?start=login_<token>. The student presses
-- Start, then "Confirm" under a message that repeats the 4-digit code shown on the website. The
-- website (same browser, proven by an httpOnly cookie) then signs in or connects the account.
-- Only hashes of the link token and of the browser cookie are stored. Server only: no client access.

create table public.telegram_login_requests (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (char_length(token_hash) = 64),
  browser_hash text not null check (char_length(browser_hash) = 64),
  -- 'sign_in': sign in or register; 'link': connect Telegram to the signed-in account link_user_id.
  intent text not null check (intent in ('sign_in', 'link')),
  link_user_id uuid references public.profiles (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4}$'),
  client_hint text not null default '' check (char_length(client_hint) <= 120),
  next_path text check (char_length(next_path) <= 300),
  status text not null default 'pending' check (status in ('pending', 'opened', 'approved', 'denied', 'consumed')),
  telegram_user_id bigint,
  telegram_profile jsonb,
  chat_id bigint,
  bot_message_id bigint,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  approved_at timestamptz,
  consumed_at timestamptz,
  check (intent <> 'link' or link_user_id is not null)
);
create index telegram_login_requests_created_idx on public.telegram_login_requests (created_at);

alter table public.telegram_login_requests enable row level security;
revoke all on public.telegram_login_requests from anon, authenticated;
grant all on public.telegram_login_requests to service_role;

-- Phone number the student shared with the bot (Telegram's "share contact": the number belongs to
-- that Telegram account). Optional; used to reach the student, never to sign in by itself.
alter table public.telegram_accounts add column phone_number text check (phone_number ~ '^\+[0-9]{7,15}$');
alter table public.telegram_accounts add column phone_shared_at timestamptz;
