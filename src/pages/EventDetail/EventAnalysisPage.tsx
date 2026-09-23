import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { CalendarIcon, ChevronLeftIcon, PeopleIcon } from '../../components/icons/NavIcons'
import { StudentCard } from '../../components/StudentCard/StudentCard'
import { fetchEventAttendance, subscribeToEventCheckIns, type AttendeeRow } from '../../data/attendanceData'
import { fetchInvitees, countInvitees } from '../../data/inviteesData'
import { getSessionsForEvent, type EventSession } from '../../data/sessionsData'
import { effectiveCapacity } from '../Events/eventsData'
import { STATUS_COLORS } from '../Events/pillColors'
import { countAllStudents, type Student } from '../StudentDirectory/studentDirectoryData'
import { StudentProfileModal } from '../StudentDirectory/StudentProfileModal'
import { LoadingState } from './attendeeDisplay'
import { CARD_GRID_CLASSES, EMPTY_STATE_CLASSES } from './attendeeFormatting'
import { CompletedReportView } from './CompletedReportView'
import { LiveMonitorView } from './LiveMonitorView'
import type { EventDetailContext } from './EventDetailLayout'

// Fallback only — the live monitor's own counts update the moment a check-in happens via
// subscribeToEventCheckIns (Supabase Realtime on check_ins). This poll just covers the rare case
// the realtime channel silently drops.
const FALLBACK_POLL_MS = 60_000

// The only tab left here — Invited Students, for an Upcoming Invite-only event (there's nothing
// "live" to show yet, so it's the only sub-view an Upcoming event has). Active and Completed each
// get their own full-page view instead (LiveMonitorView and CompletedReportView) rather than tabs.
type DetailTabKey = 'invited'

function formatDayLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

function InvitedStudentsGrid({
  students,
  eventId,
  onSelect,
}: {
  students: Student[]
  eventId: string
  onSelect: (student: Student) => void
}) {
  if (students.length === 0) {
    return (
      <div className={EMPTY_STATE_CLASSES}>
        <p className="m-0 text-sm text-[#7c8aa0]">No students invited yet.</p>
        <Link
          to={`/events/${eventId}/edit`}
          className="mt-1 inline-flex items-center gap-1.5 rounded-[10px] border-none bg-[linear-gradient(120deg,#0d9488,#14b8a6)] px-5 py-2.5 text-[13.5px] font-bold text-white no-underline cursor-pointer [transition:transform_150ms_ease] hover:-translate-y-0.5"
        >
          + Invite students
        </Link>
      </div>
    )
  }

  return (
    <div className={CARD_GRID_CLASSES}>
      {students.map((student) => (
        <StudentCard key={student.uuid} student={student} onClick={() => onSelect(student)} />
      ))}
    </div>
  )
}

