-- Fusion Check-In — makes Realtime DELETE events on check_ins actually reach the client.
-- Review this, then run it in the Supabase SQL Editor.
--
-- subscribeToEventCheckIns (attendanceData.ts) now also listens for DELETE (an Undo, from the new
-- "Check in manually" Undo button, or any future undo path) so the live dashboard reflects it
-- immediately instead of waiting for the 60s poll fallback. That filter is `event_id=eq.<id>`, but
-- Postgres's default REPLICA IDENTITY only includes the primary key columns in a DELETE's old-row
-- image sent over logical replication — event_id wouldn't be there at all, so the filter could
-- never match and the DELETE event would silently never arrive. REPLICA IDENTITY FULL includes
-- every column of the deleted row instead, which is what the filter actually needs.
--
-- No RLS or publication change needed — check_ins is already in supabase_realtime (see
-- schema-enable-checkins-realtime.sql) and already has its own select policy.

alter table public.check_ins replica identity full;

-- Verify: should show 'f' (full) rather than the default 'd'.
select relname, case relreplident when 'd' then 'default' when 'f' then 'full' when 'n' then 'nothing' when 'i' then 'index' end as replica_identity
from pg_class
where oid = 'public.check_ins'::regclass;
