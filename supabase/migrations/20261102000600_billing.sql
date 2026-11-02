-- SAT MASTER · 0006 · Billing: plans, features, subscriptions, payments, provider events
-- Money is stored in minor units (tiyin for UZS, cents for USD) as bigint.
-- Financial rows are never deleted (triggers). State changes happen only in the
-- security-definer functions below, executed by the server after provider verification.

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  description text not null default '',
  price_minor bigint not null default 0 check (price_minor >= 0),   -- base price, UZS tiyin
  currency text not null default 'UZS' check (currency in ('UZS','USD','EUR')),
  interval_months smallint not null default 1 check (interval_months between 1 and 12),
  is_active boolean not null default true,
  is_public boolean not null default true,
  highlight boolean not null default false,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger plans_set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

-- Optional prices in other currencies (international gateways).
create table public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  currency text not null check (currency in ('UZS','USD','EUR')),
  amount_minor bigint not null check (amount_minor >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, currency)
);
create trigger plan_prices_set_updated_at before update on public.plan_prices
  for each row execute function public.set_updated_at();

create table public.plan_features (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  feature_key text not null check (feature_key in (
    'diagnostic','video_lessons','practice_questions_daily','ai_requests_daily',
    'mock_exams_monthly','analytics_full','study_plan'
  )),
  is_enabled boolean not null default false,
  limit_value integer check (limit_value is null or limit_value >= 0),  -- NULL = unlimited
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, feature_key)
);
create trigger plan_features_set_updated_at before update on public.plan_features
  for each row execute function public.set_updated_at();

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  plan_id uuid not null references public.plans (id) on delete restrict,
  status text not null default 'active' check (status in ('active','canceled','expired')),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  scheduled_plan_id uuid references public.plans (id) on delete set null,   -- downgrade at renewal
  last_provider text check (last_provider in ('click','payme','stripe','test','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end > current_period_start)
);
create unique index subscriptions_one_active_idx on public.subscriptions (user_id) where status = 'active';
create index subscriptions_status_idx on public.subscriptions (status, current_period_end);
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();
create trigger subscriptions_no_delete before delete on public.subscriptions
  for each row execute function public.prevent_delete();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 100001) unique,   -- merchant order id
  user_id uuid not null references public.profiles (id) on delete restrict,
  plan_id uuid not null references public.plans (id) on delete restrict,
  subscription_id uuid references public.subscriptions (id) on delete restrict,
  provider text not null check (provider in ('click','payme','stripe','test','manual')),
  status text not null default 'pending'
    check (status in ('pending','processing','succeeded','failed','canceled','refunded')),
  purpose text not null default 'new' check (purpose in ('new','renewal','upgrade','downgrade')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency in ('UZS','USD','EUR')),
  period_months smallint not null default 1 check (period_months between 1 and 12),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  checkout_url text,
  provider_transaction_id text,
  -- Provider state needed to answer status queries exactly (Payme CheckTransaction / GetStatement)
  provider_state smallint,
  provider_create_time_ms bigint,
  provider_perform_time_ms bigint,
  provider_cancel_time_ms bigint,
  provider_cancel_reason smallint,
  paid_at timestamptz,
  failed_reason text,
  refunded_at timestamptz,
  refund_amount_minor bigint check (refund_amount_minor is null or refund_amount_minor > 0),
  refund_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (refund_amount_minor is null or refund_amount_minor <= amount_minor)
);
create unique index payments_provider_tx_idx on public.payments (provider, provider_transaction_id)
  where provider_transaction_id is not null;
create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_status_idx on public.payments (status, created_at desc);
create index payments_paid_idx on public.payments (paid_at desc) where status = 'succeeded';
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create trigger payments_no_delete before delete on public.payments
  for each row execute function public.prevent_delete();

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments (id) on delete restrict,
  provider text not null check (provider in ('click','payme','stripe','test','manual')),
  event_type text not null,
  provider_event_id text not null,                -- dedupe key from the provider (or derived)
  signature_valid boolean not null,
  payload jsonb not null,                          -- raw provider payload for audit
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);
create index payment_events_payment_idx on public.payment_events (payment_id, created_at);
create index payment_events_created_idx on public.payment_events (created_at desc);
create trigger payment_events_no_delete before delete on public.payment_events
  for each row execute function public.prevent_delete();

