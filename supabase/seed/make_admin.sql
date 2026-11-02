-- SAT MASTER · promote an existing account to SUPER_ADMIN
-- =============================================================================
-- Intended for DEVELOPMENT projects (and, deliberately, for bootstrapping the very
-- first super admin of a new environment). After that, manage roles in /admin, which
-- goes through public.admin_set_user_role and its hierarchy checks.
--
-- 1. Sign up through the app with the account you want to promote. Signing up creates
--    the auth.users row and, through a trigger, the public.profiles row (as STUDENT).
-- 2. Run this file as the postgres role:
--      psql:  psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -v email='you@example.com' \
--               -f supabase/seed/make_admin.sql
--      Supabase SQL editor: paste the file and replace  :'email'  on the line below
--               with your address in single quotes, for example 'you@example.com'.
-- 3. Sign out and back in so the app reloads your role.
--
-- The change is recorded in audit_logs by the profiles audit trigger (actor: system).
-- =============================================================================

select set_config('satmaster.admin_email', :'email', false);

do $$
declare
  v_email text := lower(btrim(current_setting('satmaster.admin_email')));
  v_count integer;
begin
  update public.profiles
     set role = 'SUPER_ADMIN'
   where lower(email) = v_email
     and deleted_at is null;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'No profile found for %. Sign up in the app first, then run this again.', v_email;
  end if;
  raise notice 'Promoted % to SUPER_ADMIN.', v_email;
end $$;

select id, email, role, is_suspended
  from public.profiles
 where lower(email) = lower(btrim(current_setting('satmaster.admin_email')));
