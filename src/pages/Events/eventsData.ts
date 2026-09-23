import { supabase } from '../../lib/supabaseClient'

export type EventStatus = 'Upcoming' | 'Active' | 'Completed'
export type StatusMode = 'Automatic' | 'Manual'
export type Semester = 'Fall' | 'Winter' | 'Summer'
export type RegistrationType = 'Open' | 'Limited' | 'Invite-only'

export interface EventItem {
  id: string
  program: string
  eventType: string
  semester: Semester
  dateLabel: string
  timeLabel: string
  startDate: string
  location: string
  checkedIn: number
  capacity: number
  status: EventStatus
  statusMode: StatusMode
  endDate?: string
  startTime?: string
  endTime?: string
  year?: string
  description?: string
  registrationType?: RegistrationType
}

interface EventRow {
  id: string
  program: string
  event_type: string
  semester: string | null
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  location: string
  capacity: number
  status: EventStatus
  status_mode: StatusMode
  year: string | null
  description: string | null
  registration_type: RegistrationType | null
  check_ins: { count: number }[] | null
}

const SELECT_WITH_CHECKIN_COUNT = '*, check_ins(count)'

// Compares full date+time instants, not just dates — a same-day event shouldn't read as "Active"
// starting at midnight if it doesn't actually open until the evening.
export function computeEventStatus(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
  now: Date = new Date(),
): EventStatus {
  const start = new Date(`${startDate}T${startTime}`)
  const end = new Date(`${endDate}T${endTime}`)
  if (now < start) return 'Upcoming'
  if (now > end) return 'Completed'
  return 'Active'
}

// The effective ceiling for a "checked in / ___" ratio: a real cap for Limited, or — for Open,
// where any student can check in — the live total number of students in the database, since
// that's the actual practical ceiling (replaces a hardcoded number or an "∞" placeholder, and
// updates on its own as students are added/removed). null for Invite-only (which has its own
// separate "invited" count elsewhere) or a Limited event with no capacity set yet.
export function effectiveCapacity(
  event: Pick<EventItem, 'capacity' | 'registrationType'>,
  totalStudents: number | null,
): number | null {
  if (event.registrationType === 'Limited') return event.capacity > 0 ? event.capacity : null
  if (event.registrationType === 'Open') return totalStudents
  return null
}

// `totalStudents` is optional so callers that haven't fetched it yet (or never need to, e.g. a
// Limited-only context) can omit it — an Open event just shows a plain count until it's known.
export function formatCheckedInLabel(
  event: Pick<EventItem, 'checkedIn' | 'capacity' | 'registrationType'>,
  totalStudents: number | null = null,
): string {
  const capacity = effectiveCapacity(event, totalStudents)
  return capacity !== null ? `${event.checkedIn} / ${capacity} checked in` : `${event.checkedIn} checked in`
}

// Deletion permanently wipes the event's related sessions/check-ins/invitees/enrollments (they
// all cascade at the database level — see schema-additions.sql etc.), so it's only offered for an
// event that couldn't possibly have real attendance history yet: still Upcoming, and nobody has
// checked in. A Completed event, or any event with at least one check-in regardless of status, is
// never deletable through the UI — shared by the Events list and an event's own Overview page so
// both delete buttons agree.
export function canDeleteEvent(event: Pick<EventItem, 'status' | 'checkedIn'>): boolean {
  return event.status === 'Upcoming' && event.checkedIn === 0
}

export function deleteDisabledReason(event: Pick<EventItem, 'status' | 'checkedIn'>): string {
  if (event.checkedIn > 0) {
    return "Events with recorded check-ins can't be deleted, to protect historical attendance data."
  }
  if (event.status === 'Completed') {
    return "Completed events can't be deleted, to protect historical data."
  }
  return 'Only upcoming events with no check-ins yet can be deleted.'
}

