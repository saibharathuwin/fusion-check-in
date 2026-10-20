-- Enforces at the database level what STUDENT_ID_PATTERN (src/pages/AddStudent/addStudentData.ts)
-- already enforces in both app paths that create a student (the Add Student form and CSV import):
-- exactly 9 digits, nothing else. Both those paths validate client-side, but that only protects
-- entries made through the app itself — a row inserted directly via SQL (as the SC900001/
-- SC900002/SC900003 test rows were) skips that check entirely. This constraint closes that gap
-- the same way schema-staff-uwindsor-email-check.sql did for staff emails.
--
-- Run schema-remove-test-student-rows.sql (or equivalent) FIRST if any existing row doesn't match
-- this shape — adding the constraint validates every row already in the table, and fails outright
-- if one doesn't conform.
alter table public.students
  add constraint students_student_number_format_check
  check (student_number ~ '^[0-9]{9}$');
