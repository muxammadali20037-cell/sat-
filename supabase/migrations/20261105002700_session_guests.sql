-- SAT MASTER · 0027 · Guest teachers for one lesson (PHASE 4-D)
--
-- A teacher can invite a guest (another teacher, a moderator) into ONE lesson's live room with a
-- link. The guest gets no workspace membership and no access to students' data, assignments or
-- materials: only that lesson's room while it is open. Each link can be revoked and has a use limit.
--   * class_session_guest_links: the link (8-character code, same alphabet as invitations).
--   * class_session_guests: who used a link (one row per guest per lesson).
-- Clients may only SELECT (staff of the group; a guest their own row); writes are server-only.
-- Additive only: 2 new tables.

create table public.class_session_guest_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  session_id uuid not null,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  role text not null default 'guest_teacher' check (role in ('guest_teacher','moderator')),
  max_uses integer not null default 1 check (max_uses between 1 and 20),
  uses integer not null default 0 check (uses >= 0),
  revoked_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, session_id) references public.class_sessions (workspace_id, id) on delete cascade,
  check (uses <= max_uses)
);
create index class_session_guest_links_session_idx on public.class_session_guest_links (session_id);

create table public.class_session_guests (
  workspace_id uuid not null,
  session_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  link_id uuid references public.class_session_guest_links (id) on delete set null,
  role text not null check (role in ('guest_teacher','moderator')),
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id),
  foreign key (workspace_id, session_id) references public.class_sessions (workspace_id, id) on delete cascade
);
create index class_session_guests_user_idx on public.class_session_guests (user_id);

alter table public.class_session_guest_links enable row level security;
alter table public.class_session_guests enable row level security;
revoke all on public.class_session_guest_links, public.class_session_guests from anon, authenticated;
grant select on public.class_session_guest_links, public.class_session_guests to authenticated;
grant all on public.class_session_guest_links, public.class_session_guests to service_role;

create policy class_session_guest_links_read on public.class_session_guest_links for select to authenticated
  using (exists (select 1 from public.class_sessions s where s.id = session_id and (select public.can_teach_group(s.group_id))));

create policy class_session_guests_read on public.class_session_guests for select to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from public.class_sessions s where s.id = session_id and (select public.can_teach_group(s.group_id))));
