-- Fusion Check-In — closes the passes.token leak.
-- Review this, then run it in the Supabase SQL Editor.
--
-- Every RLS policy in this project so far is `to authenticated using (true)` — any signed-in
-- account, Staff or Admin, with zero conditions. For most tables that's an acceptable trade-off
-- for an internal tool. For `passes` it isn't: the whole point of a real random token (instead of
-- the old student-ID-derived one) is that it can't be produced without database access — but if
-- any authenticated account can `select token from passes`, that protection is worthless against
-- anyone holding valid Staff credentials, since they can just read every token directly and mint
-- working forged passes for any student without ever touching a camera.
--
-- Fix: remove direct SELECT access to `passes` entirely. The two legitimate needs become
-- SECURITY DEFINER functions that each do exactly one narrow thing and check who's calling:
--
--   lookup_pass_by_token(token)   — Scanner-facing. Resolves ONE exact scanned token to the
--                                    student/status it belongs to. Any signed-in Fusion staff
--                                    account may call it (Staff needs this to scan), but it can
--                                    only ever match one exact token per call — there's no way to
--                                    use it to enumerate or bulk-read the token list.
--
--   get_pass_token(student_id)    — Admin-facing. The only way to read a specific student's real
--                                    token, for rendering/printing their pass. Deliberately
--                                    Admin-only — Staff never need to see a raw token, only to
--                                    validate a scanned one via the function above.
--
-- Both check public.staff_users themselves (keyed off the caller's JWT email, the same way
-- AuthContext.tsx already does client-side) rather than trusting the app's own login gate — a
-- Supabase Auth account that exists but was never provisioned as Fusion staff should not be able
-- to call either of these just because it's "authenticated".

drop policy if exists "Authenticated staff can read passes" on public.passes;

create or replace function public.lookup_pass_by_token(p_token text)
returns table (student_id uuid, pass_status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.staff_users where email = auth.jwt() ->> 'email') then
    raise exception 'Not authorized';
  end if;

  return query
    select p.student_id, p.status
      from public.passes p
     where p.token = p_token;
end;
$$;

grant execute on function public.lookup_pass_by_token(text) to authenticated;

create or replace function public.get_pass_token(p_student_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_token text;
begin
  select role into v_role from public.staff_users where email = auth.jwt() ->> 'email';

  if v_role is distinct from 'Admin' then
    raise exception 'Not authorized';
  end if;

  select token into v_token from public.passes where student_id = p_student_id;
  return v_token;
end;
$$;

grant execute on function public.get_pass_token(uuid) to authenticated;

-- Verify: with no direct select policy left, this should return an empty array/no rows — not a
-- real token — even though you're authenticated. (Direct reads are gone; only the two functions
-- above can produce a token now.)
select token from public.passes limit 1;
