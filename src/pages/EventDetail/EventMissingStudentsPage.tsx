import { useEffect, useMemo, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { StudentCard } from '../../components/StudentCard/StudentCard'
import { fetchEventAttendance, type AttendeeRow } from '../../data/attendanceData'
import { expectedInvitees } from '../../data/inviteePeriods'
import { fetchRoster, type InviteRoster } from '../../data/inviteesData'
import { getSessionsForEvent, type EventSession } from '../../data/sessionsData'
import { STATUS_OPTIONS, type Student, type StudentStatus } from '../StudentDirectory/studentDirectoryData'
import { StudentProfileModal } from '../StudentDirectory/StudentProfileModal'
import { FilterField, StudentFilterBar, StudentTable } from './attendeeDisplay'
import { studentsInEverySession } from './commonAttendance'
import { CARD_GRID_CLASSES, EMPTY_STATE_CLASSES, EMPTY_STUDENT_FILTERS, FILTER_SELECT_CLASSES, type StudentFilterState } from './attendeeFormatting'
import type { EventDetailContext } from './EventDetailLayout'

// Invited students who haven't checked in yet, for whichever session(s) the live monitor was
// showing when "See who's missing" was clicked (same `sessions` query param convention as
// EventAttendeesPage). Invite-only events only — there's no fixed roster to compare against for
// Open/Limited registration, so nothing links here for those.
export function EventMissingStudentsPage() {
  const { event } = useOutletContext<EventDetailContext>()
  const [searchParams] = useSearchParams()

  const scopedSessionIds = useMemo(() => {
    const raw = searchParams.get('sessions')
    return raw ? raw.split(',').filter(Boolean) : null
  }, [searchParams])
  // The Completed report's "No-shows" card counts students with ZERO check-ins across the whole
  // event — a stricter question than this page's usual one (didn't attend EVERY session in scope,
  // which the Live Monitor's "See who's missing" link relies on and would otherwise also catch a
  // student who attended some but not all days). Keeping both behaviors under one page rather than
  // forking it, so the list a stat card links to always matches what that card actually counted.
  const neverCheckedInOnly = searchParams.get('mode') === 'never'

  const [sessions, setSessions] = useState<EventSession[]>([])
  useEffect(() => {
    getSessionsForEvent(event.id).then(setSessions)
  }, [event.id])

  const scopeLabel = useMemo(() => {
    if (!scopedSessionIds) return 'Whole event'
    const matched = sessions.filter((s) => scopedSessionIds.includes(s.id))
    return matched.length === 1 ? matched[0].label : matched.length > 1 ? 'Selected session(s)' : 'Selected session(s)'
  }, [scopedSessionIds, sessions])

  const [roster, setRoster] = useState<InviteRoster | null>(null)
  useEffect(() => {
    fetchRoster(event.id).then(setRoster)
  }, [event.id])
  const invitees = roster?.students ?? null
  const periods = roster?.periods ?? null

  const [attendeesData, setAttendeesData] = useState<{ eventId: string; rows: AttendeeRow[] } | null>(null)
  useEffect(() => {
    fetchEventAttendance(event.id).then((rows) => setAttendeesData({ eventId: event.id, rows }))
  }, [event.id])

  const loading = roster === null || attendeesData?.eventId !== event.id
  const missingStudents = useMemo(() => {
    if (loading || !invitees || !periods || !attendeesData) return []
    const scopedAttendees =
      scopedSessionIds === null ? attendeesData.rows : attendeesData.rows.filter((a) => a.sessionId && scopedSessionIds.includes(a.sessionId))
    const scopeSessions = sessions.filter((s) => scopedSessionIds === null || scopedSessionIds.includes(s.id))
    const expected = expectedInvitees(invitees, periods, sessions, scopeSessions)
    // neverCheckedInOnly: any check-in at all, anywhere in scope, takes a student off this list —
    // the strict "zero check-ins" reading the Completed report's No-shows card uses. Otherwise,
    // more than one session in scope means "missing" follows the Live Monitor's combined-view rule
    // instead: didn't attend every session in scope, not just "never checked in at all".
    const attendedAll = neverCheckedInOnly
      ? new Set(scopedAttendees.map((a) => a.student.uuid))
      : scopeSessions.length > 1
        ? studentsInEverySession(scopedAttendees, scopeSessions.map((s) => s.id))
        : new Set(scopedAttendees.map((a) => a.student.uuid))
    return expected.filter((s) => !attendedAll.has(s.uuid))
  }, [loading, invitees, periods, attendeesData, scopedSessionIds, sessions, neverCheckedInOnly])

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  const [filters, setFilters] = useState<StudentFilterState>(EMPTY_STUDENT_FILTERS)
  const [status, setStatus] = useState<StudentStatus | 'All'>('All')

  function updateFilters(patch: Partial<StudentFilterState>) {
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  function handleReset() {
    setFilters(EMPTY_STUDENT_FILTERS)
    setStatus('All')
  }

  const filteredStudents = useMemo(() => {
    const name = filters.name.trim().toLowerCase()
    const studentId = filters.studentId.trim().toLowerCase()
    return missingStudents.filter((s) => {
      if (name && !s.fullName.toLowerCase().includes(name)) return false
      if (studentId && !(s.id ?? '').toLowerCase().includes(studentId)) return false
      if (filters.faculty !== 'All' && s.faculty !== filters.faculty) return false
      if (filters.level !== 'All' && s.level !== filters.level) return false
      if (filters.year !== 'All' && s.year !== filters.year) return false
      if (status !== 'All' && s.status !== status) return false
      return true
    })
  }, [missingStudents, filters, status])

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-[26px]">
      <div>
        <p className="m-0 text-sm text-[#7c8aa0]">
          {event.program} · {scopeLabel} ·{' '}
          {loading
            ? 'Loading…'
            : neverCheckedInOnly
              ? `${missingStudents.length} never checked in`
              : (scopedSessionIds?.length ?? 0) > 1
                ? `${missingStudents.length} missed at least one session`
                : `${missingStudents.length} not checked in`}
        </p>
      </div>

        {loading ? (
          <div className={EMPTY_STATE_CLASSES}>
            <p className="m-0 text-sm text-[#7c8aa0]">Loading…</p>
          </div>
        ) : missingStudents.length === 0 ? (
          <div className={EMPTY_STATE_CLASSES}>
            <p className="m-0 text-sm text-[#7c8aa0]">Everyone invited has checked in.</p>
          </div>
        ) : (
          <>
            <StudentFilterBar
              filters={filters}
              onChange={updateFilters}
              onReset={handleReset}
              extra={
                <FilterField label="Status">
                  <select className={FILTER_SELECT_CLASSES} value={status} onChange={(e) => setStatus(e.target.value as StudentStatus | 'All')}>
                    <option value="All">All</option>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </FilterField>
              }
            />

            {filteredStudents.length === 0 ? (
              <div className={EMPTY_STATE_CLASSES}>
                <p className="m-0 text-sm text-[#7c8aa0]">No students match these filters.</p>
              </div>
            ) : (
              <>
                <StudentTable students={filteredStudents} onSelect={setSelectedStudent} />
                <div className="hidden max-[701px]:block">
                  <div className={CARD_GRID_CLASSES}>
                    {filteredStudents.map((student) => (
                      <StudentCard key={student.uuid} student={student} onClick={() => setSelectedStudent(student)} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

      <StudentProfileModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />
    </div>
  )
}
