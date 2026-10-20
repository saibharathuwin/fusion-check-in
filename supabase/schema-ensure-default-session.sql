-- Fusion Check-In — makes auto-creating an event's default check-in session race-safe.
-- Review this, then run it in the Supabase SQL Editor.
--
-- An event with zero sessions now gets one created transparently the first time the Scanner
-- looks for it (sessionPicker.ts), using the event's own start/end date+time. Done as a plain
-- client-side "check then insert", two people opening the Scanner for the same session-less event
-- at nearly the same moment could both see zero sessions and both insert one — exactly the same
-- class of race the check-in system already had to solve. This function closes it the same way:
-- lock the event row so concurrent callers serialize, and only the first one actually inserts.

create or replace function public.ensure_default_session(p_event_id uuid)
returns table (
  id uuid,
  event_id uuid,
  label text,
  date date,
  open_time time,
  close_time time,
  checkpoint_type_id text
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
  -- Locks the event row for the rest of this transaction, so a second concurrent call for the
  -- SAME event blocks here until the first one commits — the same technique record_check_in()
  -- uses to make its own capacity check race-safe.
  select events.start_date, events.end_date, events.start_time, events.end_time
    into v_start_date, v_end_date, v_start_time, v_end_time
    from public.events
   where events.id = p_event_id
   for update;

  if not found then
    return;
  end if;

  -- Someone (this call or a concurrent one that already committed) may have created a session for
  -- this event already — if so, just return what's there instead of adding another.
  if exists (select 1 from public.sessions s where s.event_id = p_event_id) then
    return query
      select s.id, s.event_id, s.label, s.date, s.open_time, s.close_time, s.checkpoint_type_id
        from public.sessions s
       where s.event_id = p_event_id
       order by s.date, s.open_time;
    return;
  end if;

  return query
    insert into public.sessions as sess (event_id, label, date, open_time, close_time, checkpoint_type_id)
    values (p_event_id, 'Check-in', v_start_date, v_start_time, v_end_time, 'check-in')
    returning sess.id, sess.event_id, sess.label, sess.date, sess.open_time, sess.close_time, sess.checkpoint_type_id;
end;
$$;

grant execute on function public.ensure_default_session(uuid) to authenticated;
