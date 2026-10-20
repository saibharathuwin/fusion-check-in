import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { ChevronLeftIcon } from '../../components/icons/NavIcons'
import { rowActivationProps } from '../../lib/rowActivation'
import { formatSessionLabel, type InviteePeriod } from '../../data/inviteePeriods'
import { fetchRoster, type InviteRoster } from '../../data/inviteesData'
import { getSessionsForEvent, type EventSession } from '../../data/sessionsData'
import { getInitials, type Student } from '../StudentDirectory/studentDirectoryData'
import { StudentProfileModal } from '../StudentDirectory/StudentProfileModal'
import { LoadingState, StudentFilterBar } from './attendeeDisplay'
import { EMPTY_STATE_CLASSES, EMPTY_STUDENT_FILTERS, type StudentFilterState } from './attendeeFormatting'
import type { EventDetailContext } from './EventDetailLayout'

const HEAD_CLASSES = 'border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase'

interface JoinedLaterEntry {
  student: Student
  period: InviteePeriod
  fromLabel: string
}

function formatJoinedOn(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Whole event only — reached from the Completed report's "Joined later" card, which is itself
// only shown with "Whole event" selected (see CompletedReportView). Unlike Missing/Dropped, there
// is no per-session scope here: a student either joined partway through the event's invite list
// or they didn't, a question that doesn't narrow to a single day the way attendance does.
export function EventJoinedLaterPage() {
  const { event } = useOutletContext<EventDetailContext>()

  const [sessions, setSessions] = useState<EventSession[]>([])
  useEffect(() => {
    getSessionsForEvent(event.id).then(setSessions)
  }, [event.id])

  const [roster, setRoster] = useState<InviteRoster | null>(null)
  useEffect(() => {
    fetchRoster(event.id).then(setRoster)
  }, [event.id])
  const invitees = roster?.students ?? null
  const periods = roster?.periods ?? null

  const loading = roster === null

  const joinedLaterEntries = useMemo<JoinedLaterEntry[]>(() => {
    if (loading || !invitees || !periods) return []
    const studentsById = new Map(invitees.map((s) => [s.uuid, s]))
    const sessionsById = new Map(sessions.map((s) => [s.id, s]))
    return periods
      .filter((p) => p.droppedFromSessionId === null && p.joinedFromSessionId !== null)
      .flatMap((period) => {
        const student = studentsById.get(period.studentId)
        const joinedFrom = sessionsById.get(period.joinedFromSessionId as string)
        if (!student || !joinedFrom) return []
        return [{ student, period, fromLabel: formatSessionLabel(joinedFrom) }]
      })
  }, [loading, invitees, periods, sessions])

  const [filters, setFilters] = useState<StudentFilterState>(EMPTY_STUDENT_FILTERS)

  function updateFilters(patch: Partial<StudentFilterState>) {
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  const filteredEntries = useMemo(() => {
    const name = filters.name.trim().toLowerCase()
    const studentId = filters.studentId.trim().toLowerCase()
    return joinedLaterEntries.filter(({ student: s }) => {
      if (name && !s.fullName.toLowerCase().includes(name)) return false
      if (studentId && !(s.id ?? '').toLowerCase().includes(studentId)) return false
      if (filters.faculty !== 'All' && s.faculty !== filters.faculty) return false
      if (filters.level !== 'All' && s.level !== filters.level) return false
      if (filters.year !== 'All' && s.year !== filters.year) return false
      return true
    })
  }, [joinedLaterEntries, filters])

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-[26px]">
      <Link
        to={`/events/${event.id}/analysis`}
        className="inline-flex w-fit items-center gap-1 text-[13.5px] font-semibold text-[#7c8aa0] no-underline [transition:color_150ms_ease] hover:text-[#2f6fed]"
      >
        <ChevronLeftIcon size={16} />
        Back to Event
      </Link>

      <div>
        <p className="m-0 text-sm text-[#7c8aa0]">
          {event.program} · Whole event · {loading ? 'Loading…' : `${joinedLaterEntries.length} joined later`}
        </p>
      </div>

      {loading ? (
        <LoadingState label="Loading students who joined later…" />
      ) : joinedLaterEntries.length === 0 ? (
        <div className={EMPTY_STATE_CLASSES}>
          <p className="m-0 text-sm text-[#7c8aa0]">Nobody was added to this event's invite list after it started.</p>
        </div>
      ) : (
        <>
          <StudentFilterBar filters={filters} onChange={updateFilters} onReset={() => setFilters(EMPTY_STUDENT_FILTERS)} />

          {filteredEntries.length === 0 ? (
            <div className={EMPTY_STATE_CLASSES}>
              <p className="m-0 text-sm text-[#7c8aa0]">No students match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[18px] bg-white shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr>
                    <th className={HEAD_CLASSES}>Student</th>
                    <th className={HEAD_CLASSES}>Email</th>
                    <th className={HEAD_CLASSES}>Faculty &amp; Program</th>
                    <th className={HEAD_CLASSES}>Joined from</th>
                    <th className={HEAD_CLASSES}>Joined on</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map(({ student, period, fromLabel }, index) => {
                    const cellBorder = index === filteredEntries.length - 1 ? '' : 'border-b border-[#f2f4f8]'
                    return (
                      <tr
                        key={period.id}
                        {...rowActivationProps(() => setSelectedStudent(student))}
                        className="cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f7f9fc] focus-visible:bg-[#f7f9fc] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0d9488]"
                      >
                        <td className={`px-[22px] py-4 align-middle ${cellBorder}`}>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef1f6] text-[13px] font-extrabold text-[#56617a]">
                              {getInitials(student.fullName)}
                            </div>
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate text-[13.5px] font-bold whitespace-nowrap text-[#12284a]">{student.fullName}</span>
                              <span className="text-[12px] font-semibold text-[#9aa6ba]">{student.id ?? 'ID pending'}</span>
                            </div>
                          </div>
                        </td>
                        <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>{student.email}</td>
                        <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>
                          <div className="font-semibold text-[#12284a]">{student.faculty}</div>
                          <div className="mt-0.5 text-[12.5px] text-[#9aa6ba]">{student.program}</div>
                        </td>
                        <td className={`px-[22px] py-4 align-middle text-[13.5px] font-semibold text-[#12284a] ${cellBorder}`}>{fromLabel}</td>
                        <td className={`px-[22px] py-4 align-middle text-[13px] text-[#56617a] ${cellBorder}`}>
                          <div>{formatJoinedOn(period.createdAt)}</div>
                          {period.joinedByName && <div className="mt-0.5 text-[12px] text-[#9aa6ba]">by {period.joinedByName}</div>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <StudentProfileModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />
    </div>
  )
}
