-- Fusion Check-In — allows a student to be created without their real student number yet.
-- Review this, then run it in the Supabase SQL Editor.
--
-- student_number was never the table's real primary key (students.id, a uuid, already is, and
-- every foreign key in the app already points at that) — it's just a unique, human-facing field.
-- Dropping NOT NULL lets a CSV import create a student from name/email alone when that's all that
-- was collected, with the real number filled in later. The existing `unique` constraint keeps
-- working unchanged: Postgres never treats two NULLs as duplicates of each other, so any number of
-- pending students can coexist.

alter table public.students alter column student_number drop not null;

-- Verify: should show student_number as nullable ('YES').
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'students' and column_name = 'student_number';
