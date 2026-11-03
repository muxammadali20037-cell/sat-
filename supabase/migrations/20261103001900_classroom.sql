-- SAT MASTER · 0019 · Classroom: teacher workspaces, groups, invitations, assignments (2.0 PHASE 3)
--
-- Tenancy: every classroom row carries workspace_id. Composite foreign keys (workspace_id, id) make
-- it impossible for a row of one workspace to point at a group, assignment or member of another.
--
-- Access model (same pattern as attempts/payments):
--   * Clients (anon/authenticated) can only SELECT, and only what their membership allows (RLS).
--   * Every write goes through the server, which checks the workspace role first
--     (src/features/workspaces/permissions.ts) and then uses the service role. Multi-row writes
--     that must be atomic (creating a workspace, joining with a code) are SQL functions that only
--     the service role may call.
-- Additive: no existing rows change. One existing policy is narrowed (telegram_accounts, below).

-- ---------------------------------------------------------------------------
-- Workspaces and members
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  kind text not null default 'individual' check (kind in ('individual','center')),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  timezone text not null default 'Asia/Tashkent' check (char_length(timezone) between 1 and 64),
  status text not null default 'active' check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index workspaces_owner_idx on public.workspaces (owner_id);
create trigger workspaces_set_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner','admin','teacher','assistant','student')),
  status text not null default 'active' check (status in ('active','removed')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  invited_by uuid references public.profiles (id) on delete set null,
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id, status);

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  subject text not null default '' check (char_length(subject) <= 60),
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (workspace_id, id)
);
create index groups_workspace_idx on public.groups (workspace_id, status);
create trigger groups_set_updated_at before update on public.groups
  for each row execute function public.set_updated_at();

create table public.group_members (
  workspace_id uuid not null,
  group_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('student','teacher','assistant')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (group_id, user_id),
  foreign key (workspace_id, group_id) references public.groups (workspace_id, id) on delete cascade,
  -- A group member must be a member of the same workspace.
  foreign key (workspace_id, user_id) references public.workspace_members (workspace_id, user_id) on delete cascade
);
create index group_members_user_idx on public.group_members (user_id) where left_at is null;
create index group_members_workspace_idx on public.group_members (workspace_id);

-- ---------------------------------------------------------------------------
-- Invitations: a short code (shown as XXXX-XXXX, used in the link and the QR code)
-- ---------------------------------------------------------------------------
create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  group_id uuid,
  role text not null check (role in ('admin','teacher','assistant','student')),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  max_uses integer check (max_uses is null or max_uses between 1 and 1000),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, group_id) references public.groups (workspace_id, id) on delete cascade,
  check (max_uses is null or uses <= max_uses)
);
create index workspace_invitations_workspace_idx on public.workspace_invitations (workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Consent: a student lets a workspace's teachers see their own (non-classroom) practice results
-- ---------------------------------------------------------------------------
create table public.progress_sharing (
  workspace_id uuid not null,
  student_id uuid not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (workspace_id, student_id),
  foreign key (workspace_id, student_id) references public.workspace_members (workspace_id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Assignments and submissions
-- ---------------------------------------------------------------------------
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  group_id uuid not null,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  instructions text not null default '' check (char_length(instructions) <= 5000),
  kind text not null check (kind in ('practice','mock_exam','text')),
  -- practice: { subjectCode, domainId?, skillId?, difficulty, count, timed }
  practice_config jsonb,
  mock_exam_id uuid references public.mock_exams (id) on delete restrict,
  due_at timestamptz,
  points integer check (points is null or points between 1 and 1000),
  status text not null default 'published' check (status in ('draft','published','closed')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, group_id) references public.groups (workspace_id, id) on delete cascade,
  check (kind <> 'practice' or (practice_config is not null and jsonb_typeof(practice_config) = 'object')),
  check (kind <> 'mock_exam' or mock_exam_id is not null),
  check (status = 'draft' or published_at is not null)
);
create index assignments_group_idx on public.assignments (group_id, status, due_at);
create trigger assignments_set_updated_at before update on public.assignments
  for each row execute function public.set_updated_at();

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  assignment_id uuid not null,
  student_id uuid not null references public.profiles (id) on delete cascade,
  attempt_id uuid references public.attempts (id) on delete set null,
  status text not null default 'started' check (status in ('started','submitted','graded')),
  text_answer text check (text_answer is null or char_length(text_answer) <= 10000),
  submitted_at timestamptz,
  score numeric(7,2) check (score is null or score >= 0),
  feedback text check (feedback is null or char_length(feedback) <= 5000),
  graded_by uuid references public.profiles (id) on delete set null,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id),
  foreign key (workspace_id, assignment_id) references public.assignments (workspace_id, id) on delete cascade,
  check (status = 'started' or submitted_at is not null),
  check (status <> 'graded' or graded_at is not null)
);
create index submissions_student_idx on public.submissions (student_id);
create trigger submissions_set_updated_at before update on public.submissions
  for each row execute function public.set_updated_at();

