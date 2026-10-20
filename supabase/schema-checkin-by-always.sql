-- check_ins.checked_in_by was only ever recorded for MANUAL check-ins (schema-manual-late-checkin.sql)
-- — a normal QR scan always left it null, so there was no way to tell which signed-in account
-- (Admin, Staff, or the shared Kiosk account) actually performed a given scan. This makes
-- record_check_in() record it every time, scan or manual, so that data is never lost going forward.
-- Everything else (window accept/reject, status computation) is unchanged from schema-status-vs-window.sql.

drop function if exists public.record_check_in(uuid, uuid, uuid, text);

create or replace function public.record_check_in(
  p_event_id uuid,
  p_session_id uuid,
  p_student_id uuid,
  p_method text default 'qr'
) returns table (outcome text, checked_in_at timestamptz, check_in_id uuid, status text)
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
  v_event_start_time time;
  v_late_grace_minutes int;
  v_opens_at timestamp;
  v_closes_at timestamp;
  v_event_starts_at timestamp;
  v_grace_ends_at timestamp;
  v_now_local timestamp;
  v_status text;
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
    return query select 'event_not_found'::text, null::timestamptz, null::uuid, null::text;
    return;
  end if;

  select date, open_time, close_time, event_start_time, late_grace_minutes
    into v_session_date, v_open_time, v_close_time, v_event_start_time, v_late_grace_minutes
    from public.sessions
   where id = p_session_id;

  if not found then
    return query select 'session_not_found'::text, null::timestamptz, null::uuid, null::text;
    return;
  end if;

  -- --- Step 1: window accept/reject — purely "will the scanner take this scan at all", using
  -- the check-in WINDOW. Unrelated to lateness; unchanged. ---
  v_opens_at := v_session_date + v_open_time;
  v_closes_at := v_session_date + v_close_time;
  if v_close_time < v_open_time then
    v_closes_at := v_closes_at + interval '1 day';
  end if;

  v_now_local := (now() at time zone 'America/Toronto');

  if p_method != 'manual' and v_now_local < v_opens_at then
    return query select 'session_not_started'::text, null::timestamptz, null::uuid, null::text;
    return;
  end if;

  if p_method != 'manual' and v_now_local > v_closes_at then
    return query select 'session_closed'::text, null::timestamptz, null::uuid, null::text;
    return;
  end if;

  if v_registration_type = 'Invite-only' then
    if not exists (
      select 1 from public.event_invitees
       where event_id = p_event_id and student_id = p_student_id
    ) then
      return query select 'not_invited'::text, null::timestamptz, null::uuid, null::text;
      return;
    end if;
  end if;

  if v_registration_type = 'Limited' and v_capacity > 0 then
    select count(distinct student_id) into v_attendee_count
      from public.check_ins
     where event_id = p_event_id;

    if v_attendee_count >= v_capacity then
      return query select 'at_capacity'::text, null::timestamptz, null::uuid, null::text;
      return;
    end if;
  end if;

  -- --- Step 2: attendance status — entirely separate from step 1 above. Compares the same
  -- instant (v_now_local) against event_start_time + late_grace_minutes, never the window. A
  -- manual check-in bypassing the window (early or late) still gets a real, accurate badge here. ---
  v_event_starts_at := v_session_date + v_event_start_time;
  v_grace_ends_at := v_event_starts_at + make_interval(mins => v_late_grace_minutes);

  if v_now_local < v_event_starts_at then
    v_status := 'early';
  elsif v_now_local <= v_grace_ends_at then
    v_status := 'on-time';
  else
    v_status := 'late';
  end if;

  -- Recorded for every check-in now, not just manual ones — see header comment above.
  select id into v_checked_in_by from public.staff_users where email = auth.jwt() ->> 'email';

  begin
    insert into public.check_ins as ci (event_id, session_id, student_id, method, checked_in_by, status)
    values (p_event_id, p_session_id, p_student_id, p_method, v_checked_in_by, v_status)
    returning ci.id, ci.checked_in_at into v_new_id, v_new_time;

    return query select 'checked_in'::text, v_new_time, v_new_id, v_status;
    return;
  exception when unique_violation then
    -- Duplicate scan/concurrent race — report the check-in that actually exists, including
    -- whatever status it was actually recorded with (not a fresh recompute against "now").
    select ci.id, ci.checked_in_at, ci.status into v_new_id, v_new_time, v_status
      from public.check_ins ci
     where ci.session_id = p_session_id and ci.student_id = p_student_id;

    return query select 'already_checked_in'::text, v_new_time, v_new_id, v_status;
    return;
  end;
end;
$$;

grant execute on function public.record_check_in(uuid, uuid, uuid, text) to authenticated;

-- Verify: should show exactly one row.
select proname, pronargs from pg_proc where proname = 'record_check_in';
