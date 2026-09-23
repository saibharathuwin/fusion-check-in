// Pure attendance-status logic — deliberately has zero Supabase/network dependency so it can be
// unit tested in isolation (see checkInStatus.test.ts) and used for instant UI hints (e.g. the Add
// Event form's "marked late after H:MM" preview next to the grace-period field).
//
// This mirrors record_check_in()'s own status computation in
// supabase/schema-status-vs-window.sql — the database is the actual source of truth for a real
// check-in's stored status (computed once, at insert time), but the formula itself has to live in
// two places (SQL for real inserts, TS for anything client-side) and this file is the one kept
// under test to pin down exactly what that formula does. If you change one, change the other.
//
// The one thing to hold onto throughout this file: this logic answers "was this person on time",
// and is a completely separate question from "did the scanner accept this scan at all" — that
// second question belongs to the check-in WINDOW (sessionWindowStatus in sessionsData.ts), not
// here. A scan this module would call "early" or "late" may have already been rejected by the
// window before ever reaching this computation, and that's correct: the window doesn't know or
// care what time the event itself starts.

export type AttendanceStatus = 'early' | 'on-time' | 'late'

export interface EventTiming {
  date: string // ISO date, e.g. '2026-11-20' — same convention as EventSession.date
  eventStartTime: string // HH:MM, 24h — the event's own scheduled start, NOT the check-in window
  lateGraceMinutes: number // minutes after eventStartTime still counted On-time
}

// scannedAt before eventStartTime -> 'early'; at eventStartTime through eventStartTime +
// lateGraceMinutes (inclusive) -> 'on-time'; anything after that -> 'late'.
export function computeAttendanceStatus(timing: EventTiming, scannedAt: Date): AttendanceStatus {
  const start = new Date(`${timing.date}T${timing.eventStartTime}`)
  const graceEnds = new Date(start.getTime() + timing.lateGraceMinutes * 60_000)

  if (scannedAt < start) return 'early'
  if (scannedAt <= graceEnds) return 'on-time'
  return 'late'
}

// A small human-readable preview of the grace-period cutoff — "marked late after 8:10 AM" — used
// next to the Add/Edit Event form's grace-period field so staff can see the actual consequence of
// the number they're typing, not just the raw minute count.
export function formatLateAfterTime(timing: EventTiming): string {
  const start = new Date(`${timing.date || '2000-01-01'}T${timing.eventStartTime}`)
  const graceEnds = new Date(start.getTime() + timing.lateGraceMinutes * 60_000)
  return graceEnds.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
