-- One-time backfill for the students.status <-> passes.status auto-revoke fix added to
-- updateStudent (src/pages/StudentDirectory/studentDirectoryData.ts). That fix only applies going
-- forward, from the next time a student's status is actually changed TO Withdrawn — it doesn't
-- retroactively correct anyone who was already Withdrawn with a still-Active pass before this
-- existed. Run once; safe to run again later (no-ops on anyone already Revoked).
update public.passes p
set status = 'Revoked'
from public.students s
where p.student_id = s.id
  and s.status = 'Withdrawn'
  and p.status = 'Active';
