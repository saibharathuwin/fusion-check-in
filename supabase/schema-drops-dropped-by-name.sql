-- Fusion Check-In — replaces the dropped_by_email column on event_invitee_drops with
-- dropped_by_name (the staff member's full name). Run this once in the Supabase SQL Editor if
-- schema-event-invitee-drops.sql was run before the column was renamed.

alter table public.event_invitee_drops add column if not exists dropped_by_name text;
alter table public.event_invitee_drops drop column if exists dropped_by_email;

-- Verify: should list dropped_by_name and not dropped_by_email.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'event_invitee_drops'
order by ordinal_position;
