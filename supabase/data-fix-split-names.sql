-- Fusion Check-In — one-time data fix: splits the old combined "First Last" values (currently
-- sitting in first_name after the rename in schema-split-name.sql) into real first_name/last_name
-- values. Run this once, right after schema-split-name.sql.
--
-- Splits on the FIRST space: "Liam Carter" -> first_name="Liam", last_name="Carter".
-- "Mary Jane Smith" -> first_name="Mary", last_name="Jane Smith" (everything after the first
-- word becomes the last name — a reasonable default for the rare multi-word case).

-- 1. Rows with at least one space: split first_name into first_name/last_name.
--    (Postgres evaluates every expression in a single UPDATE's SET list against the row's
--    pre-update values, so both columns below are computed from the *original* first_name.)
update public.students
set
  last_name = trim(substring(first_name from position(' ' in first_name) + 1)),
  first_name = trim(substring(first_name from 1 for position(' ' in first_name) - 1))
where position(' ' in first_name) > 0;

-- 2. Rows with no space at all (a single-word name) — leave first_name as-is, just make sure
--    last_name isn't left null.
update public.students
set last_name = ''
where last_name is null;

-- 3. Every row now has a last_name value — enforce it going forward.
alter table public.students alter column last_name set not null;

-- 4. Spot-check the result.
select student_number, first_name, last_name from public.students order by first_name;