-- ---------------------------------------------------------------------------
-- Billing functions
-- ---------------------------------------------------------------------------
create or replace function public.billing_grace_days()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (s.value #>> '{}')::integer from public.platform_settings s
                   where s.key = 'billing.grace_period_days'), 3)
$$;

create or replace function public.subscription_effective_status(p_status text, p_period_end timestamptz)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_status in ('canceled','expired') then p_status
    when now() < p_period_end then 'active'
    when now() < p_period_end + make_interval(days => public.billing_grace_days()) then 'grace'
    else 'expired'
  end
$$;

-- Apply a VERIFIED successful payment. Idempotent; runs in the caller's transaction.
create or replace function public.billing_apply_successful_payment(
  p_payment_id uuid,
  p_provider_transaction_id text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_plan public.plans%rowtype;
  v_old_plan public.plans%rowtype;
  v_sub public.subscriptions%rowtype;
  v_now timestamptz := now();
  v_period interval;
  v_credit_seconds numeric := 0;
  v_sub_id uuid;
  v_effective text;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment % not found', p_payment_id using errcode = 'no_data_found';
  end if;

  if v_payment.status = 'succeeded' then
    return v_payment.subscription_id;                -- idempotent replay
  end if;
  if v_payment.status not in ('pending','processing','failed') then
    raise exception 'Payment % in status % cannot be applied', p_payment_id, v_payment.status
      using errcode = 'P0001';
  end if;

  select * into v_plan from public.plans where id = v_payment.plan_id;
  v_period := make_interval(months => v_payment.period_months);

  select * into v_sub from public.subscriptions
   where user_id = v_payment.user_id and status = 'active'
   for update;

  if found then
    v_effective := public.subscription_effective_status(v_sub.status, v_sub.current_period_end);
    if v_effective = 'expired' then
      update public.subscriptions set status = 'expired' where id = v_sub.id;
      v_sub := null;
    end if;
  end if;

  if v_sub.id is null then
    insert into public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end, last_provider)
    values (v_payment.user_id, v_plan.id, 'active', v_now, v_now + v_period, v_payment.provider)
    returning id into v_sub_id;
  elsif v_sub.plan_id = v_plan.id then
    -- Renewal: extend from the later of now and the current period end.
    update public.subscriptions
       set current_period_end = greatest(current_period_end, v_now) + v_period,
           current_period_start = case when current_period_end < v_now then v_now else current_period_start end,
           cancel_at_period_end = false,
           canceled_at = null,
           scheduled_plan_id = null,
           last_provider = v_payment.provider
     where id = v_sub.id
     returning id into v_sub_id;
  else
    -- Plan change takes effect now; unused time converts pro-rata into time on the new plan.
    select * into v_old_plan from public.plans where id = v_sub.plan_id;
    if v_plan.price_minor > 0 and v_sub.current_period_end > v_now then
      v_credit_seconds := extract(epoch from (v_sub.current_period_end - v_now))
                          * v_old_plan.price_minor::numeric / v_plan.price_minor::numeric;
    end if;
    update public.subscriptions
       set plan_id = v_plan.id,
           current_period_start = v_now,
           current_period_end = v_now + v_period + make_interval(secs => floor(v_credit_seconds)),
           cancel_at_period_end = false,
           canceled_at = null,
           scheduled_plan_id = null,
           last_provider = v_payment.provider
     where id = v_sub.id
     returning id into v_sub_id;
  end if;

  update public.payments
     set status = 'succeeded',
         paid_at = v_now,
         failed_reason = null,
         subscription_id = v_sub_id,
         provider_transaction_id = coalesce(p_provider_transaction_id, provider_transaction_id)
   where id = v_payment.id;

  insert into public.notifications (user_id, type, title, body, link)
  values (v_payment.user_id, 'payment', 'Payment received',
          'Your ' || v_plan.name || ' plan is active. Thank you!', '/dashboard/subscription');

  perform public.write_audit_log('billing.payment_applied', 'payment', v_payment.id::text,
    'Payment #' || v_payment.number || ' applied to subscription',
    null, jsonb_build_object('subscription_id', v_sub_id, 'plan', v_plan.code, 'amount_minor', v_payment.amount_minor),
    v_payment.user_id);

  return v_sub_id;
