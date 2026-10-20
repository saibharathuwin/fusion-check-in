-- staff_users.role currently only allows 'Admin'/'Staff' via a check constraint — widen it to
-- also allow 'Kiosk', the shared, non-personal role used by the dedicated /kiosk sign-in page.
alter table public.staff_users drop constraint staff_users_role_check;
alter table public.staff_users add constraint staff_users_role_check check (role in ('Admin', 'Staff', 'Kiosk'));

update public.staff_users
set role = 'Kiosk'
where email = 'fusionkio@gmail.com';
