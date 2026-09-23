import { supabase } from '../lib/supabaseClient'

export interface CheckpointType {
  id: string
  name: string
}

export const DEFAULT_CHECKPOINT_TYPE_ID = 'check-in'

export interface EventSession {
  id: string
  eventId: string
  label: string
  date: string // ISO date, e.g. '2026-11-20'
  // The check-in WINDOW — purely when the scanner accepts a scan at all (see sessionWindowStatus
  // below). Deliberately wider than the event's own real time to give people arrival buffer.
  openTime: string // HH:MM, 24h — when the scan window opens
  closeTime: string // HH:MM, 24h — when the scan window closes
  // The event's own scheduled time — what Early/On-time/Late is actually judged against (see
  // computeAttendanceStatus in checkInStatus.ts), never the window above. eventEndTime is stored
  // for completeness but isn't used in that comparison; only eventStartTime + lateGraceMinutes is.
  eventStartTime: string // HH:MM, 24h
  eventEndTime: string // HH:MM, 24h
  // Minutes after eventStartTime a check-in still counts On-time rather than Late.
  lateGraceMinutes: number
  checkpointTypeId: string
  // How many real check-ins this session already has — used by the event edit form to decide
  // whether removing this session is safe (0) or would destroy attendance history (>0).
  checkInCount: number
}

interface SessionRow {
  id: string
  event_id: string
  label: string
  date: string
  open_time: string
  close_time: string
  event_start_time: string
  event_end_time: string
  late_grace_minutes: number
  checkpoint_type_id: string
  check_ins: { count: number }[] | null
}

const SELECT_WITH_CHECKIN_COUNT = '*, check_ins(count)'

function trimTime(time: string): string {
  return time.slice(0, 5)
}

function mapRow(row: SessionRow): EventSession {
  return {
    id: row.id,
    eventId: row.event_id,
    label: row.label,
    date: row.date,
    openTime: trimTime(row.open_time),
    closeTime: trimTime(row.close_time),
    eventStartTime: trimTime(row.event_start_time),
    eventEndTime: trimTime(row.event_end_time),
    lateGraceMinutes: row.late_grace_minutes,
    checkpointTypeId: row.checkpoint_type_id,
    checkInCount: row.check_ins?.[0]?.count ?? 0,
  }
}

export type SessionWindowStatus = 'not-started' | 'open' | 'closed'

// Where a given instant falls relative to a session's check-in window — shared by the Scanner
// (gates the camera, `at` is always "now"), the Live Check-ins tab (picks which session to show
// and labels its status tag, `at` is also "now"), and attendanceData.ts's Early/On-time/Late
// classification of a real check-in (`at` is that check-in's own checked_in_at). Takes just the
// three fields it needs rather than a full EventSession, so callers with a lighter row shape (e.g.
// a Supabase join that only selected date/open_time/close_time) don't need to fake the rest.
export function sessionWindowStatus(
  session: Pick<EventSession, 'date' | 'openTime' | 'closeTime'>,
  at: Date,
): SessionWindowStatus {
  const opens = new Date(`${session.date}T${session.openTime}`)
  const closes = new Date(`${session.date}T${session.closeTime}`)
  // An overnight session (e.g. opens 11 PM, closes 12 PM) has a close time that's earlier in the
  // day than its open time — that means it actually closes the day AFTER `date`, not the same day.
  if (session.closeTime < session.openTime) closes.setDate(closes.getDate() + 1)
  if (at < opens) return 'not-started'
  if (at > closes) return 'closed'
  return 'open'
}

export async function getSessionsForEvent(eventId: string): Promise<EventSession[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select(SELECT_WITH_CHECKIN_COUNT)
    .eq('event_id', eventId)
    .order('date', { ascending: true })
    .order('open_time', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => mapRow(row as unknown as SessionRow))
}

