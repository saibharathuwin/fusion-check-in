-- Fusion Check-In — makes check-in scans race-safe when multiple staff scan concurrently, AND
-- enforces that a scan can only succeed while its session is actually open.
-- Review this, then run it in the Supabase SQL Editor. Safe to re-run — this is the full,
-- current version of the function (a later addition on top of the original race-safety fix).
--
-- public.check_ins already has `unique (session_id, student_id)` (schema-additions.sql), which is
-- what makes a duplicate scan impossible to insert twice as separate rows — that part needed no
-- change. What was missing originally: the Scanner's capacity/invite checks and the insert were
-- separate round trips, so two staff scanning the last open slot at the same moment could both
-- pass the capacity check before either had inserted. This function makes the whole decision —
-- session-open check, invite check, capacity check, insert — one atomic transaction.
--
-- Session-open check: a session's date/open_time/close_time were previously just labels — nothing
-- stopped a scan from succeeding days before an Upcoming event's session actually starts. "Now" is
-- taken from the database server's own clock (not anything the client sends), converted to
-- America/Toronto (Windsor, Ontario is Eastern Time) — matching the plain, timezone-naive way
-- every date/time column in this app has always been treated, but from a source nobody calling
-- this function can lie about.

create or replace function public.record_check_in(
  p_event_id uuid,
  p_session_id uuid,
  p_student_id uuid
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
  -- Locks the event row for the rest of this transaction, so a second concurrent call for the
  -- SAME event blocks here until the first one commits or rolls back. That's what turns the
  -- capacity check a few lines down into a real guarantee instead of a race — without this lock,
  -- two transactions could both read "1 slot left" before either had inserted.
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
    -- Table aliased and every column qualified with it — this function's own RETURNS TABLE
    -- output columns are named outcome/checked_in_at/check_in_id, which PL/pgSQL auto-declares as
    -- variables in scope for the whole function body. Since check_ins also has a checked_in_at
    -- column, an unqualified reference to it here is genuinely ambiguous (variable or column?)
    -- and Postgres will refuse to guess — qualifying with the alias resolves it to the column.
    insert into public.check_ins as ci (event_id, session_id, student_id)
    values (p_event_id, p_session_id, p_student_id)
    returning ci.id, ci.checked_in_at into v_new_id, v_new_time;

    return query select 'checked_in'::text, v_new_time, v_new_id;
    return;
  exception when unique_violation then
    -- The (session_id, student_id) unique constraint caught a duplicate — either this student's
    -- own re-scan, or another staff member's concurrent scan of the same pass winning the race.
    -- Report the check-in that actually exists rather than a generic error.
    select ci.id, ci.checked_in_at into v_new_id, v_new_time
      from public.check_ins ci
     where ci.session_id = p_session_id and ci.student_id = p_student_id;

    return query select 'already_checked_in'::text, v_new_time, v_new_id;
    return;
  end;
end;
$$;

grant execute on function public.record_check_in(uuid, uuid, uuid) to authenticated;

-- Verify: should return one row with outcome/checked_in_at/check_in_id columns.
select * from pg_proc where proname = 'record_check_in';
