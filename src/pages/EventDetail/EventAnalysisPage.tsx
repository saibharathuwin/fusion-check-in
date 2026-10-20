import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { CalendarIcon, ChevronLeftIcon, PeopleIcon } from '../../components/icons/NavIcons'
import { SelectDropdown } from '../../components/SelectDropdown/SelectDropdown'
import { fetchEventAttendance, subscribeToEventCheckIns, type AttendeeRow } from '../../data/attendanceData'
import { fetchRoster, type InviteRoster } from '../../data/inviteesData'
import {
  describeDropFrom,
  droppedInScope,
  expectedInvitees,
  sortSessionsChronologically,
} from '../../data/inviteePeriods'
import { getSessionsForEvent, pickOpenSession, sessionWindowStatus, type EventSession } from '../../data/sessionsData'
import { groupSessionsByDay, localDateKey } from '../../data/sessionDays'
import { effectiveCapacity } from '../Events/eventsData'
import { STATUS_COLORS } from '../Events/pillColors'
import { countAllStudents, type Student } from '../StudentDirectory/studentDirectoryData'
import { StudentProfileModal } from '../StudentDirectory/StudentProfileModal'
import { CompletedReportView } from './CompletedReportView'
import type { DroppedEntry } from './DroppedStudentsCard'
import { LiveMonitorView } from './LiveMonitorView'
import type { EventDetailContext } from './EventDetailLayout'

// Fallback only — the live monitor's own counts update the moment a check-in happens via
// subscribeToEventCheckIns (Supabase Realtime on check_ins). This poll just covers the rare case
// the realtime channel silently drops.
const FALLBACK_POLL_MS = 60_000

function formatDayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' })
  return `${monthDay} (${weekday})`
}

