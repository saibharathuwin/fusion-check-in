-- staff_users only ever stored a single flattened full_name column. The Account tab's own edit
-- form has separate First name / Last name inputs, but on every reload it had to *guess* the split
-- (first word = first name, everything else = last name) — wrong for anyone whose first name is
-- itself multiple words (e.g. "Naga Sai Bharath Potla" was guessed as first="Naga",
-- last="Sai Bharath Potla" instead of first="Naga Sai Bharath", last="Potla"). Adding real columns,
-- same pattern already used on public.students, removes the guessing entirely.
--
-- full_name is kept (not dropped) since it's still the single field read everywhere else in the
-- app (nav, topbar initials, staff roster list) — the app code now keeps it in sync on every save
-- instead of this migration touching every read site.
alter table public.staff_users
  add column if not exists first_name text,
  add column if not exists last_name text;
