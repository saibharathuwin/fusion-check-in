import { fetchEvents, type EventItem, type EventStatus, type RegistrationType, type Semester, type StatusMode } from './eventsData'
import type { EventSession } from '../../data/sessionsData'
import { formatTime12h } from '../../components/TimePicker/timeUtils'

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

export interface NewEventForm {
  program: string
  eventType: string
  description: string
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
  // The event's own scheduled end — purely descriptive (shown on the form, saved to the database)
  // and NOT used in the Early/On-time/Late judgment, which only ever looks at eventStartTime +
  // lateGraceMinutes. Defaults to mirror closeTime until edited by hand, same convention as
  // eventStartTime defaulting to openTime.
  eventEndTime: string
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
    eventEndTime: '',
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
  eventEndTime: string
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
    eventEndTime: '',
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
          eventEndTime: type.eventEndTime || type.closeTime,
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
    eventEndTime: s.eventEndTime,
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
  Record<'label' | 'date' | 'openTime' | 'closeTime' | 'eventStartTime' | 'eventEndTime' | 'lateGraceMinutes', string>
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
//
// Only "starts after Closes" is still a hard error here — that's backwards (the window has
// already shut before the event even begins) and is almost always a typo. "Starts before Opens"
// used to be an error too, but that's actually a legitimate, if unusual, setup (check-in simply
// hasn't caught up with a session that started early) — see getSessionFormWarnings below, which
// flags it instead without blocking saving.
function eventStartOutsideWindow(session: Pick<SessionFormRow, 'openTime' | 'closeTime' | 'eventStartTime'>): boolean {
  if (!session.openTime || !session.closeTime || !session.eventStartTime) return false
  const isOvernight = session.closeTime < session.openTime
  const closeMin = normalizedMinutes(session.closeTime, session.openTime, isOvernight)
  const startMin = normalizedMinutes(session.eventStartTime, session.openTime, isOvernight)
  return startMin > closeMin
}

// Same idea as eventStartOutsideWindow, for the event's own scheduled end — it has to fall inside
// the check-in window too, and can't read earlier than the event's own start (an event can't end
// before it begins).
//
// "Ends after Closes" used to be an error too — relaxed to a warning for the same reason as
// above (see getSessionFormWarnings): a real, if unusual, setup, not something worth blocking on.
// "Ends before Opens" or "ends before it starts" stay hard errors — both are backwards.
function eventEndOutsideWindow(
  session: Pick<SessionFormRow, 'openTime' | 'closeTime' | 'eventStartTime' | 'eventEndTime'>,
): boolean {
  if (!session.openTime || !session.closeTime || !session.eventEndTime) return false
  const isOvernight = session.closeTime < session.openTime
  const openMin = normalizedMinutes(session.openTime, session.openTime, isOvernight)
  const endMin = normalizedMinutes(session.eventEndTime, session.openTime, isOvernight)
  if (endMin < openMin) return true
  if (session.eventStartTime) {
    const startMin = normalizedMinutes(session.eventStartTime, session.openTime, isOvernight)
    if (endMin < startMin) return true
  }
  return false
}

// Non-blocking advisories for the session create/edit form — unlike getSessionFormErrors, nothing
// here stops a session from being saved. Each covers a setup that's real and sometimes
// intentional, but worth a second look:
//   - the event's own start/end reads outside its check-in window (staff meant the window to
//     fully contain the event, but it doesn't quite)
//   - two sessions on the same day have check-in windows that overlap (see pickOpenSession in
//     sessionsData.ts for how the app resolves a scan during the overlap — whichever session's
//     start time is closest to the scan wins, whether that start is just past or still upcoming)
export function getSessionFormWarnings(sessions: SessionFormRow[]): Record<string, string[]> {
  const warnings: Record<string, string[]> = {}

  for (const session of sessions) {
    if (!session.openTime || !session.closeTime) continue
    const isOvernight = session.closeTime < session.openTime
    const openMin = normalizedMinutes(session.openTime, session.openTime, isOvernight)
    const closeMin = normalizedMinutes(session.closeTime, session.openTime, isOvernight)
    const rowWarnings: string[] = []

    if (session.eventStartTime) {
      const startMin = normalizedMinutes(session.eventStartTime, session.openTime, isOvernight)
      if (startMin < openMin) {
        rowWarnings.push(
          `This session starts at ${formatTime12h(session.eventStartTime)}, but check-in doesn't open until ` +
            `${formatTime12h(session.openTime)}. No one can check in before then, and anyone checking in right ` +
            `when the window opens may already show as Late.`,
        )
      }
    }

    if (session.eventEndTime) {
      const endMin = normalizedMinutes(session.eventEndTime, session.openTime, isOvernight)
      if (endMin > closeMin) {
        rowWarnings.push(
          `Check-in closes at ${formatTime12h(session.closeTime)}, but this session doesn't end until ` +
            `${formatTime12h(session.eventEndTime)}. No one can check in during the final stretch of the event.`,
        )
      }
    }

    if (session.date) {
      for (const other of sessions) {
        if (other === session || other.date !== session.date || !other.openTime || !other.closeTime) continue
        if (windowsOverlap(session, other)) {
          const label = other.label.trim() || 'another session'
          rowWarnings.push(
            `This session's check-in window (${formatTime12h(session.openTime)}–${formatTime12h(session.closeTime)}) ` +
              `overlaps with "${label}"'s (${formatTime12h(other.openTime)}–${formatTime12h(other.closeTime)}). ` +
              `During the overlap, a scan goes to whichever session's start time is closer to the moment of the scan — double-check that's what you want.`,
          )
        }
      }
    }

    if (rowWarnings.length > 0) warnings[session.key] = rowWarnings
  }

  return warnings
}

// Whether two same-day sessions' check-in windows share any real span of time — each window
// normalized onto session A's own open time (so an overnight window on either side still compares
// correctly), then checked as a plain interval overlap. Touching exactly at the boundary (one
// closes the instant the other opens) doesn't count as overlapping.
function windowsOverlap(a: Pick<SessionFormRow, 'openTime' | 'closeTime'>, b: Pick<SessionFormRow, 'openTime' | 'closeTime'>): boolean {
  const isOvernight = a.closeTime < a.openTime
  const aOpen = normalizedMinutes(a.openTime, a.openTime, isOvernight)
  const aClose = normalizedMinutes(a.closeTime, a.openTime, isOvernight)
  let bOpen = normalizedMinutes(b.openTime, a.openTime, isOvernight)
  let bClose = normalizedMinutes(b.closeTime, a.openTime, isOvernight)
  if (bClose < bOpen) bClose += 24 * 60 // b is itself overnight — keep its own span intact
  if (bOpen < aOpen - 24 * 60) {
    bOpen += 24 * 60
    bClose += 24 * 60
  }
  return aOpen < bClose && bOpen < aClose
}

// `eventDates` is always the event's own current start/end date (plus, now, its start/end time) —
// a session has to belong to one of the days the event actually runs, so the date check is enforced
// in both create and edit (unlike the past-date check below, which is create-only since editing
// legitimately needs to keep referencing real past dates). Opens/Closes TIMES are still otherwise
// unrestricted (a session can open well before the event's own advertised start — that's the
// arrival-buffer the window exists for) — the one exception is the event's own last day, where
// Closes can't run past the event's overall End time; past that point the event has moved to
// Completed status everywhere else in the app regardless of what any session's window still says.
export function getSessionFormErrors(
  sessions: SessionFormRow[],
  mode: 'create' | 'edit' = 'create',
  eventDates?: { startDate: string; endDate: string; startTime?: string; endTime?: string },
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
    // Only checked on the event's own last day, and only when Closes doesn't already read as an
    // overnight window (session.closeTime >= session.openTime) — an overnight session on the last
    // day is a separate, rarer case this isn't trying to cover.
    if (
      !rowErrors.closeTime &&
      eventDates?.endDate &&
      eventDates?.endTime &&
      session.date === eventDates.endDate &&
      session.closeTime &&
      session.openTime &&
      session.closeTime >= session.openTime &&
      session.closeTime > eventDates.endTime
    ) {
      rowErrors.closeTime = "Closes after the event's own End time on its last day."
    }

    if (!session.eventStartTime) {
      rowErrors.eventStartTime = 'Required.'
    } else if (eventStartOutsideWindow(session)) {
      rowErrors.eventStartTime = 'Must fall within the check-in window (Opens–Closes).'
    }

    if (!session.eventEndTime) {
      rowErrors.eventEndTime = 'Required.'
    } else if (eventEndOutsideWindow(session)) {
      rowErrors.eventEndTime = "Must fall within the check-in window, and can't be before Event starts."
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