// One "at a glance" tile — an icon chip plus a big number, so the handful of numbers that matter
// most read instantly without needing to parse a sentence or a table first.
function DashboardTile({
  icon,
  value,
  label,
  sublabel,
  bg,
  text,
}: {
  icon: React.ReactNode
  value: string
  label: string
  sublabel?: string
  bg: string
  text: string
}) {
  return (
    <div className="flex min-w-[190px] flex-1 items-center gap-4 rounded-2xl border border-[#eef1f6] bg-white p-5 shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ background: bg, color: text }}>
        {icon}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[26px] leading-[1.1] font-extrabold text-[#12284a]">{value}</span>
        <span className="text-[12.5px] font-semibold text-[#7c8aa0]">{label}</span>
        {sublabel && <span className="text-[11px] text-[#9aa6ba]">{sublabel}</span>}
      </div>
    </div>
  )
}

export function EventAnalysisPage() {
  const { event } = useOutletContext<EventDetailContext>()
  const isInviteOnly = event.registrationType === 'Invite-only'

  // The live student count, used as the effective capacity for an Open-registration event —
  // replaces a hardcoded number or an "∞" placeholder, and updates as students are added/removed.
  const [totalStudents, setTotalStudents] = useState<number | null>(null)
  useEffect(() => {
    countAllStudents().then(setTotalStudents)
  }, [])
  const capacity = effectiveCapacity(event, totalStudents)

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  // This event's own check-in sessions, grouped into Days — the two-level nav below only shows a
  // Day picker when the event genuinely spans more than one day, and only shows a Session picker
  // within a day when that day itself has more than one session. A plain single-session event (the
  // common case) shows neither, exactly as before.
  const [sessions, setSessions] = useState<EventSession[]>([])
  useEffect(() => {
    getSessionsForEvent(event.id).then(setSessions)
  }, [event.id])

  // A session's check-in window is deliberately allowed to open earlier than the event's own
  // scheduled start (e.g. doors/scanning from 7am for an 8am event, so early arrivals aren't stuck
  // waiting) — see openTime vs eventStartTime in sessionsData.ts. event.status itself only flips
  // from Upcoming to Active at the event's official start time, so without this the Analysis page
  // would keep showing the plain "Upcoming" tiles right through that early window even while real
  // check-ins are already coming in. Treat any open session window as "live" here too, regardless
  // of what the event's own status says yet.
  const sessionWindowOpen = sessions.some((s) => sessionWindowStatus(s, new Date()) === 'open')
  const isActive = event.status === 'Active' || (event.status === 'Upcoming' && sessionWindowOpen)
  const isCompleted = event.status === 'Completed'
  const needsAttendance = isActive || isCompleted

  const days = useMemo(() => {
    const uniqueDates = Array.from(new Set(sessions.map((s) => s.date))).sort()
    return uniqueDates.map((date, index) => ({
      date,
      label: uniqueDates.length > 1 ? `Day ${index + 1}` : 'All sessions',
      sessions: sessions.filter((s) => s.date === date).sort((a, b) => a.openTime.localeCompare(b.openTime)),
    }))
  }, [sessions])
  const isMultiDay = days.length > 1

  // 'auto' follows today while the event is active, and stops following once staff pick a day or
  // session themselves. Outside an active event it starts on 'Whole event'.
  const [pickedDay, setPickedDay] = useState<'auto' | 'all' | string>('auto')
  const [pickedSession, setPickedSession] = useState<'auto' | 'all' | string>('auto')
  const todayDate = days.find((d) => d.date === localDateKey(new Date()))?.date ?? null
  const selectedDay = pickedDay === 'auto' ? (isActive && todayDate ? todayDate : 'all') : pickedDay

  const selectedDayIsToday = selectedDay !== 'all' && selectedDay === todayDate
  const liveSessionId =
    isActive && selectedDayIsToday
      ? (pickOpenSession(days.find((d) => d.date === selectedDay)?.sessions ?? [], new Date())?.id ?? 'all')
      : 'all'
  const selectedSessionId = pickedSession === 'auto' ? liveSessionId : pickedSession

  function selectDay(date: 'all' | string) {
    setPickedDay(date)
    setPickedSession('auto') // switching days hands the session back to the clock for that day
  }

  function selectSession(sessionId: 'all' | string) {
    setPickedDay(selectedDay) // choosing a session locks the day it belongs to, too
    setPickedSession(sessionId)
  }

  // The day the Session picker works on: the chosen day, or — for a single-day event — that day.
  // Null under "Whole event", where there's no single day to pick sessions from.
  const sessionDayDate = isMultiDay ? (selectedDay === 'all' ? null : selectedDay) : (days[0]?.date ?? null)

  // The set of session ids currently in scope — null means "no filtering, show the whole event".
  const scopedSessionIds = useMemo(() => {
    if (!sessionDayDate) return null
    const day = days.find((d) => d.date === sessionDayDate)
    if (!day) return null
    if (selectedSessionId === 'all' || !day.sessions.some((s) => s.id === selectedSessionId)) return day.sessions.map((s) => s.id)
    return [selectedSessionId]
  }, [sessionDayDate, selectedSessionId, days])

  // When exactly one session is in scope, LiveMonitorView pins its focus to that specific one
  // instead of auto-detecting whichever session happens to be open right now.
  const resolvedSingleSessionId = scopedSessionIds && scopedSessionIds.length === 1 ? scopedSessionIds[0] : null

  const dayGroups = useMemo(() => groupSessionsByDay(sessions, new Date()), [sessions])
  const dayStatusByDate = useMemo(() => new Map(dayGroups.map((g) => [g.date, g])), [dayGroups])
  const completedDayCount = dayGroups.filter((g) => g.allClosed).length
  const [showEarlierDays, setShowEarlierDays] = useState(false)
  const visibleDays = days.filter((d) => showEarlierDays || d.date === selectedDay || !dayStatusByDate.get(d.date)?.allClosed)

  // Tagged with the event id it was fetched for, so "loading" and "stale from a previous event"
  // are both just derived from whether this matches the current event — no separate loading flag
  // that an effect would otherwise need to flip synchronously.
  const [attendeesData, setAttendeesData] = useState<{ eventId: string; rows: AttendeeRow[] } | null>(null)
  const allAttendees = useMemo(
    () => (attendeesData?.eventId === event.id ? attendeesData.rows : []),
    [attendeesData, event.id],
  )
  // Everything below reads from this, not allAttendees directly — scoped to whichever day/session
  // is picked in the nav above, or the full event-wide list when nothing more specific is picked.
  const attendees = useMemo(
    () => (scopedSessionIds === null ? allAttendees : allAttendees.filter((a) => a.sessionId && scopedSessionIds.includes(a.sessionId))),
    [allAttendees, scopedSessionIds],
  )
  const attendeesLoading = needsAttendance && attendeesData?.eventId !== event.id

  const loadAttendance = useCallback(() => {
    fetchEventAttendance(event.id).then((rows) => {
      setAttendeesData({ eventId: event.id, rows })
    })
  }, [event.id])

  useEffect(() => {
    if (needsAttendance) loadAttendance()
  }, [needsAttendance, loadAttendance])

  // Realtime + a slow fallback poll, both only while the event is actually in progress — an ended
  // event's attendance is final and an upcoming one has none yet, so neither needs live updates.
  useEffect(() => {
    if (!isActive) return
    const unsubscribe = subscribeToEventCheckIns(event.id, loadAttendance)
    const interval = setInterval(loadAttendance, FALLBACK_POLL_MS)
    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [isActive, event.id, loadAttendance])

  const [rosterData, setRosterData] = useState<{ eventId: string; roster: InviteRoster } | null>(null)
  const roster = rosterData?.eventId === event.id ? rosterData.roster : null
  const invitees = roster?.students ?? null
  const periods = roster?.periods ?? null

  const loadRoster = useCallback(() => {
    fetchRoster(event.id).then((r) => setRosterData({ eventId: event.id, roster: r }))
  }, [event.id])

  useEffect(() => {
    if (isInviteOnly) loadRoster()
  }, [isInviteOnly, loadRoster])

  // Everything below that counts or lists "who's expected" reads this — scoped to the session(s)
  // picked in the nav. Null until the roster has loaded, so a partial list never shows up as the
  // denominator.
  const scopeSessions = useMemo(
    () => sessions.filter((s) => scopedSessionIds === null || scopedSessionIds.includes(s.id)),
    [sessions, scopedSessionIds],
  )
  const expectedRoster = useMemo(
    () => (invitees && periods ? expectedInvitees(invitees, periods, sessions, scopeSessions) : null),
    [invitees, periods, sessions, scopeSessions],
  )
  const invitedCount = isInviteOnly && expectedRoster ? expectedRoster.length : null

  const droppedEntries = useMemo<DroppedEntry[] | null>(() => {
    if (!invitees || !periods) return null
    const firstSessionId = sortSessionsChronologically(sessions)[0]?.id
    const studentsById = new Map(invitees.map((s) => [s.uuid, s]))
    const sessionsById = new Map(sessions.map((s) => [s.id, s]))
    return droppedInScope(periods, sessions, scopeSessions).flatMap((period) => {
      const student = studentsById.get(period.studentId)
      if (!student) return []
      const from = sessionsById.get(period.droppedFromSessionId as string)
      return [{ student, drop: period, fromLabel: describeDropFrom(from, from?.id === firstSessionId) }]
    })
  }, [invitees, periods, sessions, scopeSessions])

  const statusColor = STATUS_COLORS[event.status]
  // "Whole event" (scopedSessionIds null) needs every session's id passed along explicitly, not
  // omitted — otherwise EventAttendeesPage reads an absent `sessions` param as "no filtering, show
  // every check-in row" (one per day attended) rather than "every session is in scope", and never
  // applies its attended-every-session aggregation. Matches the same full-session-list pattern
  // LiveMonitorView's own attendeeListHref already uses for an in-progress event's whole-event view.
  const attendeeListHref = scopedSessionIds
    ? `/events/${event.id}/analysis/attendees?sessions=${scopedSessionIds.join(',')}`
    : sessions.length > 0
      ? `/events/${event.id}/analysis/attendees?sessions=${sessions.map((s) => s.id).join(',')}`
      : `/events/${event.id}/analysis/attendees`

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-[26px]">
      <Link
        to={`/events/${event.id}`}
          className="inline-flex w-fit items-center gap-1 text-[13.5px] font-semibold text-[#7c8aa0] no-underline [transition:color_150ms_ease] hover:text-[#2f6fed]"
        >
          <ChevronLeftIcon size={16} />
          Back to Event
        </Link>

        {/* LiveMonitorView and CompletedReportView each render their own richer header below the
            day/session nav — this plain title only applies to Upcoming, so all three statuses
            still share the same "Back to Event" link and nav position without a redundant second
            title stacked above the status-specific view's own. */}
        {!isActive && !isCompleted && (
          <div>
            <h1 className="m-0 mb-1 text-[26px] font-extrabold text-[#1d1d1f] max-[701px]:text-[22px]">Analysis</h1>
            <p className="m-0 text-sm text-[#7c8aa0]">{event.program}</p>
          </div>
        )}

        {/* Day and Session pickers, shared by all three statuses — one line regardless of how many
            days or sessions the event has. Day only appears for a multi-day event; Session only when
            some day has more than one session. A plain single-session event shows neither. */}
        {(isMultiDay || days.some((d) => d.sessions.length > 1)) && needsAttendance && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {isMultiDay && (
              <SelectDropdown
                id="analysis-day"
                label="Day"
                value={selectedDay}
                onChange={selectDay}
                options={[
                  { key: 'all', label: 'Whole event' },
                  ...visibleDays.map((day) => ({
                    key: day.date,
                    label: `${day.label} · ${formatDayLabel(day.date)}`,
                    done: dayStatusByDate.get(day.date)?.allClosed === true,
                  })),
                ]}
                footer={
                  completedDayCount > 0
                    ? {
                        label: showEarlierDays ? 'Hide earlier days' : `Show earlier days (${completedDayCount} completed)`,
                        expanded: showEarlierDays,
                        onToggle: () => setShowEarlierDays((v) => !v),
                      }
                    : undefined
                }
              />
            )}
            <SelectDropdown
              id="analysis-session"
              label="Session"
              value={selectedSessionId}
              onChange={selectSession}
              disabled={sessionDayDate === null}
              options={
                sessionDayDate && days.find((d) => d.date === sessionDayDate)?.sessions.length
                  ? [
                      { key: 'all', label: 'All sessions' },
                      ...(days.find((d) => d.date === sessionDayDate)?.sessions ?? []).map((s) => ({ key: s.id, label: s.label })),
                    ]
                  : [{ key: 'all', label: 'All sessions' }]
              }
            />
          </div>
        )}

        {isActive ? (
          <LiveMonitorView
            event={event}
            sessions={sessions}
            allAttendees={allAttendees}
            attendeesLoading={attendeesLoading}
            pinnedSessionId={resolvedSingleSessionId}
            scopedSessionIds={scopedSessionIds}
            capacity={capacity}
            isInviteOnly={isInviteOnly}
            invitedCount={invitedCount}
            invitees={expectedRoster}
            dropped={droppedEntries}
            onSelectStudent={setSelectedStudent}
          />
        ) : isCompleted ? (
          <CompletedReportView
            event={event}
            days={days}
            allAttendees={allAttendees}
            attendees={attendees}
            attendeesLoading={attendeesLoading}
            capacity={capacity}
            isInviteOnly={isInviteOnly}
            invitedCount={invitedCount}
            invitees={expectedRoster}
            periods={periods}
            isWholeEvent={selectedDay === 'all'}
            attendeeListHref={attendeeListHref}
          />
        ) : (
          <div className="flex flex-wrap gap-[14px]">
            <DashboardTile
              icon={<CalendarIcon size={20} />}
              value={event.status}
              label="Event status"
              bg={statusColor.bg}
              text={statusColor.text}
            />
            {capacity !== null && (
              <DashboardTile
                icon={<PeopleIcon size={20} />}
                value={String(capacity)}
                label={event.registrationType === 'Open' ? 'Total students' : 'Capacity'}
                bg="#f1edfd"
                text="#8b5cf6"
              />
            )}
            {isInviteOnly && (
              <DashboardTile
                icon={<PeopleIcon size={20} />}
                value={invitedCount === null ? '—' : String(invitedCount)}
                label="Invited"
                bg="#fff8e1"
                text="#a0740f"
              />
            )}
          </div>
        )}

      <StudentProfileModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />
    </div>
  )
}
