-- SAT MASTER · 0020 · Personal assignments (2.0: classroom ↔ learning link)
--
-- A teacher who spots a weakness can give one student a practice assignment of their own. It is
-- an ordinary assignment of the student's group with `assignee_id` set:
--   * the composite FK guarantees the assignee is a member of that same group (and workspace);
--   * the read policy lets a student see a group assignment, or one assigned to them only —
--     never another student's personal assignment;
--   * writes stay server-only (no INSERT/UPDATE/DELETE grants for clients, as in 0019).
-- Additive only: existing rows keep assignee_id = null and behave exactly as before.

alter table public.assignments add column if not exists assignee_id uuid;

alter table public.assignments
  add constraint assignments_assignee_fk
  foreign key (group_id, assignee_id) references public.group_members (group_id, user_id) on delete cascade;

create index if not exists assignments_assignee_idx on public.assignments (assignee_id) where assignee_id is not null;

alter policy assignments_read on public.assignments
  using ((select public.can_teach_group(group_id))
         or (status <> 'draft'
             and (assignee_id is null or assignee_id = (select auth.uid()))
             and (select public.is_group_student(group_id))));
