-- Enforces at the database level what src/pages/Settings/emailDomain.ts already enforces in the
-- app's own forms: Admin and Staff accounts must use a real @uwindsor.ca email (case-insensitive
-- suffix match, matching isUwindsorEmail's .toLowerCase().endsWith() check exactly). Kiosk is the
-- one shared, non-personal device login and stays exempt, same as in the app logic.
--
-- The app's UI validation only protects account creation done through the app's own forms (Add
-- Staff dialog, Change Email). Any account created by running SQL directly in the Supabase SQL
-- Editor bypasses that — this constraint closes that gap so it can't happen even by mistake.
alter table public.staff_users
  add constraint staff_users_admin_staff_uwindsor_email_check
  check (role not in ('Admin', 'Staff') or lower(email) like '%@uwindsor.ca');