export function EventAnalysisPage() {
  const { event } = useOutletContext<EventDetailContext>()
  const isInviteOnly = event.registrationType === 'Invite-only'
  const isActive = event.status === 'Active'
  const isCompleted = event.status === 'Completed'
  const needsAttendance = isActive || isCompleted

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

  const days = useMemo(() => {
    const uniqueDates = Array.from(new Set(sessions.map((s) => s.date))).sort()
    return uniqueDates.map((date, index) => ({
      date,
      label: uniqueDates.length > 1 ? `Day ${index + 1}` : 'All sessions',
      sessions: sessions.filter((s) => s.date === date).sort((a, b) => a.openTime.localeCompare(b.openTime)),
    }))
  }, [sessions])
  const isMultiDay = days.length > 1

  const [selectedDay, setSelectedDay] = useState<'all' | string>('all')
  const [selectedSessionId, setSelectedSessionId] = useState<'all' | string>('all')

  function selectDay(date: 'all' | string) {
    setSelectedDay(date)
    setSelectedSessionId('all') // switching days always resets which session within that day is picked
  }

  // The set of session ids currently in scope — null means "no filtering, show the whole event".
  const scopedSessionIds = useMemo(() => {
    if (selectedDay === 'all') return null
    const day = days.find((d) => d.date === selectedDay)
    if (!day) return null
    if (selectedSessionId === 'all') return day.sessions.map((s) => s.id)
    return [selectedSessionId]
  }, [selectedDay, selectedSessionId, days])

  // When exactly one session is in scope, LiveMonitorView pins its focus to that specific one
  // instead of auto-detecting whichever session happens to be open right now.
  const resolvedSingleSessionId = scopedSessionIds && scopedSessionIds.length === 1 ? scopedSessionIds[0] : null

  const daySessions = selectedDay === 'all' ? [] : (days.find((d) => d.date === selectedDay)?.sessions ?? [])

  // Upcoming Invite-only is the only status left with a tab at all, and there's only ever the one
  // (Invited Students) — so there's no tab-switcher UI anymore, just whether it applies.
  const activeTab: DetailTabKey | null = !isActive && !isCompleted && isInviteOnly ? 'invited' : null

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

  const [invitedCountData, setInvitedCountData] = useState<{ eventId: string; count: number } | null>(null)
  const invitedCount = invitedCountData?.eventId === event.id ? invitedCountData.count : null

  useEffect(() => {
    if (isInviteOnly) countInvitees(event.id).then((count) => setInvitedCountData({ eventId: event.id, count }))
  }, [isInviteOnly, event.id])

  const [inviteesData, setInviteesData] = useState<{ eventId: string; rows: Student[] } | null>(null)
  const invitees = inviteesData?.eventId === event.id ? inviteesData.rows : null
  const inviteesLoading = activeTab === 'invited' && invitees === null

  // The Invited Students tab needs the roster to list it; LiveMonitorView/CompletedReportView need
  // the same roster (Invite-only only) for their "Not checked in yet"/"No-shows" cards, independent
  // of any tab.
  useEffect(() => {
    if ((activeTab === 'invited' || (needsAttendance && isInviteOnly)) && invitees === null) {
      fetchInvitees(event.id).then((rows) => setInviteesData({ eventId: event.id, rows }))
    }
  }, [activeTab, needsAttendance, isInviteOnly, invitees, event.id])

  const statusColor = STATUS_COLORS[event.status]
  const attendeeListHref = `/events/${event.id}/analysis/attendees${scopedSessionIds ? `?sessions=${scopedSessionIds.join(',')}` : ''}`

  return (
    <div className="box-border flex min-h-screen justify-center bg-[linear-gradient(180deg,#f4fdfc_0%,#f7f9fc_100%)] px-6 pt-14 pb-20 max-[701px]:px-4 max-[701px]:pt-9 max-[701px]:pb-15">
      <div className="flex w-full max-w-[1240px] flex-col gap-[26px]">
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
            <h1 className="m-0 mb-1 text-[26px] font-extrabold text-[#12284a] max-[701px]:text-[22px]">Analysis</h1>
            <p className="m-0 text-sm text-[#7c8aa0]">{event.program}</p>
          </div>
        )}

        {/* Two-level Day → Session nav, shared by all three statuses. Only a Day row when the event
            spans more than one day; only a Session row underneath once a specific day with more
            than one session is picked. A plain single-session event shows neither. */}
        {(isMultiDay || days.some((d) => d.sessions.length > 1)) && needsAttendance && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold tracking-[0.5px] text-[#9aa6ba] uppercase">
                {isMultiDay ? 'Day' : 'Session'}:
              </span>
              <button
                type="button"
                onClick={() => selectDay('all')}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] ${
                  selectedDay === 'all' ? 'bg-[#0d9488] text-white' : 'bg-[#eef1f6] text-[#56617a] hover:bg-[#e2e6ee]'
                }`}
              >
                Whole event
              </button>
              {isMultiDay
                ? days.map((day) => (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => selectDay(day.date)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] ${
                        selectedDay === day.date ? 'bg-[#0d9488] text-white' : 'bg-[#eef1f6] text-[#56617a] hover:bg-[#e2e6ee]'
                      }`}
                    >
                      {day.label} <span className="opacity-70">· {formatDayLabel(day.date)}</span>
                    </button>
                  ))
                : days[0]?.sessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => {
                        setSelectedDay(session.date)
                        setSelectedSessionId(session.id)
                      }}
                      className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] ${
                        selectedSessionId === session.id && selectedDay !== 'all'
                          ? 'bg-[#0d9488] text-white'
                          : 'bg-[#eef1f6] text-[#56617a] hover:bg-[#e2e6ee]'
                      }`}
                    >
                      {session.label}
                    </button>
                  ))}
            </div>

            {isMultiDay && selectedDay !== 'all' && daySessions.length > 1 && (
              <div className="ml-1 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold tracking-[0.5px] text-[#c7d0e0] uppercase">Session:</span>
                <button
                  type="button"
                  onClick={() => setSelectedSessionId('all')}
                  className={`rounded-full px-2.5 py-1 text-[12px] font-bold cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] ${
                    selectedSessionId === 'all' ? 'bg-[#ccfbf1] text-[#0d9488]' : 'bg-[#f7f9fc] text-[#7c8aa0] hover:bg-[#eef1f6]'
                  }`}
                >
                  All day
                </button>
                {daySessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`rounded-full px-2.5 py-1 text-[12px] font-bold cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] ${
                      selectedSessionId === session.id ? 'bg-[#ccfbf1] text-[#0d9488]' : 'bg-[#f7f9fc] text-[#7c8aa0] hover:bg-[#eef1f6]'
                    }`}
                  >
                    {session.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {isActive ? (
          <LiveMonitorView
            event={event}
            sessions={sessions}
            allAttendees={allAttendees}
            attendeesLoading={attendeesLoading}
            pinnedSessionId={resolvedSingleSessionId}
            capacity={capacity}
            isInviteOnly={isInviteOnly}
            invitedCount={invitedCount}
            invitees={invitees}
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
            invitees={invitees}
            attendeeListHref={attendeeListHref}
          />
        ) : (
          <>
            {/* Upcoming — no attendance yet, just the event's own status/capacity/invited counts,
                plus the Invited Students tab for an Invite-only event. */}
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

            {activeTab && (
              <div className="flex flex-col gap-[18px]">
                <h2 className="m-0 text-[15px] font-extrabold text-[#12284a]">Invited Students</h2>
                {inviteesLoading || invitees === null ? (
                  <LoadingState label="Loading invited students…" />
                ) : (
                  <InvitedStudentsGrid students={invitees} eventId={event.id} onSelect={setSelectedStudent} />
                )}
              </div>
            )}
          </>
        )}

        <StudentProfileModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />
      </div>
    </div>
  )
}
