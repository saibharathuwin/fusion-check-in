import { fetchEvents, type EventItem, type EventStatus, type RegistrationType, type Semester, type StatusMode } from './eventsData'
import type { EventSession } from '../../data/sessionsData'

// Starting set of event types. Admins can type a new one on the Add Event form; once an event
// is created with it, getEventTypeSuggestions() below will surface it for future events too.
const SEED_EVENT_TYPES = [
  'Workshop',
  'Networking',
  'Competition',
  'Bootcamp',
  'Panel',
  'Speaker Series',
  'Information Session',
  'Check-in',
  'Pitch Night',
  'Launch Event',
]

export const REGISTRATION_TYPES: RegistrationType[] = ['Open', 'Limited', 'Invite-only']

export async function getProgramSuggestions(): Promise<string[]> {
  const events = await fetchEvents()
  return Array.from(new Set(events.map((e) => e.program))).sort()
}

export async function getEventTypeSuggestions(): Promise<string[]> {
  const events = await fetchEvents()
  return Array.from(new Set([...SEED_EVENT_TYPES, ...events.map((e) => e.eventType)])).sort()
}

export async function getLocationSuggestions(): Promise<string[]> {
  const events = await fetchEvents()
  return Array.from(new Set(events.map((e) => e.location))).sort()
}

// Academic calendar convention: Fall = Sep–Dec, Winter = Jan–Apr, Summer = May–Aug.
export function suggestSemester(startDate: string): Semester | '' {
  if (!startDate) return ''
  const month = Number(startDate.slice(5, 7))
  if (month >= 9) return 'Fall'
  if (month <= 4) return 'Winter'
  return 'Summer'
}