// Creates real `sessions` rows for a newly-created event and returns them with their
// database-assigned ids.
export async function addSessions(
  sessions: {
    label: string
    date: string
    openTime: string
    closeTime: string
    eventId: string
    checkpointTypeId: string
    eventStartTime: string
    eventEndTime: string
    lateGraceMinutes: number
  }[],
): Promise<EventSession[]> {
  const { data, error } = await supabase
    .from('sessions')
    .insert(
      sessions.map((s) => ({
        event_id: s.eventId,
        label: s.label,
        date: s.date,
        open_time: s.openTime,
        close_time: s.closeTime,
        checkpoint_type_id: s.checkpointTypeId,
        event_start_time: s.eventStartTime,
        event_end_time: s.eventEndTime,
        late_grace_minutes: s.lateGraceMinutes,
      })),
    )
    .select()
  if (error) throw error
  return (data ?? []).map((row) => mapRow(row as SessionRow))
}

interface EnsureDefaultSessionRow {
  id: string
  event_id: string
  label: string
  date: string
  open_time: string
  close_time: string
  checkpoint_type_id: string
  event_start_time: string
  event_end_time: string
  late_grace_minutes: number
}

// Auto-creates a single default session for an event that doesn't have one yet, using the
// event's own start/end date+time as the check-in window. This exists so an event doesn't need an
// explicit, manually-created session just to be scannable — the common single-day case gets one
// for free. (Events created/edited through EventForm already get this automatically; this covers
// the few older events seeded before the sessions table existed, and any other way a session-less
// event could arise.) Multi-day events still want real per-day sessions — this only builds one
// window anchored to the event's start date, not the full date range.
//
// Goes through ensure_default_session() (schema-ensure-default-session.sql) rather than a plain
// insert — that function locks the event row first, so two people opening the Scanner for the
// same session-less event at nearly the same moment can't both see zero sessions and both create
// one. checkInCount is always 0 here: a session this function just created or found for the first
// time has no check-ins yet in either case (relevant to the Edit Event form, not the Scanner).
export async function ensureDefaultSession(event: { id: string }): Promise<EventSession[]> {
  const { data, error } = await supabase.rpc('ensure_default_session', { p_event_id: event.id })
  if (error) throw error

  return ((data ?? []) as EnsureDefaultSessionRow[]).map((row) => ({
    id: row.id,
    eventId: row.event_id,
    label: row.label,
    date: row.date,
    openTime: trimTime(row.open_time),
    closeTime: trimTime(row.close_time),
    eventStartTime: trimTime(row.event_start_time),
    eventEndTime: trimTime(row.event_end_time),
    lateGraceMinutes: row.late_grace_minutes,
    checkpointTypeId: row.checkpoint_type_id,
    checkInCount: 0,
  }))
}

export async function updateSession(
  id: string,
  patch: {
    label: string
    date: string
    openTime: string
    closeTime: string
    eventStartTime: string
    eventEndTime: string
    lateGraceMinutes: number
  },
): Promise<EventSession> {
  const { data, error } = await supabase
    .from('sessions')
    .update({
      label: patch.label,
      date: patch.date,
      open_time: patch.openTime,
      close_time: patch.closeTime,
      event_start_time: patch.eventStartTime,
      event_end_time: patch.eventEndTime,
      late_grace_minutes: patch.lateGraceMinutes,
    })
    .eq('id', id)
    .select(SELECT_WITH_CHECKIN_COUNT)
    .single()
  if (error || !data) throw error ?? new Error('Failed to update session')
  return mapRow(data as unknown as SessionRow)
}

// A defensive backstop, not the primary defense — the edit form already disables removing a
// session that has check-ins (see EventForm.tsx), so this should rarely actually trigger.
export class SessionDeleteBlockedError extends Error {
  constructor(label: string, checkInCount: number) {
    super(`Session "${label}" has ${checkInCount} recorded check-in${checkInCount === 1 ? '' : 's'} and can't be removed.`)
    this.name = 'SessionDeleteBlockedError'
  }
}

export async function deleteSession(id: string, label: string): Promise<void> {
  const { count, error: countError } = await supabase
    .from('check_ins')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', id)
  if (countError) throw countError
  if ((count ?? 0) > 0) throw new SessionDeleteBlockedError(label, count ?? 0)

  const { error } = await supabase.from('sessions').delete().eq('id', id)
  if (error) throw error
}
