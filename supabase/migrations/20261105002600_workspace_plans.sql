-- SAT MASTER · 0026 · Workspace plans and limits (teacher billing preparation)
--
-- Plans for teacher workspaces define LIMITS only: how many students and groups, and whether
-- in-app live lessons are included. There are deliberately no prices here: prices and checkout
-- come later, once a payment provider and its fees are confirmed. Until then a plan is assigned
-- to a workspace by a SAT MASTER administrator (a trusted, audited process).
--
--   * No plan rows exist after this migration, so nothing changes for existing workspaces: without
--     a default plan every workspace keeps working without limits.
--   * workspace_effective_plan(): the assigned plan while valid, otherwise the default plan (if any).
--   * workspace_join now refuses a new student when the workspace is at its student limit (under a
--     per-workspace lock, so two simultaneous joins cannot exceed it). Nothing else in it changes.
--   * Clients may only SELECT active plans; writes go through the server (admins only).

create table public.workspace_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  max_students integer check (max_students is null or max_students between 0 and 100000),   -- NULL = unlimited
  max_groups integer check (max_groups is null or max_groups between 0 and 10000),           -- NULL = unlimited
  live_lessons boolean not null default true,
  is_default boolean not null default false,
  is_active boolean not null default true,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_default or is_active)
);
create unique index workspace_plans_one_default_idx on public.workspace_plans ((true)) where is_default;
create trigger workspace_plans_set_updated_at before update on public.workspace_plans
  for each row execute function public.set_updated_at();

alter table public.workspaces
  add column if not exists plan_id uuid references public.workspace_plans (id) on delete restrict,
  add column if not exists plan_until timestamptz;

alter table public.workspace_plans enable row level security;
revoke all on public.workspace_plans from anon, authenticated;
grant select on public.workspace_plans to authenticated;
grant all on public.workspace_plans to service_role;
create policy workspace_plans_read on public.workspace_plans for select to authenticated
  using (is_active or (select public.is_admin()));

create or replace function public.workspace_effective_plan(p_workspace uuid)
returns setof public.workspace_plans
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.workspaces w
    join public.workspace_plans p on p.id = w.plan_id
   where w.id = p_workspace and p.is_active and (w.plan_until is null or w.plan_until > now())
  union all
  select d.* from public.workspace_plans d
   where d.is_default and d.is_active
     and not exists (
       select 1 from public.workspaces w join public.workspace_plans p on p.id = w.plan_id
        where w.id = p_workspace and p.is_active and (w.plan_until is null or w.plan_until > now()))
  limit 1
$$;
revoke execute on function public.workspace_effective_plan(uuid) from public, anon, authenticated;
grant execute on function public.workspace_effective_plan(uuid) to service_role;

create or replace function public.workspace_join(p_user uuid, p_code text)
returns table (workspace_id uuid, group_id uuid, role text, joined boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.workspace_invitations%rowtype;
  v_ws_status text;
  v_existing public.workspace_members%rowtype;
  v_role text;
  v_new boolean := false;
  v_rank_new int;
  v_rank_old int;
  v_max integer;
begin
  select * into inv from public.workspace_invitations i where i.code = upper(p_code) for update;
  if not found then
    raise exception 'invitation not found' using errcode = 'P0001', hint = 'invite_not_found';
  end if;
  if inv.revoked_at is not null or inv.expires_at <= now() then
    raise exception 'invitation expired' using errcode = 'P0001', hint = 'invite_expired';
  end if;
  select status into v_ws_status from public.workspaces w where w.id = inv.workspace_id;
  if v_ws_status <> 'active' then
    raise exception 'workspace unavailable' using errcode = 'P0001', hint = 'workspace_unavailable';
  end if;

  select * into v_existing from public.workspace_members m where m.workspace_id = inv.workspace_id and m.user_id = p_user for update;
  v_rank_new := case inv.role when 'admin' then 3 when 'teacher' then 2 when 'assistant' then 1 else 0 end;
  if not found then
    if inv.max_uses is not null and inv.uses >= inv.max_uses then
      raise exception 'invitation used up' using errcode = 'P0001', hint = 'invite_used_up';
    end if;
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (inv.workspace_id, p_user, inv.role, inv.created_by);
    v_role := inv.role;
    v_new := true;
  else
    v_rank_old := case v_existing.role when 'owner' then 9 when 'admin' then 3 when 'teacher' then 2 when 'assistant' then 1 else 0 end;
    -- Never downgrade (and never touch the owner); upgrade a student to a staff role if invited so.
    v_role := case when v_rank_new > v_rank_old then inv.role else v_existing.role end;
    if v_existing.status = 'removed' then
      if inv.max_uses is not null and inv.uses >= inv.max_uses then
        raise exception 'invitation used up' using errcode = 'P0001', hint = 'invite_used_up';
      end if;
      v_new := true;
    end if;
    update public.workspace_members m
       set role = v_role, status = 'active', removed_at = null
     where m.workspace_id = inv.workspace_id and m.user_id = p_user;
  end if;

  -- Plan limit (0026): a new or returning student needs a free student place in the workspace.
  if v_new and v_role = 'student' then
    perform pg_advisory_xact_lock(hashtextextended('workspace_students:' || inv.workspace_id::text, 0));
    select p.max_students into v_max from public.workspace_effective_plan(inv.workspace_id) p;
    if v_max is not null and (
      select count(*) from public.workspace_members m
       where m.workspace_id = inv.workspace_id and m.role = 'student' and m.status = 'active' and m.user_id <> p_user
    ) >= v_max then
      raise exception 'student limit reached' using errcode = 'P0001', hint = 'student_limit';
    end if;
  end if;

  if inv.group_id is not null then
    insert into public.group_members (workspace_id, group_id, user_id, role)
    values (inv.workspace_id, inv.group_id, p_user, case when inv.role = 'student' then 'student' else 'teacher' end)
    on conflict on constraint group_members_pkey do update set left_at = null;
  end if;

  if v_new then
    update public.workspace_invitations i set uses = i.uses + 1 where i.id = inv.id;
  end if;
  return query select inv.workspace_id, inv.group_id, v_role, v_new;
end;
$$;
revoke execute on function public.workspace_join(uuid, text) from public, anon, authenticated;
grant execute on function public.workspace_join(uuid, text) to service_role;
