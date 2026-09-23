-- Fusion Check-In — fixes editing an event's check-in sessions.
--
-- public.sessions has select/insert/delete policies but no UPDATE policy, so every attempt to
-- edit an existing session silently matched 0 rows under RLS and the Edit Event form failed with
-- "Something went wrong saving this event." Adding the missing policy makes session edits work.

create policy "Authenticated staff can update sessions" on public.sessions for update to authenticated using (true) with check (true);