end;
$$;

create or replace function public.billing_mark_payment_failed(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payments
     set status = 'failed', failed_reason = left(coalesce(p_reason, 'unknown'), 500)
   where id = p_payment_id and status in ('pending','processing');
end;
$$;

create or replace function public.billing_cancel_pending_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payments
     set status = 'canceled', failed_reason = left(coalesce(p_reason, 'canceled'), 500)
   where id = p_payment_id and status in ('pending','processing','failed');
end;
$$;

-- Record a refund (money is returned in the provider cabinet or by the provider itself).
create or replace function public.billing_refund_payment(
  p_payment_id uuid,
  p_amount_minor bigint,
  p_reason text,
  p_revoke_access boolean,
  p_actor uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment % not found', p_payment_id using errcode = 'no_data_found';
  end if;
  if v_payment.status = 'refunded' then
    return;                                          -- idempotent
  end if;
  if v_payment.status <> 'succeeded' then
    raise exception 'Only succeeded payments can be refunded (status %)', v_payment.status using errcode = 'P0001';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > v_payment.amount_minor then
    raise exception 'Invalid refund amount' using errcode = 'check_violation';
  end if;

  update public.payments
     set status = 'refunded', refunded_at = now(), refund_amount_minor = p_amount_minor,
         refund_reason = left(coalesce(p_reason, ''), 500)
   where id = p_payment_id;

  if p_revoke_access and v_payment.subscription_id is not null then
    update public.subscriptions
       set status = 'canceled', canceled_at = now(), cancel_at_period_end = false
     where id = v_payment.subscription_id and status = 'active';
  end if;

  perform public.write_audit_log('billing.payment_refunded', 'payment', p_payment_id::text,
    'Refund of ' || p_amount_minor || ' ' || v_payment.currency || ' minor units' ||
      case when p_revoke_access then ' (access revoked)' else '' end,
    jsonb_build_object('status', v_payment.status),
    jsonb_build_object('status', 'refunded', 'refund_amount_minor', p_amount_minor, 'reason', p_reason),
    p_actor);
end;
$$;

-- Effective plan + features for a user. Falls back to the free plan.
create or replace function public.get_entitlements(p_user_id uuid)
returns table (plan_code text, plan_name text, subscription_status text, period_end timestamptz,
               feature_key text, is_enabled boolean, limit_value integer)
language sql
stable
security definer
set search_path = ''
as $$
  with sub as (
    select s.plan_id, s.current_period_end,
           public.subscription_effective_status(s.status, s.current_period_end) as eff
      from public.subscriptions s
     where s.user_id = p_user_id and s.status = 'active'
     limit 1
  ), chosen as (
    select coalesce(
             (select plan_id from sub where eff in ('active','grace')),
             (select id from public.plans where code = 'free')
           ) as plan_id,
           coalesce((select eff from sub where eff in ('active','grace')), 'none') as eff,
           (select current_period_end from sub where eff in ('active','grace')) as period_end
  )
  select p.code, p.name, c.eff, c.period_end, f.feature_key, f.is_enabled, f.limit_value
    from chosen c
    join public.plans p on p.id = c.plan_id
    join public.plan_features f on f.plan_id = p.id
$$;

create or replace function public.my_entitlements()
returns table (plan_code text, plan_name text, subscription_status text, period_end timestamptz,
               feature_key text, is_enabled boolean, limit_value integer)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.get_entitlements((select auth.uid()))
$$;