// Academic year spans Sep–Aug, so a start date in Jan–Aug belongs to the year that began the previous September.
export function suggestYear(startDate: string): string {
  if (!startDate) return ''
  const year = Number(startDate.slice(0, 4))
  const month = Number(startDate.slice(5, 7))
  return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

export interface NewEventForm {
  program: string
  eventType: string
  description: string
  year: string
  semester: Semester | ''
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  location: string
  registrationType: RegistrationType | ''
  capacity: string
  statusMode: StatusMode
  status: EventStatus
}

export const EMPTY_EVENT_FORM: NewEventForm = {
  program: '',
  eventType: '',
  description: '',
  year: '',
  semester: '',
  startDate: '',
  endDate: '',
  startTime: '',
  endTime: '',
  location: '',
  registrationType: '',
  capacity: '',
  statusMode: 'Automatic',
  status: 'Upcoming',
}

// The default grace period for a brand-new session, in minutes — how long after eventStartTime a
// check-in still reads On-time rather than Late. Editable per session; this is only the starting
// value a new row is created with.
export const DEFAULT_LATE_GRACE_MINUTES = 10

export interface SessionFormRow {
  key: string
  // Present for a session already saved to Supabase (loaded when editing); absent for a new row
  // added in the form, which hasn't been inserted yet.
  id?: string
  label: string
  labelTouched: boolean
  date: string
  // The check-in WINDOW — purely when the scanner accepts a scan at all.
  openTime: string
  closeTime: string
  // The event's own scheduled start — what Early/On-time/Late is judged against, never the window
  // above. Defaults to mirror openTime until any session field is edited by hand (see
  // EventForm.tsx's syncDefaultSession), since the common case is "the event starts right when
  // the window opens."
  eventStartTime: string
  lateGraceMinutes: number
  // Real check-ins already recorded against this session — 0 for new rows. Existing sessions
  // with a nonzero count can't be removed from the edit form (see EventForm.tsx).
  checkInCount: number
}

export function createSessionRow(overrides: Partial<SessionFormRow> = {}): SessionFormRow {
  return {
    key: `session-${Math.random().toString(36).slice(2, 9)}`,
    label: 'Check-in',
    labelTouched: false,
    date: '',
    openTime: '',
    closeTime: '',
    eventStartTime: '',
    lateGraceMinutes: DEFAULT_LATE_GRACE_MINUTES,
    checkInCount: 0,
    ...overrides,
  }
}

// --- Session "types" (quick-fill) ---------------------------------------------------------
//
// A multi-day event with the same couple of check-in windows repeating every day (Morning,
// Afternoon, ...) used to mean building every single day's session by hand — a 5-day event with
// 2 sessions a day was 10 nearly-identical cards. A SessionTypeDraft is defined ONCE (its own
// Opens/Closes/Event-starts/Grace, entered a single time) and applied across whichever days the
// staff member picks; generateSessionsFromTemplates then expands that into the real flat
// SessionFormRow[] list the rest of the form (and the database) already understands — nothing
// about how a session is stored changes, only how the common case gets typed in the first place.
// Generated rows are ordinary SessionFormRows afterward: still individually editable/removable,
// so a one-off exception (Day 3's morning session running long) is just a direct edit on that row,
// not a special case this layer needs to know about.

export interface SessionTypeDraft {
  key: string
  label: string
  openTime: string
  closeTime: string
  eventStartTime: string
  lateGraceMinutes: number
  days: string[] // ISO dates (a subset of the event's own day range) this type applies to
}

// Seeds for the "+ Morning" / "+ Afternoon" / "+ Evening" quick-add buttons — covers the common
// case with one click; "+ Custom type" (a blank draft) covers anything else.
export const SESSION_TYPE_PRESETS: { label: string; openTime: string; closeTime: string }[] = [
  { label: 'Morning', openTime: '08:00', closeTime: '12:00' },
  { label: 'Afternoon', openTime: '13:00', closeTime: '17:00' },
  { label: 'Evening', openTime: '18:00', closeTime: '21:00' },
]

export function createSessionTypeDraft(overrides: Partial<SessionTypeDraft> = {}): SessionTypeDraft {
  return {
    key: `type-${Math.random().toString(36).slice(2, 9)}`,
    label: '',
    openTime: '',
    closeTime: '',
    eventStartTime: '',
    lateGraceMinutes: DEFAULT_LATE_GRACE_MINUTES,
    days: [],
    ...overrides,
  }
}

// Every calendar date from startDate to endDate inclusive — the day range a session type's own
// day-picker offers. A missing/invalid range (no dates yet, or endDate before startDate) degrades
// to just startDate alone (or nothing), rather than throwing, since this runs on every keystroke
// while the event's own dates are still being filled in.
export function getEventDayRange(startDate: string, endDate: string): string[] {
  if (!startDate) return []
  if (!endDate || endDate < startDate) return [startDate]

  const days: string[] = []
  const cursor = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  while (cursor <= end) {
    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    const d = String(cursor.getDate()).padStart(2, '0')
    days.push(`${y}-${m}-${d}`)
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

// Expands a set of session types across the event's day range into real SessionFormRows, ordered
// day-by-day (so "Day 1 – Morning, Day 1 – Afternoon, Day 2 – Morning, ..." reads top to bottom
// the way staff actually think about a multi-day schedule) rather than type-by-type. Every
// generated row is marked labelTouched so relabelSessions' generic "Day N" auto-naming (built for
// the old one-session-per-day model) never overwrites a type's own meaningful label afterward.
export function generateSessionsFromTemplates(types: SessionTypeDraft[], dayRange: string[]): SessionFormRow[] {
  const isMultiDay = dayRange.length > 1
  const rows: SessionFormRow[] = []
  dayRange.forEach((date, dayIndex) => {
    for (const type of types) {
      if (!type.days.includes(date)) continue
      const dayLabel = isMultiDay ? `Day ${dayIndex + 1}` : ''
      const label = [dayLabel, type.label.trim()].filter(Boolean).join(' – ') || 'Check-in'
      rows.push(
        createSessionRow({
          label,
          labelTouched: true,
          date,
          openTime: type.openTime,
          closeTime: type.closeTime,
          eventStartTime: type.eventStartTime || type.openTime,
          lateGraceMinutes: type.lateGraceMinutes,
        }),
      )
    }
  })
  return rows
}

// Prefill helpers for the edit form — turn real Supabase-backed records back into editable form
// state, the inverse of what handleSubmit in EventForm.tsx builds when saving.
export function eventToForm(event: EventItem): NewEventForm {
  return {
    program: event.program,
    eventType: event.eventType,
    description: event.description ?? '',
    year: event.year ?? '',
    semester: event.semester,
    startDate: event.startDate,
    endDate: event.endDate ?? event.startDate,
    startTime: event.startTime ?? '',
    endTime: event.endTime ?? '',
    location: event.location,
    registrationType: event.registrationType ?? '',
    capacity: event.registrationType === 'Limited' ? String(event.capacity) : '',
    statusMode: event.statusMode,
    status: event.status,
  }
}

// Existing sessions are marked labelTouched so relabelSessions() never overwrites a saved label
// just because the admin added or removed a different session row during this edit. (Editing an
// existing session always sets sessionsTouched via updateSessionField, so its eventStartTime is
// never at risk of the create-flow's auto-sync overwriting it either.)
export function sessionsToFormRows(sessions: EventSession[]): SessionFormRow[] {
  return sessions.map((s) => ({
    key: s.id,
    id: s.id,
    label: s.label,
    labelTouched: true,
    date: s.date,
    openTime: s.openTime,
    closeTime: s.closeTime,
    eventStartTime: s.eventStartTime,
    lateGraceMinutes: s.lateGraceMinutes,
    checkInCount: s.checkInCount,
  }))
}

// Re-derives auto-generated labels ("Check-in" for a lone session, "Day 1"/"Day 2"/... once there
// are more) after a session is added or removed, without touching labels the admin typed themselves.
export function relabelSessions(sessions: SessionFormRow[]): SessionFormRow[] {
  return sessions.map((session, index) => {
    if (session.labelTouched) return session
    return { ...session, label: sessions.length === 1 ? 'Check-in' : `Day ${index + 1}` }
  })
}

export type SessionFormErrors = Partial<
  Record<'label' | 'date' | 'openTime' | 'closeTime' | 'eventStartTime' | 'lateGraceMinutes', string>
>

// A session whose Closes time reads earlier than its Opens time (e.g. Opens 11:00 PM, Closes
// 12:00 PM) isn't invalid — it's an overnight session, and Closes is understood to land on the
// day after the session's own Date. There's no separate stored flag for this; it's always derived
// from comparing the two times, so it can never drift out of sync with them.
export function sessionClosesNextDay(session: Pick<SessionFormRow, 'openTime' | 'closeTime'>): boolean {
  return !!session.openTime && !!session.closeTime && session.closeTime < session.openTime
}

// Minutes since midnight, shifted a full day forward when the window itself is overnight (Closes
// reads earlier than Opens) and this particular time reads earlier than Opens — the same
// "next-day" rule sessionClosesNextDay applies to Closes, extended here to eventStartTime so it
// can be compared on the same timeline regardless of which side of midnight it falls on.
function normalizedMinutes(time: string, openTime: string, isOvernight: boolean): number {
  const [h, m] = time.split(':').map(Number)
  const [oh, om] = openTime.split(':').map(Number)
  let minutes = h * 60 + m
  if (isOvernight && minutes < oh * 60 + om) minutes += 24 * 60
  return minutes
}

// The event's own scheduled start has to fall somewhere inside its check-in window — a start time
// outside the window the scanner even accepts scans during would make the "buffer before/after
// the event" the window exists for meaningless (and Early/Late badges from record_check_in()'s
// perspective would apply to check-ins that could never actually happen).
function eventStartOutsideWindow(session: Pick<SessionFormRow, 'openTime' | 'closeTime' | 'eventStartTime'>): boolean {
  if (!session.openTime || !session.closeTime || !session.eventStartTime) return false
  const isOvernight = session.closeTime < session.openTime
  const openMin = normalizedMinutes(session.openTime, session.openTime, isOvernight)
  const closeMin = normalizedMinutes(session.closeTime, session.openTime, isOvernight)
  const startMin = normalizedMinutes(session.eventStartTime, session.openTime, isOvernight)
  return startMin < openMin || startMin > closeMin
}

// `eventDates` is always the event's own current start/end date — a session has to belong to one
// of the days the event actually runs, so this one is enforced in both create and edit (unlike the
// past-date check below, which is create-only since editing legitimately needs to keep referencing
// real past dates). Opens/Closes times themselves are unrestricted — staff can pick any time of day
// for a session regardless of the event's own advertised hours; only the session's Date is tied to
// the event.
export function getSessionFormErrors(
  sessions: SessionFormRow[],
  mode: 'create' | 'edit' = 'create',
  eventDates?: { startDate: string; endDate: string },
): Record<string, SessionFormErrors> {
  const errors: Record<string, SessionFormErrors> = {}
  for (const session of sessions) {
    const rowErrors: SessionFormErrors = {}
    if (!session.label.trim()) rowErrors.label = 'Required.'
    if (!session.date) {
      rowErrors.date = 'Required.'
    } else if (mode === 'create' && !session.id && session.date < todayDateString()) {
      // !session.id: only a brand-new row being added right now, never a row that already exists
      // in the database — creating a new event with an all-new session list means every row is
      // new anyway, but this keeps the check correctly scoped if that ever changes.
      rowErrors.date = "Can't be in the past."
    } else if (
      eventDates?.startDate &&
      eventDates?.endDate &&
      (session.date < eventDates.startDate || session.date > eventDates.endDate)
    ) {
      rowErrors.date = `Must be between ${eventDates.startDate} and ${eventDates.endDate}.`
    }
    if (!session.openTime) {
      rowErrors.openTime = 'Required.'
    }
    if (!session.closeTime) {
      rowErrors.closeTime = 'Required.'
    }
    // Equal open/close times are still rejected (a zero-length window) — anything else where
    // Closes reads earlier than Opens is a legitimate overnight session, not an error.
    if (session.openTime && session.closeTime && session.closeTime === session.openTime) {
      rowErrors.closeTime = 'Open and close time cannot be the same.'
    }

    if (!session.eventStartTime) {
      rowErrors.eventStartTime = 'Required.'
    } else if (eventStartOutsideWindow(session)) {
      rowErrors.eventStartTime = 'Must fall within the check-in window (Opens–Closes).'
    }

    if (session.lateGraceMinutes === null || session.lateGraceMinutes === undefined || Number.isNaN(session.lateGraceMinutes)) {
      rowErrors.lateGraceMinutes = 'Required.'
    } else if (session.lateGraceMinutes < 0) {
      rowErrors.lateGraceMinutes = 'Cannot be negative.'
    } else if (!Number.isInteger(session.lateGraceMinutes)) {
      rowErrors.lateGraceMinutes = 'Whole minutes only.'
    }

    if (Object.keys(rowErrors).length > 0) errors[session.key] = rowErrors
  }
  return errors
}

export type EventFormErrors = Partial<Record<keyof NewEventForm, string>>

// Local (not UTC) today, as a 'YYYY-MM-DD' string — matches the date <input>'s own value format
// and this app's established convention of treating date/time fields as timezone-naive/local
// (e.g. computeEventStatus in eventsData.ts). Using toISOString() here would compare against UTC
// and could reject or accept "today" incorrectly for anyone not on UTC, especially near midnight.
export function todayDateString(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// Past-start-date is only rejected when creating a new event — editing an existing one (including
// ones already in progress or long over) legitimately needs to keep referencing dates that are now
// in the past, so 'edit' skips this one check while every other rule still applies.
export function getEventFormErrors(form: NewEventForm, mode: 'create' | 'edit' = 'create'): EventFormErrors {
  const errors: EventFormErrors = {}

  if (!form.program.trim()) errors.program = 'Program is required.'
  if (!form.eventType.trim()) errors.eventType = 'Event type is required.'
  if (!form.year.trim()) errors.year = 'Year is required.'
  if (!form.semester) errors.semester = 'Semester is required.'

  if (!form.startDate) {
    errors.startDate = 'Start date is required.'
  } else if (mode === 'create' && form.startDate < todayDateString()) {
    errors.startDate = 'Start date cannot be in the past.'
  }
  if (!form.endDate) errors.endDate = 'End date is required.'
  if (form.startDate && form.endDate && form.endDate < form.startDate) {
    errors.endDate = 'End date cannot be before the start date.'
  }

  if (!form.startTime) errors.startTime = 'Start time is required.'
  if (!form.endTime) errors.endTime = 'End time is required.'
  if (
    form.startDate &&
    form.endDate &&
    form.startDate === form.endDate &&
    form.startTime &&
    form.endTime &&
    form.endTime <= form.startTime
  ) {
    errors.endTime = 'End time must be after the start time.'
  }

  if (!form.location.trim()) errors.location = 'Location is required.'
  if (!form.registrationType) errors.registrationType = 'Registration type is required.'

  if (form.registrationType === 'Limited') {
    const capacityNum = Number(form.capacity)
    if (!form.capacity.trim() || !Number.isFinite(capacityNum) || capacityNum <= 0) {
      errors.capacity = 'Enter a capacity greater than 0.'
    }
  }

  return errors
}
