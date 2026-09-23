-- Fusion Check-In — splits public.students.full_name into first_name + last_name.
-- Review this, then run it in the Supabase SQL Editor.
--
-- IMPORTANT: run supabase/data-fix-split-names.sql immediately after this one. Until that runs,
-- `first_name` will still hold the old "First Last" combined value for every existing row (the
-- rename below is a metadata-only operation — it does not touch the data itself) and `last_name`
-- will be empty for all of them.

-- 1. Repurpose the existing column as first_name (rename only — no data is touched).
alter table public.students rename column full_name to first_name;

-- 2. Add the new column, nullable for now — data-fix-split-names.sql backfills it for existing
--    rows and sets it NOT NULL once every row has a value.
alter table public.students add column if not exists last_name text;

-- 3. Verify: should show first_name (renamed, still holding old "First Last" values for now)
--    and last_name (new, currently empty) as columns on students.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'students'
order by ordinal_position;
