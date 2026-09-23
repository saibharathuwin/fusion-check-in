-- Fusion Check-In — adds the event fields the Add Event form already collects
-- but the original events table didn't have columns for yet.

alter table public.events add column if not exists year text;
alter table public.events add column if not exists description text;
alter table public.events add column if not exists registration_type text check (registration_type in ('Open', 'Limited'));

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'events'
order by ordinal_position;
