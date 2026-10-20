-- Fusion Check-In — sample data for testing
-- Creates students / events / enrollments / passes (none of these exist yet — only
-- staff_users does) and seeds a small, realistic batch: 15 students, 4 events across
-- Active/Upcoming/Completed statuses, varied enrollments, and one unique pass token
-- per student. Paste this whole file into the Supabase SQL Editor and run it.

-- ============================================================================
-- 1. Tables
-- ============================================================================

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  student_number text unique not null,
  full_name text not null,
  email text unique not null,
  faculty text not null,
  program text not null,
  level text not null check (level in ('Undergraduate', 'Graduate')),
  year text not null,
  status text not null check (status in ('Active', 'Alumni', 'Withdrawn')) default 'Active',
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  program text not null,
  event_type text not null,
  semester text,
  start_date date not null,
  end_date date not null,
  start_time time not null,
  end_time time not null,
  location text not null,
  capacity integer not null default 0,
  status text not null check (status in ('Upcoming', 'Active', 'Completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  unique (event_id, student_id)
);

create table if not exists public.passes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  -- 32-char UUID-derived hex string, no dashes — non-guessable, and the unique
  -- constraint means a duplicate token is rejected at the database level, not just
  -- checked in application code.
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  status text not null check (status in ('Active', 'Revoked')) default 'Active',
  created_at timestamptz not null default now()
);

alter table public.students enable row level security;
alter table public.events enable row level security;
alter table public.enrollments enable row level security;
alter table public.passes enable row level security;

create policy "Authenticated staff can read students" on public.students for select to authenticated using (true);
create policy "Authenticated staff can read events" on public.events for select to authenticated using (true);
create policy "Authenticated staff can read enrollments" on public.enrollments for select to authenticated using (true);
create policy "Authenticated staff can read passes" on public.passes for select to authenticated using (true);

-- ============================================================================
-- 2. Students (15 — mostly Active, 2 Alumni, mix of Undergraduate/Graduate)
-- ============================================================================

insert into public.students (student_number, full_name, email, faculty, program, level, year, status) values
  ('110200011', 'Ava Thompson',   'athompson1@uwindsor.ca', 'Faculty of Engineering',                          'Mechanical Engineering',                             'Undergraduate', 'Year 2', 'Active'),
  ('110200012', 'Liam Carter',    'lcarter2@uwindsor.ca',   'Faculty of Science',                               'Computer Science (Honours)',                         'Undergraduate', 'Year 3', 'Active'),
  ('110200013', 'Sofia Martinez', 'smartinez3@uwindsor.ca', 'Odette School of Business',                        'Bachelor of Commerce – Marketing',                   'Undergraduate', 'Year 1', 'Active'),
  ('110200014', 'Noah Bennett',   'nbennett4@uwindsor.ca',  'Faculty of Engineering',                           'Electrical Engineering',                             'Undergraduate', 'Year 4', 'Active'),
  ('110200015', 'Emma Wilson',    'ewilson5@uwindsor.ca',   'Faculty of Arts, Humanities and Social Sciences',  'Psychology',                                          'Undergraduate', 'Year 2', 'Active'),
  ('110200016', 'Ethan Roy',      'eroy6@uwindsor.ca',      'Faculty of Science',                               'Biology',                                             'Undergraduate', 'Year 3', 'Active'),
  ('110200017', 'Olivia Chen',    'ochen7@uwindsor.ca',     'Odette School of Business',                        'MBA',                                                 'Graduate',      'Year 1', 'Active'),
  ('110200018', 'Mason Clarke',   'mclarke8@uwindsor.ca',   'Faculty of Engineering',                           'Computer Science Software Engineering Specialization','Undergraduate', 'Year 2', 'Active'),
  ('110200019', 'Isabella Wright','iwright9@uwindsor.ca',   'Faculty of Human Kinetics',                        'Kinesiology',                                         'Undergraduate', 'Year 1', 'Active'),
  ('110200020', 'Lucas Kim',      'lkim10@uwindsor.ca',     'Faculty of Science',                               'Master of Applied Computing',                        'Graduate',      'Year 2', 'Active'),
  ('110200021', 'Mia Patel',      'mpatel11@uwindsor.ca',   'Faculty of Arts, Humanities and Social Sciences',  'Communication Media & Film',                         'Undergraduate', 'Year 3', 'Active'),
  ('110200022', 'Jackson Lee',    'jlee12@uwindsor.ca',     'Faculty of Engineering',                           'Industrial Engineering',                             'Undergraduate', 'Year 4', 'Active'),
  ('110200023', 'Amelia Novak',   'anovak13@uwindsor.ca',   'Faculty of Nursing',                               'Bachelor of Science in Nursing',                     'Undergraduate', 'Year 2', 'Active'),
  ('110200024', 'Ryan Osei',      'rosei14@uwindsor.ca',    'Odette School of Business',                        'Bachelor of Commerce – Finance',                     'Undergraduate', 'Year 3', 'Alumni'),
  ('110200025', 'Grace Dubois',   'gdubois15@uwindsor.ca',  'Faculty of Science',                               'Chemistry',                                          'Undergraduate', 'Year 1', 'Alumni');

-- ============================================================================
-- 3. Events (4 — one Active today, two Upcoming, one Completed)
-- ============================================================================

insert into public.events (program, event_type, semester, start_date, end_date, start_time, end_time, location, capacity, status) values
  ('NextGen Founders Workshop',      'Workshop',             'Fall', current_date,          current_date,          '10:00', '13:00', 'Fusion Reactor',   40,  'Active'),
  ('VentureU Pitch Night',           'Pitch Night',          'Fall', current_date + 14,      current_date + 14,     '18:00', '20:00', 'Fusion Reactor',   60,  'Upcoming'),
  ('Entrepreneurship Co-op Info Session', 'Information Session', 'Fall', current_date + 7,   current_date + 7,      '14:00', '15:30', 'Online (Teams)',   100, 'Upcoming'),
  ('Faculty Vanguards Mixer',        'Networking',           'Fall', current_date - 29,      current_date - 29,     '17:00', '19:00', 'Fusion Reactor',   50,  'Completed');

-- ============================================================================
-- 4. Enrollments (varied — not everyone in every event)
-- ============================================================================

with s as (select id, student_number from public.students),
     e as (select id, program from public.events)
insert into public.enrollments (event_id, student_id)
select e.id, s.id from e, s
  where e.program = 'NextGen Founders Workshop'
    and s.student_number in ('110200011','110200012','110200013','110200014','110200015','110200016','110200017','110200018')
union all
select e.id, s.id from e, s
  where e.program = 'VentureU Pitch Night'
    and s.student_number in ('110200012','110200015','110200017','110200019','110200020','110200021')
union all
select e.id, s.id from e, s
  where e.program = 'Entrepreneurship Co-op Info Session'
    and s.student_number in ('110200013','110200014','110200022','110200023','110200024')
union all
select e.id, s.id from e, s
  where e.program = 'Faculty Vanguards Mixer'
    and s.student_number in ('110200011','110200016','110200017','110200018','110200019','110200020','110200021','110200022','110200024','110200025');

-- ============================================================================
-- 5. Passes — one unique, non-guessable token per student (token is auto-generated
--    by the column default above)
-- ============================================================================

insert into public.passes (student_id)
select id from public.students;

-- ============================================================================
-- 6. Verification
-- ============================================================================

select
  (select count(*) from public.students) as total_students,
  (select count(*) from public.events) as total_events,
  (select count(*) from public.passes) as total_passes,
  (select count(*) from public.passes) = (select count(distinct token) from public.passes) as all_pass_tokens_distinct;
