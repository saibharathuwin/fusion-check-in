import { supabase } from '../lib/supabaseClient'
import { mapStudentRow, type Student, type StudentRow } from '../pages/StudentDirectory/studentDirectoryData'
import type { AttendanceStatus } from './checkInStatus'

export type CheckInMethod = 'qr' | 'manual'

// Early/On-time/Late — computed and stored once, server-side, by record_check_in() at check-in
// time (see supabase/schema-status-vs-window.sql), from the check-in's session's own
// event_start_time + late_grace_minutes. Deliberately NOT re-derived here from the session's
// open_time/close_time WINDOW — that window only ever decided whether the scan was accepted at
// all (see sessionWindowStatus in sessionsData.ts), a separate question from whether the person
// was on time. Re-exported under this table's historical name so every existing caller
// (AttendeeRow.status, CHECK_IN_STATUS_BADGE, etc.) keeps working unchanged.
export type CheckInStatus = AttendanceStatus

export interface AttendeeRow {
  checkInId: string
  student: Student
  checkedInAt: string // ISO datetime
  method: CheckInMethod
  // The staff member who performed a manual check-in — null for every QR scan, and null for a
  // manual one too if their staff_users row somehow couldn't be resolved server-side.
  checkedInBy: string | null
  // Early/on-time/late — the value record_check_in() computed and stored at check-in time, from
  // THIS check-in's own session's event_start_time + late_grace_minutes (never its check-in
  // window), so a multi-session event judges each check-in against the right day's real start.
  status: CheckInStatus
  // The session's own date+event_start_time as an ISO instant, for display (e.g. "12 min late") —
  // deliberately the event's real scheduled start, not the check-in window's open time, so a "how
  // late" reading matches the status badge it's shown next to. Null only if the session row was
  // somehow missing (check_ins.session_id is not-null, so this shouldn't happen in practice, but
  // the join is still a left join at the type level).
  eventStartsAt: string | null
  // Which session this check-in actually belongs to — the Analysis page filters/groups by this
  // for multi-session events, rather than lumping every session's check-ins into one list. Null
  // only in the same not-actually-expected case as eventStartsAt above.
  sessionId: string | null
}

interface JoinedSession {
  date: string
  event_start_time: string
}

interface JoinedStaffUser {
  full_name: string
}

interface CheckInWithStudentRow {
  id: string
  checked_in_at: string
  method: CheckInMethod
  status: CheckInStatus
  session_id: string | null
  students: StudentRow | StudentRow[] | null
  sessions: JoinedSession | JoinedSession[] | null
  checked_in_by_staff: JoinedStaffUser | JoinedStaffUser[] | null
}

function firstOf<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

const STUDENT_SELECT =
  'id, student_number, first_name, last_name, email, faculty, program, level, year, status, created_at, passes(status)'

export async function fetchEventAttendance(eventId: string): Promise<AttendeeRow[]> {
  const { data, error } = await supabase
    .from('check_ins')
    .select(
      `id, checked_in_at, method, status, session_id, students(${STUDENT_SELECT}), sessions(date, event_start_time), checked_in_by_staff:staff_users(full_name)`,
    )
    .eq('event_id', eventId)
    .order('checked_in_at', { ascending: false })
  if (error) throw error

  return (data ?? [])
    .map((raw) => {
      const row = raw as unknown as CheckInWithStudentRow
      const studentRow = firstOf(row.students)
      if (!studentRow) return null
      const session = firstOf(row.sessions)
      const eventStartsAt = session ? `${session.date}T${session.event_start_time}` : null
      const staff = firstOf(row.checked_in_by_staff)

      return {
        checkInId: row.id,
        student: mapStudentRow(studentRow),
        checkedInAt: row.checked_in_at,
        method: row.method,
        checkedInBy: staff?.full_name ?? null,
        status: row.status,
        eventStartsAt,
        sessionId: row.session_id,
      }
    })
    .filter((row): row is AttendeeRow => row !== null)
}

// Fires `onChange` whenever a new check-in row is inserted for this event, so the Analysis page's
// Live Check-ins/Late Arrivals tabs and its Overview count can update the moment a scan succeeds,
// without polling. Requires check_ins to be in the supabase_realtime publication — see
// schema-enable-checkins-realtime.sql. Returns an unsubscribe function.
export function subscribeToEventCheckIns(eventId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`check-ins-event-${eventId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'check_ins', filter: `event_id=eq.${eventId}` },
      onChange,
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

// The full set of outcomes the atomic record_check_in() database function can report — see
// supabase/schema-atomic-checkin.sql. Everything that decides whether a scan is allowed (session
// open, already checked in, invite-only gate, capacity gate) happens inside one Postgres
// transaction, so two staff scanning at nearly the same moment can never both succeed where only
// one should. session_not_started/session_closed are the server-side backstop for the Scanner's
// own pre-camera time check (ScannerPage.tsx) — that client check is only a UX nicety for not
// wasting a camera prompt; this is what actually stops an early/late check-in from being possible
// at all, even via a direct call to this function.
export type CheckInOutcome =
  | 'checked_in'
  | 'already_checked_in'
  | 'not_invited'
  | 'at_capacity'
  | 'session_not_started'
  | 'session_closed'
  | 'session_not_found'
  | 'event_not_found'

export interface CheckInAttempt {
  outcome: CheckInOutcome
  // Set for 'checked_in' (the new row's time) and 'already_checked_in' (the ORIGINAL check-in's
  // time, so staff can see when the student actually arrived, not just that they already did).
  checkedInAt: string | null
  checkInId: string | null
  // Set alongside checkedInAt, for the same two outcomes — lets a caller show the Early/On-time/
  // Late badge immediately from this one round trip, without a separate fetch.
  status: CheckInStatus | null
}

interface RecordCheckInRow {
  outcome: CheckInOutcome
  checked_in_at: string | null
  check_in_id: string | null
  status: CheckInStatus | null
}

// Single round trip that atomically decides and (if allowed) records a check-in. Takes the
// student's real table uuid, not their student number — event_invitees and check_ins are both
// keyed on it. `method` defaults to 'qr' (the Scanner's own calls never pass it); the Live
// Check-ins tab's manual "Check in" fallback passes 'manual' explicitly — everything else about
// the check (session window, invite, capacity) is identical either way.
export async function recordCheckIn(params: {
  eventId: string
  sessionId: string
  studentUuid: string
  method?: CheckInMethod
}): Promise<CheckInAttempt> {
  const { data, error } = await supabase.rpc('record_check_in', {
    p_event_id: params.eventId,
    p_session_id: params.sessionId,
    p_student_id: params.studentUuid,
    p_method: params.method ?? 'qr',
  })
  if (error) throw error

  const row = (Array.isArray(data) ? data[0] : data) as RecordCheckInRow | undefined
  if (!row) throw new Error('record_check_in returned no result')

  return { outcome: row.outcome, checkedInAt: row.checked_in_at, checkInId: row.check_in_id, status: row.status }
}

// Deletes a check-in outright — for correcting a mistaken scan. Goes through the undo_check_in()
// SECURITY DEFINER function (schema-checkin-method-and-undo.sql) since check_ins has no plain
// delete RLS policy.
export async function undoCheckIn(checkInId: string): Promise<void> {
  const { error } = await supabase.rpc('undo_check_in', { p_check_in_id: checkInId })
  if (error) throw error
}
