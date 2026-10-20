import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { ChevronLeftIcon } from '../../components/icons/NavIcons'
import { rowActivationProps } from '../../lib/rowActivation'
import { describeDropFrom, droppedInScope, sortSessionsChronologically } from '../../data/inviteePeriods'
import { fetchRoster, type InviteRoster } from '../../data/inviteesData'
import { getSessionsForEvent, type EventSession } from '../../data/sessionsData'
import { getInitials, type Student } from '../StudentDirectory/studentDirectoryData'
import { StudentProfileModal } from '../StudentDirectory/StudentProfileModal'
import { LoadingState, StudentFilterBar } from './attendeeDisplay'
import { EMPTY_STATE_CLASSES, EMPTY_STUDENT_FILTERS, type StudentFilterState } from './attendeeFormatting'
import type { EventDetailContext } from './EventDetailLayout'
import type { DroppedEntry } from './DroppedStudentsCard'

const HEAD_CLASSES = 'border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase'

function formatDroppedOn(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function EventDroppedPage() {
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

  const [roster, setRoster] = useState<InviteRoster | null>(null)
  useEffect(() => {
    fetchRoster(event.id).then(setRoster)
  }, [event.id])
  const invitees = roster?.students ?? null
  const periods = roster?.periods ?? null

  const loading = roster === null

  const scopeSessions = useMemo(
    () => sessions.filter((s) => scopedSessionIds === null || scopedSessionIds.includes(s.id)),
    [sessions, scopedSessionIds],
  )

  const scopeLabel = useMemo(() => {
    if (!scopedSessionIds) return 'Whole event'
    return scopeSessions.length === 1 ? scopeSessions[0].label : 'Selected session(s)'
  }, [scopedSessionIds, scopeSessions])

  const droppedEntries = useMemo<DroppedEntry[]>(() => {
    if (loading || !invitees || !periods) return []
    const firstSessionId = sortSessionsChronologically(sessions)[0]?.id
    const studentsById = new Map(invitees.map((s) => [s.uuid, s]))
    const sessionsById = new Map(sessions.map((s) => [s.id, s]))
    return droppedInScope(periods, sessions, scopeSessions).flatMap((drop) => {
      const student = studentsById.get(drop.studentId)
      if (!student) return []
      const from = sessionsById.get(drop.droppedFromSessionId as string)
      return [{ student, drop, fromLabel: describeDropFrom(from, from?.id === firstSessionId) }]
    })
  }, [loading, invitees, periods, sessions, scopeSessions])

  const [filters, setFilters] = useState<StudentFilterState>(EMPTY_STUDENT_FILTERS)

  function updateFilters(patch: Partial<StudentFilterState>) {
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  const filteredEntries = useMemo(() => {
    const name = filters.name.trim().toLowerCase()
    const studentId = filters.studentId.trim().toLowerCase()
    return droppedEntries.filter(({ student: s }) => {
      if (name && !s.fullName.toLowerCase().includes(name)) return false
      if (studentId && !(s.id ?? '').toLowerCase().includes(studentId)) return false
      if (filters.faculty !== 'All' && s.faculty !== filters.faculty) return false
      if (filters.level !== 'All' && s.level !== filters.level) return false
      if (filters.year !== 'All' && s.year !== filters.year) return false
      return true
    })
  }, [droppedEntries, filters])

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-[26px]">
      <Link
        to={`/events/${event.id}/analysis`}
        className="inline-flex w-fit items-center gap-1 text-[13.5px] font-semibold text-[#7c8aa0] no-underline [transition:color_150ms_ease] hover:text-[#2f6fed]"
      >
        <ChevronLeftIcon size={16} />
        Back to live monitor
      </Link>

      <div>
        <p className="m-0 text-sm text-[#7c8aa0]">
          {event.program} · {scopeLabel} · {loading ? 'Loading…' : `${droppedEntries.length} dropped`}
        </p>
      </div>

      {loading ? (
        <LoadingState label="Loading dropped students…" />
      ) : droppedEntries.length === 0 ? (
        <div className={EMPTY_STATE_CLASSES}>
          <p className="m-0 text-sm text-[#7c8aa0]">Nobody has been dropped for this session.</p>
        </div>
      ) : (
        <>
          <StudentFilterBar filters={filters} onChange={updateFilters} onReset={() => setFilters(EMPTY_STUDENT_FILTERS)} />

          {filteredEntries.length === 0 ? (
            <div className={EMPTY_STATE_CLASSES}>
              <p className="m-0 text-sm text-[#7c8aa0]">No dropped students match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[18px] bg-white shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
              <table className="w-full min-w-[900px] border-collapse">
                <thead>
                  <tr>
                    <th className={HEAD_CLASSES}>Student</th>
                    <th className={HEAD_CLASSES}>Email</th>
                    <th className={HEAD_CLASSES}>Faculty &amp; Program</th>
                    <th className={HEAD_CLASSES}>Dropped from</th>
                    <th className={HEAD_CLASSES}>Reason</th>
                    <th className={HEAD_CLASSES}>Dropped on</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map(({ student, drop, fromLabel }, index) => {
                    const cellBorder = index === filteredEntries.length - 1 ? '' : 'border-b border-[#f2f4f8]'
                    return (
                      <tr
                        key={drop.id}
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
                        <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>
                          <div>{drop.reason}</div>
                          {drop.note && <div className="mt-0.5 text-[12.5px] text-[#9aa6ba]">{drop.note}</div>}
                        </td>
                        <td className={`px-[22px] py-4 align-middle text-[13px] text-[#56617a] ${cellBorder}`}>
                          <div>{formatDroppedOn(drop.droppedAt ?? drop.createdAt)}</div>
                          {drop.droppedByName && <div className="mt-0.5 text-[12px] text-[#9aa6ba]">by {drop.droppedByName}</div>}
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
