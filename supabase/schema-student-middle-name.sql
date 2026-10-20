-- Fusion Check-In — adds an optional middle_name to public.students.
-- Review this, then run it in the Supabase SQL Editor BEFORE deploying the Add Student change that
-- writes middle_name (inserts will fail with an unknown-column error until this has run).

-- Nullable: most students have no middle name, and existing rows stay NULL.
alter table public.students add column if not exists middle_name text;

-- Verify: middle_name should appear as a nullable text column on students.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'students' and column_name = 'middle_name';
