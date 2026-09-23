-- Fusion Check-In — supports check-in sessions that span midnight (e.g. Opens 11:00 PM, Closes
-- 12:00 PM the next day). Review this, then run it in the Supabase SQL Editor.
--
-- Sessions have always stored a single `date` plus an `open_time`/`close_time` (both a bare time
-- of day, no date of their own) — record_check_in() combined `date + close_time` to get the
-- moment the window shuts, which silently assumed close_time was always later in the day than
-- open_time. For an overnight session that's wrong: `date + close_time` lands BEFORE `date +
-- open_time`, so the window looked like it closed before it even opened, and (separately, in the
-- app's own form validation) closeTime <= openTime was flagged as an outright error, blocking the
-- session from being saved at all.
--
-- There's no new "overnight" flag to store — it's fully derived: whenever close_time is earlier
-- than open_time, this session's close moment is understood to fall on the day AFTER `date`,
-- not the same day. That's the one change here: the closing timestamp now adds a day in that case
-- before it's compared against "now".

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

  -- A manual check-in can never happen before the session opens (recording attendance for
  -- something that hasn't started yet makes no sense either way) but — unlike a QR scan — CAN
  -- happen after it closes, since that's the whole point of the manual override.
  if v_now_local < v_opens_at then
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
