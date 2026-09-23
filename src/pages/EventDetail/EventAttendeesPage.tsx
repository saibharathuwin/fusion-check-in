import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { ChevronLeftIcon } from '../../components/icons/NavIcons'
import { fetchEventAttendance, type AttendeeRow, type CheckInStatus } from '../../data/attendanceData'
import { getSessionsForEvent, type EventSession } from '../../data/sessionsData'
import type { Student } from '../StudentDirectory/studentDirectoryData'
import { StudentProfileModal } from '../StudentDirectory/StudentProfileModal'
import { AttendeeCardGrid, AttendeeTable, FilterField, LoadingState, StudentFilterBar } from './attendeeDisplay'
import { CHECK_IN_STATUS_BADGE, EMPTY_STATE_CLASSES, EMPTY_STUDENT_FILTERS, FILTER_SELECT_CLASSES, type StudentFilterState } from './attendeeFormatting'
import type { EventDetailContext } from './EventDetailLayout'

const CHECK_IN_STATUS_OPTIONS: CheckInStatus[] = ['early', 'on-time', 'late']

// The full checked-in list for an event — reached from the Analysis page's "View full attendee
// list" link, which passes along whichever day/session was selected there (via the `sessions`
// query param, a comma-separated list of session ids) so this page shows the same scope, not
// always the whole event. Omitting the param (or an event with no sessions param) shows everyone.
export function EventAttendeesPage() {
  const { event } = useOutletContext<EventDetailContext>()
  const [searchParams] = useSearchParams()
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  const scopedSessionIds = useMemo(() => {
    const raw = searchParams.get('sessions')
    return raw ? raw.split(',').filter(Boolean) : null
  }, [searchParams])

  const [sessions, setSessions] = useState<EventSession[]>([])
  useEffect(() => {
    getSessionsForEvent(event.id).then(setSessions)
  }, [event.id])

  // A human label for the scope being shown — cross-referenced against the real session data
  // rather than passed as its own query param, so it can never drift out of sync with what
  // `scopedSessionIds` actually resolves to.
  const scopeLabel = useMemo(() => {
    if (!scopedSessionIds) return 'Whole event'
    const matched = sessions.filter((s) => scopedSessionIds.includes(s.id))
    if (matched.length === 0) return 'Selected session(s)'
    const dates = new Set(matched.map((s) => s.date))
    if (dates.size === 1 && matched.length === 1) return matched[0].label
    if (dates.size === 1) return `${new Date(`${matched[0].date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · All sessions`
    return 'Selected session(s)'
  }, [scopedSessionIds, sessions])

  const [attendeesData, setAttendeesData] = useState<{ eventId: string; rows: AttendeeRow[] } | null>(null)
  useEffect(() => {
    fetchEventAttendance(event.id).then((rows) => setAttendeesData({ eventId: event.id, rows }))
  }, [event.id])

  const loading = attendeesData?.eventId !== event.id
  const attendees = useMemo(() => {
    const allAttendees = attendeesData?.eventId === event.id ? attendeesData.rows : []
    return scopedSessionIds === null ? allAttendees : allAttendees.filter((a) => a.sessionId && scopedSessionIds.includes(a.sessionId))
  }, [attendeesData, event.id, scopedSessionIds])

  const backHref = `/events/${event.id}/analysis${scopedSessionIds ? `?sessions=${scopedSessionIds.join(',')}` : ''}`

  const [filters, setFilters] = useState<StudentFilterState>(EMPTY_STUDENT_FILTERS)
  const [checkInStatus, setCheckInStatus] = useState<CheckInStatus | 'All'>('All')

  function updateFilters(patch: Partial<StudentFilterState>) {
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  function handleReset() {
    setFilters(EMPTY_STUDENT_FILTERS)
    setCheckInStatus('All')
  }

  const filteredAttendees = useMemo(() => {
    const name = filters.name.trim().toLowerCase()
    const studentId = filters.studentId.trim().toLowerCase()
    return attendees.filter((a) => {
      if (name && !a.student.fullName.toLowerCase().includes(name)) return false
      if (studentId && !a.student.id.toLowerCase().includes(studentId)) return false
      if (filters.faculty !== 'All' && a.student.faculty !== filters.faculty) return false
      if (filters.level !== 'All' && a.student.level !== filters.level) return false
      if (filters.year !== 'All' && a.student.year !== filters.year) return false
      if (checkInStatus !== 'All' && a.status !== checkInStatus) return false
      return true
    })
  }, [attendees, filters, checkInStatus])

  return (
    <div className="box-border flex min-h-screen justify-center bg-[linear-gradient(180deg,#f4fdfc_0%,#f7f9fc_100%)] px-6 pt-14 pb-20 max-[701px]:px-4 max-[701px]:pt-9 max-[701px]:pb-15">
      <div className="flex w-full max-w-[1240px] flex-col gap-[26px]">
        <Link
          to={backHref}
          className="inline-flex w-fit items-center gap-1 text-[13.5px] font-semibold text-[#7c8aa0] no-underline [transition:color_150ms_ease] hover:text-[#2f6fed]"
        >
          <ChevronLeftIcon size={16} />
          Back to Analysis
        </Link>

        <div>
          <h1 className="m-0 mb-1 text-[26px] font-extrabold text-[#12284a] max-[701px]:text-[22px]">Full Attendee List</h1>
          <p className="m-0 text-sm text-[#7c8aa0]">
            {event.program} · {scopeLabel} · {loading ? 'Loading…' : `${attendees.length} checked in`}
          </p>
        </div>

        {loading ? (
          <LoadingState label="Loading attendance…" />
        ) : attendees.length === 0 ? (
          <div className={EMPTY_STATE_CLASSES}>
            <p className="m-0 text-sm text-[#7c8aa0]">No check-ins recorded.</p>
          </div>
        ) : (
          <>
            <StudentFilterBar
              filters={filters}
              onChange={updateFilters}
              onReset={handleReset}
              extra={
                <FilterField label="Check-in Status">
                  <select
                    className={FILTER_SELECT_CLASSES}
                    value={checkInStatus}
                    onChange={(e) => setCheckInStatus(e.target.value as CheckInStatus | 'All')}
                  >
                    <option value="All">All</option>
                    {CHECK_IN_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {CHECK_IN_STATUS_BADGE[s].label}
                      </option>
                    ))}
                  </select>
                </FilterField>
              }
            />

            {filteredAttendees.length === 0 ? (
              <div className={EMPTY_STATE_CLASSES}>
                <p className="m-0 text-sm text-[#7c8aa0]">No students match these filters.</p>
              </div>
            ) : (
              <>
                <AttendeeTable attendees={filteredAttendees} showLateBy={false} onSelect={setSelectedStudent} />
                <AttendeeCardGrid attendees={filteredAttendees} showLateBy={false} onSelect={setSelectedStudent} mobileOnly />
              </>
            )}
          </>
        )}

        <StudentProfileModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />
      </div>
    </div>
  )
}
