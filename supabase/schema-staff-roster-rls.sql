-- Staff/Kiosk account roster (new Settings page) needs staff_users to actually be readable/
-- writable by an Admin from the client — right now it's SELECT-only, open to any authenticated
-- account (too broad for a table that decides who has access to what), and has no UPDATE/DELETE
-- policy at all (confirmed live: an authenticated Admin's own UPDATE silently affected 0 rows).
--
-- is_admin() is SECURITY DEFINER specifically so a policy ON staff_users can check staff_users
-- itself without recursing into its own SELECT policy (a self-referencing subquery directly inside
-- the policy would re-trigger that same policy for every row it touches).
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.staff_users
    where email = auth.jwt() ->> 'email' and role = 'Admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- Drop whatever policies already exist on staff_users (names unknown — this table predates the
-- tracked migrations) and replace them cleanly.
do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'staff_users'
  loop
    execute format('drop policy %I on public.staff_users', pol.policyname);
  end loop;
end $$;

-- Everyone can still read their OWN row (required for login's staff_users lookup — AuthContext's
-- fetchStaffUser — for every role, not just Admin). Only an Admin can read the full roster.
create policy "staff_users_select" on public.staff_users
  for select to authenticated
  using (email = auth.jwt() ->> 'email' or public.is_admin());

-- Only an Admin can change a role or remove an account.
create policy "staff_users_admin_update" on public.staff_users
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "staff_users_admin_delete" on public.staff_users
  for delete to authenticated
  using (public.is_admin());

-- Verify: should show exactly 3 rows (select, admin_update, admin_delete).
select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'staff_users';
