-- schema-lock-pass-tokens.sql correctly removed direct SELECT access to public.passes entirely,
-- to stop any authenticated Staff account from reading raw tokens and forging QR codes. But that
-- also silently broke every place in the app that just wants to *display* a pass's status
-- (Student Directory, Pass Tools) — with no SELECT policy at all, the embedded `passes(status)`
-- read used throughout studentDirectoryData.ts returns null for every student, and the app falls
-- back to showing "Active" regardless of the real value. Confirmed directly: the auto-revoke fix
-- writes the correct 'Revoked' status to the database, but the app has no way to read it back.
--
-- Fix: restore row visibility via a normal RLS policy, but combine it with a column-level GRANT
-- that only exposes the harmless columns (status, student_id, id, created_at) — never `token`.
-- RLS controls which ROWS are visible; it does not by itself restrict which COLUMNS are visible,
-- so adding the policy alone would have silently re-exposed token too. This keeps
-- schema-lock-pass-tokens.sql's actual protection intact while fixing the status display.
create policy "Authenticated staff can read pass status" on public.passes
  for select to authenticated using (true);

revoke select on public.passes from authenticated;
grant select (id, student_id, status, created_at) on public.passes to authenticated;

-- Verify: should return a real status — not null/empty — but selecting token directly should
-- still fail with a permission error.
select id, student_id, status from public.passes limit 1;
