-- Fusion Check-In — "Program Level" reuses the existing students.level column (already
-- Undergraduate/Graduate, already required). This just adds a database-level default so the
-- column stays defaulted to Undergraduate even for any future insert that omits it, matching the
-- app's own default. Not required for existing rows — level is already `not null`, so there are
-- no null rows to backfill.

alter table public.students alter column level set default 'Undergraduate';
