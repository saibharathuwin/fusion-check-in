-- Fusion Check-In — lets a MANUAL check-in be recorded at any time, before a session's Opens time
-- or after its Closes time, not just after Closes as before. Review this, then run it in the
-- Supabase SQL Editor. Supersedes schema-overnight-sessions.sql's version of this function (this
-- one includes that same overnight-window fix, plus the change below) — if you haven't run that
-- one yet, you can skip straight to this one.
--
-- Fusion Check-In now classifies every check-in as Early / On-time / Late by directly comparing
-- its timestamp to the session's own Opens/Closes window (see attendanceData.ts). That's only ever
-- useful if an early or late check-in can actually be recorded in the first place — until now,
-- record_check_in() rejected ANY check-in (QR or manual) attempted before a session's Opens time
-- outright, with outcome 'session_not_started', so an "Early" check-in could never exist.
--
-- The QR Scanner's own behavior is unchanged: a QR scan is still refused both before Opens and
-- after Closes, exactly as before — this only widens the MANUAL override (the "Add check-in"
-- search box in the Live Check-ins tab), which already bypassed the after-Closes restriction as a
-- deliberate staff fallback, to now also bypass the before-Opens one for the same reason: staff
-- recording a real early arrival by hand should end up correctly badged "Early", not blocked.

drop function if exists public.record_check_in(uuid, uuid, uuid, text);

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
  v_opens_at timestamp;
  v_closes_at timestamp;
  v_now_local timestamp;
  v_new_id uuid;
  v_new_time timestamptz;
  v_checked_in_by uuid;
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

  v_opens_at := v_session_date + v_open_time;
  v_closes_at := v_session_date + v_close_time;
  -- close_time earlier than open_time means the window closes the NEXT calendar day, not the
  -- same one — e.g. date 2026-09-21, open_time 23:00, close_time 12:00 closes 2026-09-22 12:00.
  if v_close_time < v_open_time then
    v_closes_at := v_closes_at + interval '1 day';
  end if;

  v_now_local := (now() at time zone 'America/Toronto');

  -- A manual check-in can now happen at any time — before the session opens or after it closes —
  -- since it's the staff-facing fallback for exactly those exceptional cases. A QR scan still
  -- enforces both bounds exactly as before.
  if p_method != 'manual' and v_now_local < v_opens_at then
    return query select 'session_not_started'::text, null::timestamptz, null::uuid;
    return;
  end if;

  if p_method != 'manual' and v_now_local > v_closes_at then
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

  if p_method = 'manual' then
    select id into v_checked_in_by from public.staff_users where email = auth.jwt() ->> 'email';
  end if;

  begin
    insert into public.check_ins as ci (event_id, session_id, student_id, method, checked_in_by)
    values (p_event_id, p_session_id, p_student_id, p_method, v_checked_in_by)
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

-- Verify: should return one row.
select proname, pronargs from pg_proc where proname = 'record_check_in';
