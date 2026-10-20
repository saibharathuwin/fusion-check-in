-- Fusion Check-In — adds check_ins.method (qr vs manual) and a staff-only "undo" action.
-- Review this, then run it in the Supabase SQL Editor.
--
-- The Live Check-ins tab's manual fallback ("Check in" for a broken scanner, "Undo" for a
-- mistaken scan) needs two things this schema doesn't have yet:
--   1. A way to tell a manual check-in apart from a real QR scan (check_ins.method).
--   2. A way to delete a check-in at all — check_ins currently has only select/insert RLS
--      policies (schema-additions.sql), so a delete is refused with no policy to allow it.

alter table public.check_ins add column if not exists method text not null default 'qr';
alter table public.check_ins drop constraint if exists check_ins_method_check;
alter table public.check_ins add constraint check_ins_method_check check (method in ('qr', 'manual'));

-- record_check_in gains an optional p_method param, defaulting to 'qr' — every existing caller
-- (the Scanner) keeps working unchanged. The manual "Check in" button is the only caller that ever
-- passes 'manual'. Everything else — the atomic session-window / invite / capacity checks — stays
-- identical, since manual check-in is a fallback for a broken scanner, not a bypass of the event's
-- own rules. The old 3-arg signature is dropped first: `create or replace` can't change a
-- function's parameter list, it would just add a second overload alongside the old one.
drop function if exists public.record_check_in(uuid, uuid, uuid);

create or replace function public.record_check_in(
  p_event_id uuid,
  p_session_id uuid,
  p_student_id uuid,
  p_method text default 'qr'
) returns table (outcome text, checked_in_at timestamptz, check_in_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_capacity int;
  v_registration_type text;
  v_attendee_count int;
  v_session_date date;
  v_open_time time;
  v_close_time time;
  v_now_local timestamp;
  v_new_id uuid;
  v_new_time timestamptz;
begin
  select capacity, registration_type
    into v_capacity, v_registration_type
    from public.events
   where id = p_event_id
   for update;

  if not found then
    return query select 'event_not_found'::text, null::timestamptz, null::uuid;
    return;
  end if;

  select date, open_time, close_time
    into v_session_date, v_open_time, v_close_time
    from public.sessions
   where id = p_session_id;

  if not found then
    return query select 'session_not_found'::text, null::timestamptz, null::uuid;
    return;
  end if;

  v_now_local := (now() at time zone 'America/Toronto');

  if v_now_local < (v_session_date + v_open_time) then
    return query select 'session_not_started'::text, null::timestamptz, null::uuid;
    return;
  end if;

  if v_now_local > (v_session_date + v_close_time) then
    return query select 'session_closed'::text, null::timestamptz, null::uuid;
    return;
  end if;

  if v_registration_type = 'Invite-only' then
    if not exists (
      select 1 from public.event_invitees
       where event_id = p_event_id and student_id = p_student_id
    ) then
      return query select 'not_invited'::text, null::timestamptz, null::uuid;
      return;
    end if;
  end if;

  if v_registration_type = 'Limited' and v_capacity > 0 then
    select count(distinct student_id) into v_attendee_count
      from public.check_ins
     where event_id = p_event_id;

    if v_attendee_count >= v_capacity then
      return query select 'at_capacity'::text, null::timestamptz, null::uuid;
      return;
    end if;
  end if;

  begin
    insert into public.check_ins as ci (event_id, session_id, student_id, method)
    values (p_event_id, p_session_id, p_student_id, p_method)
    returning ci.id, ci.checked_in_at into v_new_id, v_new_time;

    return query select 'checked_in'::text, v_new_time, v_new_id;
    return;
  exception when unique_violation then
    select ci.id, ci.checked_in_at into v_new_id, v_new_time
      from public.check_ins ci
     where ci.session_id = p_session_id and ci.student_id = p_student_id;

    return query select 'already_checked_in'::text, v_new_time, v_new_id;
    return;
  end;
end;
$$;

grant execute on function public.record_check_in(uuid, uuid, uuid, text) to authenticated;

-- Staff-only undo — SECURITY DEFINER because there's no plain delete RLS policy on check_ins (see
-- above), following the same "narrow function checks staff_users itself" pattern already used for
-- the passes.token fix (schema-lock-pass-tokens.sql). Any signed-in Fusion staff account may call
-- it — correcting a mis-scan is a Scanner-level action, not Admin-only.
create or replace function public.undo_check_in(p_check_in_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.staff_users where email = auth.jwt() ->> 'email') then
    raise exception 'Not authorized';
  end if;

  delete from public.check_ins where id = p_check_in_id;
end;
$$;

grant execute on function public.undo_check_in(uuid) to authenticated;

-- Verify: both functions should each show up as exactly one row.
select proname, pronargs from pg_proc where proname in ('record_check_in', 'undo_check_in');
