-- Fusion Check-In — adds Automatic/Manual status mode to events, and the delete policies needed
-- for event deletion (and its cascades to sessions/enrollments/check_ins) to work under RLS.
-- Review this, then run it in the Supabase SQL Editor.

alter table public.events
  add column if not exists status_mode text not null default 'Automatic' check (status_mode in ('Automatic', 'Manual'));

create policy "Authenticated staff can delete events" on public.events for delete to authenticated using (true);
create policy "Authenticated staff can delete sessions" on public.sessions for delete to authenticated using (true);
create policy "Authenticated staff can delete enrollments" on public.enrollments for delete to authenticated using (true);
create policy "Authenticated staff can delete check_ins" on public.check_ins for delete to authenticated using (true);

-- Verify: status_mode should show up as a column on events, defaulted to 'Automatic' for every
-- existing row.
select id, program, status, status_mode from public.events order by start_date;
