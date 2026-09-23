import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { ChevronLeftIcon } from '../../components/icons/NavIcons'
import { StudentCard } from '../../components/StudentCard/StudentCard'
import { fetchEventAttendance, type AttendeeRow } from '../../data/attendanceData'
import { fetchInvitees } from '../../data/inviteesData'
import { getSessionsForEvent, type EventSession } from '../../data/sessionsData'
import { STATUS_OPTIONS, type Student, type StudentStatus } from '../StudentDirectory/studentDirectoryData'
import { StudentProfileModal } from '../StudentDirectory/StudentProfileModal'
import { FilterField, StudentFilterBar, StudentTable } from './attendeeDisplay'
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

  const [sessions, setSessions] = useState<EventSession[]>([])
  useEffect(() => {
    getSessionsForEvent(event.id).then(setSessions)
  }, [event.id])

  const scopeLabel = useMemo(() => {
    if (!scopedSessionIds) return 'Whole event'
    const matched = sessions.filter((s) => scopedSessionIds.includes(s.id))
    return matched.length === 1 ? matched[0].label : matched.length > 1 ? 'Selected session(s)' : 'Selected session(s)'
  }, [scopedSessionIds, sessions])

  const [invitees, setInvitees] = useState<Student[] | null>(null)
  useEffect(() => {
    fetchInvitees(event.id).then(setInvitees)
  }, [event.id])

  const [attendeesData, setAttendeesData] = useState<{ eventId: string; rows: AttendeeRow[] } | null>(null)
  useEffect(() => {
    fetchEventAttendance(event.id).then((rows) => setAttendeesData({ eventId: event.id, rows }))
  }, [event.id])

  const loading = invitees === null || attendeesData?.eventId !== event.id
  const missingStudents = useMemo(() => {
    if (loading || !invitees || !attendeesData) return []
    const scopedAttendees =
      scopedSessionIds === null ? attendeesData.rows : attendeesData.rows.filter((a) => a.sessionId && scopedSessionIds.includes(a.sessionId))
    const checkedInUuids = new Set(scopedAttendees.map((a) => a.student.uuid))
    return invitees.filter((s) => !checkedInUuids.has(s.uuid))
  }, [loading, invitees, attendeesData, scopedSessionIds])

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const backHref = `/events/${event.id}/analysis${scopedSessionIds ? `?sessions=${scopedSessionIds.join(',')}` : ''}`

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
      if (studentId && !s.id.toLowerCase().includes(studentId)) return false
      if (filters.faculty !== 'All' && s.faculty !== filters.faculty) return false
      if (filters.level !== 'All' && s.level !== filters.level) return false
      if (filters.year !== 'All' && s.year !== filters.year) return false
      if (status !== 'All' && s.status !== status) return false
      return true
    })
  }, [missingStudents, filters, status])

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
          <h1 className="m-0 mb-1 text-[26px] font-extrabold text-[#12284a] max-[701px]:text-[22px]">Who's Missing</h1>
          <p className="m-0 text-sm text-[#7c8aa0]">
            {event.program} · {scopeLabel} · {loading ? 'Loading…' : `${missingStudents.length} not checked in`}
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
    </div>
  )
}
