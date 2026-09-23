-- Fusion Check-In — adds the Invite-only registration type and its event_invitees lookup table.
-- Review this, then run it in the Supabase SQL Editor.
--
-- event_invitees is a lookup list ONLY — it does not generate any new pass or QR code. Students
-- keep using their single existing Fusion pass for every event.

-- 1. The existing check constraint only allows Open/Limited, so it has to be replaced before
--    'Invite-only' can be stored.
alter table public.events drop constraint if exists events_registration_type_check;
alter table public.events add constraint events_registration_type_check
  check (registration_type in ('Open', 'Limited', 'Invite-only'));

-- 2. The invite list itself. Deleting an event or a student cleans up their rows automatically.
create table if not exists public.event_invitees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, student_id)
);

alter table public.event_invitees enable row level security;
create policy "Authenticated staff can read event_invitees" on public.event_invitees for select to authenticated using (true);
create policy "Authenticated staff can insert event_invitees" on public.event_invitees for insert to authenticated with check (true);
create policy "Authenticated staff can delete event_invitees" on public.event_invitees for delete to authenticated using (true);

-- Verify: should list the new event_invitees columns, and events.registration_type should now
-- accept 'Invite-only'.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'event_invitees'
order by ordinal_position;
