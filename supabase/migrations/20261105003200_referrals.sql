-- SAT MASTER · 0032 · Invite a friend (referrals) with optional free Pro days
--
-- Each student gets a personal invite link (/r/<code>). A friend who opens it and creates a NEW
-- account is linked to the inviter. The invite counts ("qualifies") only after the friend finishes
-- the diagnostic test, so empty or fake sign-ups earn nothing.
-- Reward: free days of a paid plan, set by an admin in Settings. Both values start at 0, so NO
-- reward is given until an admin sets them; a monthly cap per inviter limits abuse. Rewards extend
-- access without any payment (no revenue is recorded) and every grant is written to the audit log.
-- Clients may only SELECT their own rows; every write goes through the server. Rows are never
-- deleted. Additive only: 2 new tables + 4 settings rows.

create table public.referral_codes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null unique check (code ~ '^[a-z0-9]{8}$'),
  created_at timestamptz not null default now()
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles (id) on delete restrict,
  referred_id uuid not null unique references public.profiles (id) on delete restrict,
  code text not null,
  status text not null default 'pending' check (status in ('pending','qualified','rewarded')),
  qualified_at timestamptz,
  referrer_days integer not null default 0 check (referrer_days between 0 and 366),
  friend_days integer not null default 0 check (friend_days between 0 and 366),
  rewarded_at timestamptz,
  no_reward_reason text check (no_reward_reason in ('rewards_off','monthly_cap')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (referrer_id <> referred_id)
);
create index referrals_referrer_idx on public.referrals (referrer_id, created_at desc);
create trigger referrals_set_updated_at before update on public.referrals
  for each row execute function public.set_updated_at();
create trigger referrals_no_delete before delete on public.referrals
  for each row execute function public.prevent_delete();

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
revoke all on public.referral_codes from anon, authenticated;
revoke all on public.referrals from anon, authenticated;
grant select on public.referral_codes to authenticated;
grant select on public.referrals to authenticated;
grant all on public.referral_codes to service_role;
grant all on public.referrals to service_role;

create policy referral_codes_read_own on public.referral_codes for select to authenticated
  using (user_id = (select auth.uid()));
create policy referrals_read_own on public.referrals for select to authenticated
  using (referrer_id = (select auth.uid()) or referred_id = (select auth.uid()));

insert into public.platform_settings (key, value, description, is_public) values
  ('referrals.referrer_days', '0', 'Free days of the referral plan given to a student when an invited friend finishes the diagnostic. 0 = no reward.', true),
  ('referrals.friend_days', '0', 'Free days of the referral plan given to the invited friend when they finish the diagnostic. 0 = no reward.', true),
  ('referrals.plan_code', '"pro"', 'Plan whose access referral rewards extend (an active paid plan code).', false),
  ('referrals.monthly_cap', '10', 'Most invites per student per calendar month (UTC) that can earn a reward.', true)
on conflict (key) do nothing;