-- Practice sessions started from an assignment (teacher-assigned work is not limited by the
-- student's own plan; see practice/server.ts).
alter table public.attempts add column if not exists assignment_id uuid references public.assignments (id) on delete set null;

-- Workspace actions in the audit log. The audit log is append-only, so a workspace with history
-- cannot be deleted (workspaces are archived instead; see status).
alter table public.audit_logs add column if not exists workspace_id uuid references public.workspaces (id) on delete restrict;
create index if not exists audit_logs_workspace_idx on public.audit_logs (workspace_id, created_at desc) where workspace_id is not null;

-- ---------------------------------------------------------------------------
-- Role helpers (security definer, used by RLS; they only describe the caller's own access)
-- ---------------------------------------------------------------------------
create or replace function public.workspace_role(p_workspace uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
   where m.workspace_id = p_workspace and m.user_id = (select auth.uid())
     and m.status = 'active' and w.status = 'active'
$$;

create or replace function public.is_workspace_manager(p_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.workspace_role(p_workspace) in ('owner','admin'), false)
$$;

create or replace function public.is_workspace_staff(p_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.workspace_role(p_workspace) in ('owner','admin','teacher','assistant'), false)
$$;

-- Managers teach every group; teachers and assistants only the groups they are assigned to.
create or replace function public.can_teach_group(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.groups g
     where g.id = p_group
       and (public.is_workspace_manager(g.workspace_id)
            or (public.is_workspace_staff(g.workspace_id) and exists (
                  select 1 from public.group_members gm
                   where gm.group_id = g.id and gm.user_id = (select auth.uid())
                     and gm.role in ('teacher','assistant') and gm.left_at is null)))
  )
$$;

create or replace function public.is_group_student(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members gm
      join public.workspace_members m on m.workspace_id = gm.workspace_id and m.user_id = gm.user_id
     where gm.group_id = p_group and gm.user_id = (select auth.uid())
       and gm.role = 'student' and gm.left_at is null and m.status = 'active'
  )
$$;

revoke execute on function public.workspace_role(uuid), public.is_workspace_manager(uuid), public.is_workspace_staff(uuid),
  public.can_teach_group(uuid), public.is_group_student(uuid) from public;
grant execute on function public.workspace_role(uuid), public.is_workspace_manager(uuid), public.is_workspace_staff(uuid),
  public.can_teach_group(uuid), public.is_group_student(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS: SELECT only, scoped by membership. No client INSERT/UPDATE/DELETE.
-- ---------------------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.progress_sharing enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;

revoke all on public.workspaces, public.workspace_members, public.groups, public.group_members,
  public.workspace_invitations, public.progress_sharing, public.assignments, public.submissions from anon, authenticated;
grant select on public.workspaces, public.workspace_members, public.groups, public.group_members,
  public.workspace_invitations, public.progress_sharing, public.assignments, public.submissions to authenticated;
grant all on public.workspaces, public.workspace_members, public.groups, public.group_members,
  public.workspace_invitations, public.progress_sharing, public.assignments, public.submissions to service_role;

create policy workspaces_read on public.workspaces for select to authenticated
  using ((select public.workspace_role(id)) is not null);

-- Staff see the roster; a student sees their own row and who teaches there.
create policy workspace_members_read on public.workspace_members for select to authenticated
  using (user_id = (select auth.uid())
         or (select public.is_workspace_staff(workspace_id))
         or (role <> 'student' and status = 'active' and (select public.workspace_role(workspace_id)) is not null));

create policy groups_read on public.groups for select to authenticated
  using ((select public.can_teach_group(id)) or (select public.is_group_student(id)));

create policy group_members_read on public.group_members for select to authenticated
  using (user_id = (select auth.uid()) or (select public.can_teach_group(group_id)));

create policy workspace_invitations_read on public.workspace_invitations for select to authenticated
  using ((select public.is_workspace_manager(workspace_id))
         or (group_id is not null and (select public.can_teach_group(group_id))));

create policy progress_sharing_read on public.progress_sharing for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_workspace_staff(workspace_id)));

create policy assignments_read on public.assignments for select to authenticated
  using ((select public.can_teach_group(group_id))
         or (status <> 'draft' and (select public.is_group_student(group_id))));

create policy submissions_read on public.submissions for select to authenticated
  using (student_id = (select auth.uid())
         or exists (select 1 from public.assignments a where a.id = assignment_id and (select public.can_teach_group(a.group_id))));

-- ---------------------------------------------------------------------------
-- Atomic server-only operations
-- ---------------------------------------------------------------------------

-- Create a workspace and its owner membership together. At most 5 active workspaces per owner.
create or replace function public.workspace_create(p_owner uuid, p_name text, p_kind text, p_country text, p_timezone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace_create:' || p_owner::text, 0));
  if (select count(*) from public.workspaces where owner_id = p_owner and status <> 'archived') >= 5 then
    raise exception 'workspace limit reached' using errcode = 'P0001', hint = 'workspace_limit';
  end if;
  insert into public.workspaces (name, kind, owner_id, country_code, timezone)
  values (btrim(p_name), p_kind, p_owner, p_country, coalesce(p_timezone, 'Asia/Tashkent'))
  returning id into v_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (v_id, p_owner, 'owner');
  return v_id;
end;
$$;

-- Join with an invitation code. Locks the invitation so max_uses holds under concurrency.
-- Returns the workspace, the group (if any) and whether this was a new join.
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

revoke execute on function public.workspace_create(uuid, text, text, text, text), public.workspace_join(uuid, text) from public, anon, authenticated;
grant execute on function public.workspace_create(uuid, text, text, text, text), public.workspace_join(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- S1 (SECURITY_MODEL.md): a shared phone number is visible to the student and platform admins
-- only, not to every staff member.
-- ---------------------------------------------------------------------------
alter policy telegram_accounts_select_own on public.telegram_accounts
  using (user_id = (select auth.uid()) or (select public.is_admin()));
