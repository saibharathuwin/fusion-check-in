import { sessionWindowStatus, type EventSession } from './sessionsData'

export const DROP_REASONS = ['Withdrew', 'Left early', 'Not attending', 'Other'] as const
export type DropReason = (typeof DROP_REASONS)[number]

// One stretch of time a student is invited. joinedFromSessionId null means "from the start";
// droppedFromSessionId null means "still invited". A student can have several, one after another.
export interface InviteePeriod {
  id: string
  eventId: string
  studentId: string
  joinedFromSessionId: string | null
  droppedFromSessionId: string | null
  reason: DropReason | null
  note: string | null
  joinedByName: string | null
  droppedByName: string | null
  droppedAt: string | null
  createdAt: string
}

// Sessions are compared by their real start: date first, then open time. A plain string compare
// works because both parts are zero-padded ISO-style.
export function sessionStartKey(session: Pick<EventSession, 'date' | 'openTime'>): string {
  return `${session.date}T${session.openTime}`
}

export function sortSessionsChronologically<T extends Pick<EventSession, 'date' | 'openTime'>>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => sessionStartKey(a).localeCompare(sessionStartKey(b)))
}

// The next session whose check-in window hasn't closed yet — where adds, drops and rejoins start.
export function findNextSession(orderedSessions: EventSession[], now: Date): EventSession | null {
  return orderedSessions.find((s) => sessionWindowStatus(s, now) !== 'closed') ?? null
}

// Whether a period is in force for this session: joined on or before it, and not yet dropped.
export function periodCovers(period: InviteePeriod, session: EventSession, sessionsById: Map<string, EventSession>): boolean {
  const current = sessionStartKey(session)
  if (period.joinedFromSessionId) {
    const joined = sessionsById.get(period.joinedFromSessionId)
    if (!joined || sessionStartKey(joined) > current) return false
  }
  if (period.droppedFromSessionId) {
    const dropped = sessionsById.get(period.droppedFromSessionId)
    if (!dropped || sessionStartKey(dropped) <= current) return false
  }
  return true
}

// The last session in a scope decides who counts for it: whoever is still invited by then. For
// the whole event that's everyone on the list at the end, so the total doesn't include people who
// were dropped before the end and does include people who joined along the way.
function lastSessionOf(scopeSessions: EventSession[]): EventSession | undefined {
  return sortSessionsChronologically(scopeSessions).at(-1)
}

export function expectedInvitees<T extends { uuid: string }>(
  invitees: T[],
  periods: InviteePeriod[],
  allSessions: EventSession[],
  scopeSessions: EventSession[],
): T[] {
  const last = lastSessionOf(scopeSessions)
  if (!last) {
    const openStudents = new Set(periods.filter((p) => p.droppedFromSessionId === null).map((p) => p.studentId))
    return invitees.filter((invitee) => openStudents.has(invitee.uuid))
  }
  const sessionsById = new Map(allSessions.map((s) => [s.id, s]))
  const covered = new Set(periods.filter((p) => periodCovers(p, last, sessionsById)).map((p) => p.studentId))
  return invitees.filter((invitee) => covered.has(invitee.uuid))
}

// Periods that ended (someone was dropped) by the end of the scope — the list shown beside it.
export function droppedInScope(periods: InviteePeriod[], allSessions: EventSession[], scopeSessions: EventSession[]): InviteePeriod[] {
  const ended = periods.filter((p) => p.droppedFromSessionId !== null)
  const last = lastSessionOf(scopeSessions)
  if (!last) return ended
  const sessionsById = new Map(allSessions.map((s) => [s.id, s]))
  return ended.filter((p) => {
    const dropped = sessionsById.get(p.droppedFromSessionId as string)
    return dropped !== undefined && sessionStartKey(dropped) <= sessionStartKey(last)
  })
}

export function formatSessionLabel(session: EventSession): string {
  const date = new Date(`${session.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${session.label} · ${date}`
}

// The first session in the event: starting there means the whole event, so it's labelled that way.
export function describeDropFrom(session: EventSession | undefined, isFirstSession: boolean): string {
  if (!session) return 'Unknown session'
  return isFirstSession ? 'Entire event' : formatSessionLabel(session)
}
