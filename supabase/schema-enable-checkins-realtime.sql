-- Fusion Check-In — enables Supabase Realtime on check_ins.
-- Review this, then run it in the Supabase SQL Editor.
--
-- The Event Analysis page's Live Check-ins / Late Arrivals tabs and its Overview stat cards need
-- to update the moment a new check-in happens, without polling. Supabase Realtime's
-- postgres_changes only delivers events for tables explicitly added to the supabase_realtime
-- publication — this app has never used Realtime before, so check_ins isn't in it yet.
--
-- No RLS change needed: check_ins already has a select policy for authenticated (schema-
-- additions.sql), which postgres_changes respects for who receives the events.

alter publication supabase_realtime add table public.check_ins;

-- Verify: check_ins should now be listed alongside whatever else is already in the publication.
select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime';
