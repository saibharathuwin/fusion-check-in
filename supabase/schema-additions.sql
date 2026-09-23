-- Fusion Check-In — schema additions for wiring the app to real Supabase data.
-- Run this once in the Supabase SQL Editor, after seed.sql. Creates the three
-- tables the app still needs (checkpoint_types, sessions, check_ins) and adds
-- insert/update policies to every table the app will now write to (previously
-- only select policies existed, since nothing wrote through the client yet).

-- ============================================================================
-- 1. New tables
-- ============================================================================

create table if not exists public.checkpoint_types (
  id text primary key,
  name text not null
);

insert into public.checkpoint_types (id, name)
values ('check-in', 'Check-in')
on conflict (id) do nothing;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  date date not null,
  open_time time not null,
  close_time time not null,
  checkpoint_type_id text not null references public.checkpoint_types(id)
);

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  -- DB-level duplicate-scan guard, matching what the Scanner already checks client-side.
  unique (session_id, student_id)
);

alter table public.checkpoint_types enable row level security;
alter table public.sessions enable row level security;
alter table public.check_ins enable row level security;

create policy "Authenticated staff can read checkpoint_types" on public.checkpoint_types for select to authenticated using (true);
create policy "Authenticated staff can read sessions" on public.sessions for select to authenticated using (true);
create policy "Authenticated staff can read check_ins" on public.check_ins for select to authenticated using (true);

-- ============================================================================
-- 2. Write policies for every table the app now inserts/updates into
--    (internal staff tool — kept simple: any authenticated staff member can
--    write, matching how every page is already gated by the app's own login).
-- ============================================================================

create policy "Authenticated staff can insert students" on public.students for insert to authenticated with check (true);
create policy "Authenticated staff can update students" on public.students for update to authenticated using (true) with check (true);

create policy "Authenticated staff can insert events" on public.events for insert to authenticated with check (true);
create policy "Authenticated staff can update events" on public.events for update to authenticated using (true) with check (true);

create policy "Authenticated staff can insert enrollments" on public.enrollments for insert to authenticated with check (true);

create policy "Authenticated staff can insert passes" on public.passes for insert to authenticated with check (true);
create policy "Authenticated staff can update passes" on public.passes for update to authenticated using (true) with check (true);

create policy "Authenticated staff can insert sessions" on public.sessions for insert to authenticated with check (true);

create policy "Authenticated staff can insert check_ins" on public.check_ins for insert to authenticated with check (true);

-- ============================================================================
-- 3. Verification
-- ============================================================================

select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