export function formatDateLabel(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' })

  if (startDate === endDate) {
    return `${startMonth} ${start.getDate()}, ${start.getFullYear()}`
  }
  if (start.getFullYear() === end.getFullYear() && startMonth === endMonth) {
    return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`
  }
  return `${startMonth} ${start.getDate()}, ${start.getFullYear()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`
}

function formatTimeOfDay(time: string): string {
  const [hourStr, minuteStr] = time.split(':')
  const hour = Number(hourStr)
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${minuteStr} ${period}`
}

export function formatTimeLabel(startTime: string, endTime: string): string {
  return `${formatTimeOfDay(startTime)} – ${formatTimeOfDay(endTime)}`
}

// Time columns come back as 'HH:MM:SS' from Postgres — trim to 'HH:MM' to match what the rest
// of the app (forms, formatters) expects.
function trimTime(time: string): string {
  return time.slice(0, 5)
}

function mapRow(row: EventRow): EventItem {
  const startTime = trimTime(row.start_time)
  const endTime = trimTime(row.end_time)
  const statusMode = row.status_mode ?? 'Automatic'
  // Automatic events recompute their status fresh on every read — this is what keeps status
  // current without a cron job: any page load or refetch re-derives it from now vs. start/end.
  // Manual events keep exactly whatever status was explicitly picked, ignoring dates entirely.
  const status = statusMode === 'Automatic' ? computeEventStatus(row.start_date, startTime, row.end_date, endTime) : row.status
  return {
    id: row.id,
    program: row.program,
    eventType: row.event_type,
    semester: (row.semester ?? 'Fall') as Semester,
    dateLabel: formatDateLabel(row.start_date, row.end_date),
    timeLabel: formatTimeLabel(startTime, endTime),
    startDate: row.start_date,
    endDate: row.end_date,
    startTime,
    endTime,
    location: row.location,
    checkedIn: row.check_ins?.[0]?.count ?? 0,
    capacity: row.capacity,
    status,
    statusMode,
    year: row.year ?? undefined,
    description: row.description ?? undefined,
    registrationType: row.registration_type ?? undefined,
  }
}

// Real, ordered Supabase query against the `events` table, with each event's live check-in count
// embedded in the same round trip.
export async function fetchEvents(): Promise<EventItem[]> {
  const { data, error } = await supabase.from('events').select(SELECT_WITH_CHECKIN_COUNT).order('start_date', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => mapRow(row as unknown as EventRow))
}

export async function fetchEventById(id: string): Promise<EventItem | null> {
  const { data, error } = await supabase.from('events').select(SELECT_WITH_CHECKIN_COUNT).eq('id', id).maybeSingle()
  if (error || !data) return null
  return mapRow(data as unknown as EventRow)
}

// Creates a real `events` row and returns it with its database-assigned id. dateLabel/timeLabel
// aren't accepted — they're always derived from the stored date/time fields, never stored
// themselves.
export async function addEvent(
  event: Omit<EventItem, 'id' | 'checkedIn' | 'dateLabel' | 'timeLabel'>,
): Promise<EventItem> {
  const { data, error } = await supabase
    .from('events')
    .insert({
      program: event.program,
      event_type: event.eventType,
      semester: event.semester,
      start_date: event.startDate,
      end_date: event.endDate,
      start_time: event.startTime,
      end_time: event.endTime,
      location: event.location,
      capacity: event.capacity,
      status: event.status,
      status_mode: event.statusMode,
      year: event.year,
      description: event.description,
      registration_type: event.registrationType,
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to create event')
  return mapRow(data as EventRow)
}

// Full-payload update, mirroring addEvent's shape — the edit form always has every field
// populated/validated, so there's no need to diff against the previous value.
export async function updateEvent(
  id: string,
  event: Omit<EventItem, 'id' | 'checkedIn' | 'dateLabel' | 'timeLabel'>,
): Promise<EventItem> {
  const { data, error } = await supabase
    .from('events')
    .update({
      program: event.program,
      event_type: event.eventType,
      semester: event.semester,
      start_date: event.startDate,
      end_date: event.endDate,
      start_time: event.startTime,
      end_time: event.endTime,
      location: event.location,
      capacity: event.capacity,
      status: event.status,
      status_mode: event.statusMode,
      year: event.year,
      description: event.description,
      registration_type: event.registrationType,
    })
    .eq('id', id)
    .select(SELECT_WITH_CHECKIN_COUNT)
    .single()

  if (error || !data) throw error ?? new Error('Failed to update event')
  return mapRow(data as unknown as EventRow)
}

export interface EventDeleteImpact {
  sessionCount: number
  enrollmentCount: number
  checkInCount: number
}

// Counts of what deleting this event would take with it — used to disclose the cascade (sessions,
// enrollments) up front and to decide whether check-ins block the delete entirely.
export async function getEventDeleteImpact(id: string): Promise<EventDeleteImpact> {
  const [sessions, enrollments, checkIns] = await Promise.all([
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('event_id', id),
    supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('event_id', id),
    supabase.from('check_ins').select('id', { count: 'exact', head: true }).eq('event_id', id),
  ])
  if (sessions.error) throw sessions.error
  if (enrollments.error) throw enrollments.error
  if (checkIns.error) throw checkIns.error
  return {
    sessionCount: sessions.count ?? 0,
    enrollmentCount: enrollments.count ?? 0,
    checkInCount: checkIns.count ?? 0,
  }
}

// Real attendance history shouldn't disappear as a side effect of deleting its event — block the
// delete instead of letting the DB's on-delete-cascade silently wipe check_ins.
export class EventDeleteBlockedError extends Error {
  checkInCount: number
  constructor(checkInCount: number) {
    super(`This event has ${checkInCount} recorded check-in${checkInCount === 1 ? '' : 's'} and can't be deleted.`)
    this.name = 'EventDeleteBlockedError'
    this.checkInCount = checkInCount
  }
}

export async function deleteEvent(id: string): Promise<void> {
  const { count, error: countError } = await supabase
    .from('check_ins')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
  if (countError) throw countError
  if ((count ?? 0) > 0) throw new EventDeleteBlockedError(count ?? 0)

  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw error
}
