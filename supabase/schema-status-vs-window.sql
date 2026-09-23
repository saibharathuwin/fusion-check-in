-- Fusion Check-In — separates two previously-conflated time concepts:
--
--   1. The check-in WINDOW (sessions.open_time/close_time) — purely a scan-acceptance gate. A scan
--      outside this window is rejected outright ('session_not_started'/'session_closed'). This is
--      already correct and UNCHANGED by this migration.
--
--   2. The event's own scheduled time (sessions.event_start_time, new) — what actually determines
--      Early/On-time/Late. Until now, that status was computed client-side (attendanceData.ts) by
--      comparing a check-in's timestamp against the WINDOW's open/close bounds, which conflates
--      "did the scanner accept this scan" with "did this person show up on time" — a window built
--      with 30 minutes of early-arrival buffer made anyone in that buffer read as "Early" even
--      though the event's own advertised start time might be later or earlier than the window
--      implies. Status is now computed ONCE, server-side, at check-in time, from event_start_time
--      (+ a configurable grace period) — and stored, not re-derived differently by every reader.
--
-- Review this, then run it in the Supabase SQL Editor. Safe to re-run.

-- ============================================================================
-- 1. New columns
-- ============================================================================

alter table public.sessions
  add column if not exists event_start_time time,
  add column if not exists event_end_time time,
  -- Minutes after event_start_time a check-in is still counted On-time rather than Late. Per
  -- session (not a single app-wide constant) since different events reasonably want different
  -- tolerances — a 5-minute lecture doesn't forgive the same lateness a 3-hour conference does.
  add column if not exists late_grace_minutes integer not null default 10;

-- Backfill existing sessions: the best available approximation, since there was previously no
-- separate "event time" recorded at all, is that the event was scheduled to start/end exactly
-- when the check-in window did. This also means re-running the new status formula against these
-- backfilled values reproduces the exact same Early/On-time/Late split the old window-based
-- formula already gave every existing check-in — nothing already recorded silently changes label.
update public.sessions
   set event_start_time = coalesce(event_start_time, open_time),
       event_end_time = coalesce(event_end_time, close_time)
 where event_start_time is null or event_end_time is null;

alter table public.sessions
  alter column event_start_time set not null,
  alter column event_end_time set not null;

alter table public.check_ins
  add column if not exists status text
    check (status in ('early', 'on-time', 'late'));

-- Backfill every existing check-in's status using the same formula record_check_in() now uses
-- going forward (see below) — safe because of the event_start_time backfill above.
update public.check_ins ci
   set status = case
     when ci.checked_in_at at time zone 'America/Toronto' < (s.date + s.event_start_time) then 'early'
     when ci.checked_in_at at time zone 'America/Toronto' <= (s.date + s.event_start_time + make_interval(mins => s.late_grace_minutes)) then 'on-time'
     else 'late'
   end
  from public.sessions s
 where ci.session_id = s.id
   and ci.status is null;

alter table public.check_ins
  alter column status set not null;

-- ============================================================================
-- 2. ensure_default_session() — the auto-created single-session fallback for an event with no
--    explicit sessions. events.start_time/end_time already represent that event's own real
--    schedule (unlike a session's open_time/close_time, which are just the window) — exactly what
--    event_start_time/event_end_time should be seeded from here.
-- ============================================================================

drop function if exists public.ensure_default_session(uuid);

create or replace function public.ensure_default_session(p_event_id uuid)
returns table (
  id uuid,
  event_id uuid,
  label text,
  date date,
  open_time time,
  close_time time,
  checkpoint_type_id text,
  event_start_time time,
  event_end_time time,
  late_grace_minutes integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_start_date date;
  v_end_date date;
  v_start_time time;
  v_end_time time;
begin
  select events.start_date, events.end_date, events.start_time, events.end_time
    into v_start_date, v_end_date, v_start_time, v_end_time
    from public.events
   where events.id = p_event_id
   for update;

  if not found then
    return;
  end if;

  if exists (select 1 from public.sessions s where s.event_id = p_event_id) then
    return query
      select s.id, s.event_id, s.label, s.date, s.open_time, s.close_time, s.checkpoint_type_id,
             s.event_start_time, s.event_end_time, s.late_grace_minutes
        from public.sessions s
       where s.event_id = p_event_id
       order by s.date, s.open_time;
    return;
  end if;

  return query
    insert into public.sessions as sess
      (event_id, label, date, open_time, close_time, checkpoint_type_id, event_start_time, event_end_time)
    values (p_event_id, 'Check-in', v_start_date, v_start_time, v_end_time, 'check-in', v_start_time, v_end_time)
    returning sess.id, sess.event_id, sess.label, sess.date, sess.open_time, sess.close_time,
              sess.checkpoint_type_id, sess.event_start_time, sess.event_end_time, sess.late_grace_minutes;
end;
$$;

grant execute on function public.ensure_default_session(uuid) to authenticated;

-- ============================================================================
-- 3. record_check_in() — window accept/reject stays exactly as it was (untouched below); the only
--    change is computing and storing `status` from event_start_time + late_grace_minutes instead
--    of leaving status to be re-derived from the window by whoever happens to read the row later.
-- ============================================================================

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
  -- the check-in WINDOW. Unrelated to lateness; unchanged from before this migration. ---
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

  if p_method = 'manual' then
    select id into v_checked_in_by from public.staff_users where email = auth.jwt() ->> 'email';
  end if;

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

-- ============================================================================
-- 4. Verification
-- ============================================================================

select column_name, data_type, is_nullable
  from information_schema.columns
 where table_name = 'sessions' and column_name in ('event_start_time', 'event_end_time', 'late_grace_minutes');

select column_name, data_type, is_nullable
  from information_schema.columns
 where table_name = 'check_ins' and column_name = 'status';

select proname, pronargs from pg_proc where proname in ('record_check_in', 'ensure_default_session');
