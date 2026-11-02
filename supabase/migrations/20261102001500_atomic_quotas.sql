-- SAT MASTER · 0015 · Atomic quota checks (AI requests per day, mock exams per month)
-- Problem: the daily AI limit was a read-then-act check (count today's ai_usage rows, then call
-- the model), so several simultaneous requests could all pass it. Now the server reserves one unit
-- before calling the model: ai_reserve_request serializes per student with an advisory lock,
-- counts today's successful requests plus reservations still in flight, and inserts a reservation
-- only when that total is below the limit. The server deletes the reservation when the request
-- ends; reservations older than 10 minutes are treated as abandoned and purged.

create table public.ai_quota_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index ai_quota_reservations_user_idx on public.ai_quota_reservations (user_id, created_at);

-- Server only: RLS on with no policies, and no client privileges (0008 revoked the defaults).
alter table public.ai_quota_reservations enable row level security;
revoke all on public.ai_quota_reservations from anon, authenticated;
grant all on public.ai_quota_reservations to service_role;

-- Endpoints that count against ai_requests_daily. Keep in sync with getUsage() in
-- src/features/entitlements/server.ts (verify_practice is an internal check, not a student request).
create or replace function public.ai_reserve_request(p_user_id uuid, p_since timestamptz, p_limit integer)
returns table (reservation_id uuid, used integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer;
  v_id uuid;
begin
  if p_user_id is null or p_since is null or p_limit is null or p_limit < 0 then
    raise exception 'ai_reserve_request: invalid arguments' using errcode = '22023';
  end if;

  -- One student at a time; different students never wait for each other.
  perform pg_advisory_xact_lock(hashtextextended('ai_quota:' || p_user_id::text, 0));

  delete from public.ai_quota_reservations r
   where r.user_id = p_user_id and r.created_at < now() - interval '10 minutes';

  select
    (select count(*) from public.ai_usage u
      where u.user_id = p_user_id
        and u.status = 'ok'
        and u.endpoint in ('chat', 'explain', 'hint', 'generate_practice', 'study_plan')
        and u.created_at >= p_since)
    + (select count(*) from public.ai_quota_reservations r where r.user_id = p_user_id)
  into v_used;

  if v_used >= p_limit then
    return query select null::uuid, v_used;
    return;
  end if;

  insert into public.ai_quota_reservations (user_id) values (p_user_id) returning id into v_id;
  return query select v_id, v_used;
end;
$$;

revoke execute on function public.ai_reserve_request(uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.ai_reserve_request(uuid, timestamptz, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Mock exams per month. A unique index already stops two active attempts of the SAME exam;
-- this closes the other gap: two DIFFERENT exams started at the same moment. Count and insert
-- happen under the same per-student lock, so the monthly limit holds. p_limit null = unlimited.
-- Returns the new attempt id, or null when the limit is reached.
-- ---------------------------------------------------------------------------
create or replace function public.mock_exam_start_attempt(p_user_id uuid, p_mock_exam_id uuid, p_since timestamptz, p_limit integer default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer;
  v_id uuid;
begin
  if p_user_id is null or p_mock_exam_id is null or p_since is null or p_limit < 0 then
    raise exception 'mock_exam_start_attempt: invalid arguments' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('mock_quota:' || p_user_id::text, 0));

  if p_limit is not null then
    select count(*) into v_used
      from public.attempts a
     where a.user_id = p_user_id
       and a.kind = 'mock_exam'
       and a.status <> 'abandoned'
       and a.started_at >= p_since;
    if v_used >= p_limit then
      return null;
    end if;
  end if;

  -- A concurrent start of the same exam raises unique_violation (attempts_one_active_mock_idx);
  -- the caller then resumes the attempt that won.
  insert into public.attempts (user_id, kind, mock_exam_id, status)
  values (p_user_id, 'mock_exam', p_mock_exam_id, 'in_progress')
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.mock_exam_start_attempt(uuid, uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.mock_exam_start_attempt(uuid, uuid, timestamptz, integer) to service_role;
