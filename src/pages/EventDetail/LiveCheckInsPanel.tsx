import { useEffect, useMemo, useState } from 'react'
import { CalendarIcon, ClockIcon, PinIcon, QrCodeIcon, DownloadIcon, SearchIcon, XIcon, PersonPlusIcon } from '../../components/icons/NavIcons'
import { Modal } from '../../components/Modal/Modal'
import { Pill } from '../../components/Pill/Pill'
import { recordCheckIn, undoCheckIn, type AttendeeRow, type CheckInMethod, type CheckInStatus } from '../../data/attendanceData'
import { getSessionsForEvent, sessionWindowStatus, type EventSession, type SessionWindowStatus } from '../../data/sessionsData'
import { searchStudents, getInitials, getAvatarTheme, type Student, type AvatarTheme } from '../StudentDirectory/studentDirectoryData'
import type { EventItem } from '../Events/eventsData'

const AVATAR_THEME_CLASSES: Record<AvatarTheme, string> = {
  blue: 'bg-[#d6e7fc] text-[#2f6fed]',
  green: 'bg-[#d3f1e2] text-[#12a35c]',
  teal: 'bg-[#ccfbf1] text-[#0d9488]',
  purple: 'bg-[#e4dbfb] text-[#8b5cf6]',
  amber: 'bg-[#fff3d6] text-[#b3790a]',
  pink: 'bg-[#fde7f1] text-[#d13d82]',
}

const EMPTY_STATE_CLASSES =
  'flex flex-col items-center gap-2 rounded-[18px] bg-white px-5 py-[60px] text-center shadow-[0_2px_10px_rgba(15,40,74,0.05)]'

type LiveStatus = 'Early' | 'On-time' | 'Late' | 'Absent'
type FilterKey = 'all' | 'here' | 'missing' | 'late'

interface LiveRow {
  key: string
  student: Student
  status: LiveStatus
  checkedInAt: string | null
  method: CheckInMethod | null
  checkedInBy: string | null
  checkInId: string | null
}

const CHECK_IN_STATUS_LABEL: Record<CheckInStatus, LiveStatus> = {
  early: 'Early',
  'on-time': 'On-time',
  late: 'Late',
}

const STATUS_BADGE: Record<LiveStatus, { bg: string; text: string }> = {
  Early: { bg: '#eaf2fe', text: '#2f6fed' },
  'On-time': { bg: '#e1f8ec', text: '#159a56' },
  Late: { bg: '#fff8e1', text: '#a0740f' },
  Absent: { bg: '#f2f5fa', text: '#7c8aa0' },
}

const SESSION_TAG: Record<SessionWindowStatus, { label: string; bg: string; text: string }> = {
  open: { label: 'LIVE SESSION · CHECK-IN OPEN', bg: '#e1f8ec', text: '#159a56' },
  'not-started': { label: 'SESSION · CHECK-IN NOT YET OPEN', bg: '#fff8e1', text: '#a0740f' },
  closed: { label: 'SESSION · CHECK-IN CLOSED', bg: '#f2f5fa', text: '#7c8aa0' },
}

function formatClockTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatSessionDate(session: EventSession): string {
  return new Date(`${session.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatSessionTimeRange(session: EventSession): string {
  const opens = formatClockTime(new Date(`${session.date}T${session.openTime}`))
  const closes = formatClockTime(new Date(`${session.date}T${session.closeTime}`))
  // Overnight session (Closes reads earlier than Opens — see sessionWindowStatus) — flag it here
  // too, so staff watching live check-ins can tell this is an intentional overnight window rather
  // than misreading the close time as happening before the open time.
  return session.closeTime < session.openTime ? `${opens} – ${closes} (+1 day)` : `${opens} – ${closes}`
}

// Prefers a session whose window is open right now; failing that, the most recently closed one
// (today's session, most likely), else just the first upcoming one. getSessionsForEvent already
// returns sessions sorted ascending by date/open_time.
function pickCurrentSession(sessions: EventSession[], now: Date): EventSession | null {
  if (sessions.length === 0) return null
  const open = sessions.find((s) => sessionWindowStatus(s, now) === 'open')
  if (open) return open
  const closed = sessions.filter((s) => sessionWindowStatus(s, now) === 'closed')
  if (closed.length > 0) return closed[closed.length - 1]
  return sessions[0]
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function buildCsv(rows: LiveRow[]): string {
  const header = ['Name', 'Student Number', 'Email', 'Faculty', 'Program', 'Status', 'Checked In', 'Method', 'Checked In By']
  const lines = rows.map((r) =>
    [
      r.student.fullName,
      r.student.id,
      r.student.email,
      r.student.faculty,
      r.student.program,
      r.status,
      r.checkedInAt ? new Date(r.checkedInAt).toLocaleString('en-US') : '',
      r.method === 'qr' ? 'QR scan' : r.method === 'manual' ? 'Manual' : '',
      r.checkedInBy ?? '',
    ]
      .map((v) => csvEscape(String(v)))
      .join(','),
  )
  return [header.map(csvEscape).join(','), ...lines].join('\n')
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

interface LiveCheckInsPanelProps {
  event: EventItem
  attendees: AttendeeRow[]
  attendeesLoading: boolean
  invitees: Student[] | null
  invitedCount: number | null
  isInviteOnly: boolean
  // The effective ceiling for the "checked in / ___" ratio below — a real cap for Limited, the
  // live total student count for Open, or null for Invite-only (uses invitedCount instead) or an
  // uncapped Limited event. Precomputed by the caller (see eventsData.ts's effectiveCapacity) since
  // it needs the live student count, which this panel has no reason to fetch a second time.
  capacity: number | null
  // When the parent's session filter pills have a specific session picked (as opposed to "All
  // sessions"), this pins currentSession to exactly that one instead of auto-detecting — both so
  // the header shows the session actually being viewed, and so a manual check-in here goes into
  // that same session rather than whichever one happens to be open right now.
  selectedSessionId: string | null
  onRefresh: () => void
  onSelectStudent: (student: Student) => void
}

export function LiveCheckInsPanel({
  event,
  attendees,
  attendeesLoading,
  invitees,
  invitedCount,
  isInviteOnly,
  capacity,
  selectedSessionId,
  onRefresh,
  onSelectStudent,
}: LiveCheckInsPanelProps) {
  const [sessions, setSessions] = useState<EventSession[]>([])
  useEffect(() => {
    getSessionsForEvent(event.id).then(setSessions)
  }, [event.id])

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(interval)
  }, [])

  const autoSession = useMemo(() => pickCurrentSession(sessions, now), [sessions, now])
  const currentSession = selectedSessionId ? (sessions.find((s) => s.id === selectedSessionId) ?? autoSession) : autoSession
  const windowStatus = currentSession ? sessionWindowStatus(currentSession, now) : null

  const [filter, setFilter] = useState<FilterKey>('all')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // A row pending confirmation for Undo — reversing a recorded check-in is easy to trigger by
  // mistake (it's right next to "Check in" in the same spot on a mobile card), so it gets the same
  // confirm-before-acting treatment as deleting an event, rather than firing immediately on click.
  const [undoTarget, setUndoTarget] = useState<LiveRow | null>(null)

  const [addCheckInOpen, setAddCheckInOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  // Tagged with the query it was fetched for, so "loading" and "stale from a previous query" are
  // both just derived from whether this matches the current query — no separate loading flag that
  // an effect would otherwise need to flip synchronously.
  const [searchData, setSearchData] = useState<{ query: string; results: Student[] } | null>(null)

  const checkedInUuids = useMemo(() => new Set(attendees.map((a) => a.student.uuid)), [attendees])
  const presentCount = attendees.filter((a) => a.status !== 'late').length
  const lateCount = attendees.filter((a) => a.status === 'late').length
  const absentStudents = useMemo(
    () => (isInviteOnly && invitees ? invitees.filter((s) => !checkedInUuids.has(s.uuid)) : []),
    [isInviteOnly, invitees, checkedInUuids],
  )
  const hasKnownRoster = isInviteOnly && invitees !== null

  const rows: LiveRow[] = useMemo(() => {
    const checkedIn: LiveRow[] = attendees.map((a) => ({
      key: a.checkInId,
      student: a.student,
      status: CHECK_IN_STATUS_LABEL[a.status],
      checkedInAt: a.checkedInAt,
      method: a.method,
      checkedInBy: a.checkedInBy,
      checkInId: a.checkInId,
    }))
    const absent: LiveRow[] = [...absentStudents]
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((s) => ({
        key: s.uuid,
        student: s,
        status: 'Absent',
        checkedInAt: null,
        method: null,
        checkedInBy: null,
        checkInId: null,
      }))
    return [...checkedIn, ...absent]
  }, [attendees, absentStudents])

  const filteredRows = rows.filter((r) => {
    if (filter === 'here') return r.status !== 'Absent'
    if (filter === 'missing') return r.status === 'Absent'
    if (filter === 'late') return r.status === 'Late'
    return true
  })

  const ratioLabel =
    isInviteOnly && invitedCount !== null
      ? `${attendees.length} / ${invitedCount}`
      : capacity !== null
        ? `${attendees.length} / ${capacity}`
        : null

  const trimmedSearchQuery = searchQuery.trim()
  const searchResults = searchData?.query === trimmedSearchQuery ? searchData.results : []
  const searchLoading = addCheckInOpen && trimmedSearchQuery !== '' && searchData?.query !== trimmedSearchQuery

  // Live search against the real students table, same query the Pass Tools "Find a student" box
  // uses — already checked-in students are filtered out so there's nothing confusing to tap twice.
  useEffect(() => {
    if (!addCheckInOpen || !trimmedSearchQuery) return
    searchStudents(trimmedSearchQuery).then((found) => {
      setSearchData({ query: trimmedSearchQuery, results: found.filter((s) => !checkedInUuids.has(s.uuid)) })
    })
  }, [addCheckInOpen, trimmedSearchQuery, checkedInUuids])

  // Shared by the Absent-row "Check in" button (Invite-only rosters only) and the "Check in
  // manually" search box below (any registration type, any student) — both are staff-initiated manual
  // overrides, method: 'manual', which is what lets record_check_in() bypass the session's
  // close_time while still enforcing everything else (invite list, capacity, not-yet-open).
  async function handleManualCheckIn(student: Student) {
    if (!currentSession) return
    setActionError(null)
    setBusyKey(student.uuid)
    try {
      const result = await recordCheckIn({ eventId: event.id, sessionId: currentSession.id, studentUuid: student.uuid, method: 'manual' })
      if (result.outcome !== 'checked_in' && result.outcome !== 'already_checked_in') {
        setActionError(`Couldn't check in ${student.fullName}: ${result.outcome.replaceAll('_', ' ')}.`)
      } else {
        setSearchQuery('')
      }
      onRefresh()
    } catch {
      setActionError(`Couldn't check in ${student.fullName}. Please try again.`)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleUndo(row: LiveRow) {
    if (!row.checkInId) return
    setUndoTarget(null)
    setActionError(null)
    setBusyKey(row.checkInId)
    try {
      await undoCheckIn(row.checkInId)
      onRefresh()
    } catch {
      setActionError(`Couldn't undo ${row.student.fullName}'s check-in. Please try again.`)
    } finally {
      setBusyKey(null)
    }
  }

  function handleExportCsv() {
    const filename = `${event.program.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-live-check-ins.csv`
    downloadCsv(filename, buildCsv(rows))
  }

  if (attendeesLoading) {
    return (
      <div className={EMPTY_STATE_CLASSES}>
        <p className="m-0 text-sm text-[#7c8aa0]">Loading check-ins…</p>
      </div>
    )
  }

  const tag = windowStatus ? SESSION_TAG[windowStatus] : null

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-[18px] bg-white px-6 py-6 shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[13px] font-bold text-[#56617a]">{currentSession?.label ?? 'Check-in'}</span>
              {tag && (
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-bold tracking-[0.3px]"
                  style={{ background: tag.bg, color: tag.text }}
                >
                  {tag.label}
                </span>
              )}
            </div>
            <h2 className="m-0 text-[20px] font-extrabold text-[#12284a]">{event.program}</h2>
            {currentSession && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-[#56617a]">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon size={14} />
                  {formatSessionDate(currentSession)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ClockIcon size={14} />
                  {formatSessionTimeRange(currentSession)}
                </span>
                {event.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <PinIcon size={14} />
                    {event.location}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {currentSession && (
              <a
                href={`/scanner?event=${event.id}&session=${currentSession.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#dbe9fc] bg-[#eaf2fe] px-4 py-2.5 text-[13px] font-bold text-[#2f6fed] no-underline cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#dbe9fc]"
              >
                <QrCodeIcon size={15} />
                Scanner
              </a>
            )}
            {currentSession && (
              <button
                type="button"
                onClick={() => setAddCheckInOpen((open) => !open)}
                className={`inline-flex items-center gap-1.5 rounded-[10px] border px-4 py-2.5 text-[13px] font-bold cursor-pointer [transition:background-color_150ms_ease] ${
                  addCheckInOpen
                    ? 'border-[#d3f1e2] bg-[#e8f8f1] text-[#159a56] hover:bg-[#d3f1e2]'
                    : 'border-[#e2e6ee] bg-white text-[#56617a] hover:bg-[#f2f5fa]'
                }`}
              >
                <PersonPlusIcon size={15} />
                Check in manually
              </button>
            )}
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e2e6ee] bg-white px-4 py-2.5 text-[13px] font-bold text-[#56617a] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f2f5fa]"
            >
              <DownloadIcon size={15} />
              Export CSV
            </button>
          </div>
        </div>

        {addCheckInOpen && currentSession && (
          <div className="flex flex-col gap-3 border-t border-[#eef1f6] pt-4">
            <div>
              <span className="text-[13px] font-bold text-[#12284a]">Manually check in a student</span>
              <p className="m-0 mt-0.5 text-[12.5px] text-[#7c8aa0]">
                Works even before the window opens or after it's closed — a fallback for a broken scanner or a
                student who arrived early or late without their pass scanned. Recorded with an Early/On-time/Late
                badge based on their actual check-in time.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-[10px] border border-[#e2e6ee] bg-white px-3 py-[10px] text-[#7c8aa0] [transition:border-color_150ms_ease] focus-within:border-[#0d9488]">
              <SearchIcon size={16} />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, student ID, or email..."
                className="flex-1 border-none text-sm text-[#12284a] outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="shrink-0 cursor-pointer border-none bg-transparent p-0 text-[#9aa6ba] hover:text-[#56617a]"
                  aria-label="Clear search"
                >
                  <XIcon size={14} />
                </button>
              )}
            </div>

            {searchQuery.trim() && (
              <div className="max-h-[280px] overflow-y-auto rounded-[10px] border border-[#eef1f6]">
                {searchLoading ? (
                  <p className="m-0 px-3 py-4 text-center text-[13px] text-[#9aa6ba]">Searching…</p>
                ) : searchResults.length === 0 ? (
                  <p className="m-0 px-3 py-4 text-center text-[13px] text-[#9aa6ba]">
                    No match, or already checked in.
                  </p>
                ) : (
                  <ul className="m-0 flex list-none flex-col p-0">
                    {searchResults.map((student) => {
                      const busy = busyKey === student.uuid
                      return (
                        <li key={student.uuid} className="border-b border-[#f0f2f7] last:border-b-0">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleManualCheckIn(student)}
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left cursor-pointer [transition:background-color_150ms_ease] hover:not-disabled:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${AVATAR_THEME_CLASSES[getAvatarTheme(student.id)]}`}
                            >
                              {getInitials(student.fullName)}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="text-sm font-bold text-[#12284a]">{student.fullName}</span>
                              <span className="truncate text-xs text-[#9aa6ba]">
                                {student.id} &middot; {student.email}
                              </span>
                            </div>
                            <span className="shrink-0 text-[12.5px] font-bold text-[#2f6fed]">
                              {busy ? 'Checking in…' : 'Check in'}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {actionError && (
        <div className="rounded-[14px] border border-[#f8c9c9] bg-[#fde8e8] px-5 py-3 text-[13px] font-semibold text-[#d1453d]">
          {actionError}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-[14px]">
        <div className="flex flex-col gap-1 rounded-2xl border border-[#d3f1e2] bg-[#e8f8f1] px-6 py-5">
          <span className="text-[26px] leading-[1.1] font-extrabold text-[#12284a]">{presentCount}</span>
          <span className="text-[13px] font-semibold text-[#7c8aa0]">Present</span>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl border border-[#fbedc0] bg-[#fff8e1] px-6 py-5">
          <span className="text-[26px] leading-[1.1] font-extrabold text-[#12284a]">{lateCount}</span>
          <span className="text-[13px] font-semibold text-[#7c8aa0]">Late</span>
        </div>
        {hasKnownRoster && (
          <div className="flex flex-col gap-1 rounded-2xl border border-[#e2e6ee] bg-[#f7f9fc] px-6 py-5">
            <span className="text-[26px] leading-[1.1] font-extrabold text-[#12284a]">{absentStudents.length}</span>
            <span className="text-[13px] font-semibold text-[#7c8aa0]">Absent</span>
          </div>
        )}
        {ratioLabel && (
          <div className="flex flex-col gap-1 rounded-2xl border border-[#dbe9fc] bg-[#eaf2fe] px-6 py-5">
            <span className="text-[26px] leading-[1.1] font-extrabold text-[#12284a]">{ratioLabel}</span>
            <span className="text-[13px] font-semibold text-[#7c8aa0]">
              {isInviteOnly ? 'Checked in / Invited' : event.registrationType === 'Open' ? 'Checked in / Total students' : 'Checked in / Capacity'}
            </span>
          </div>
        )}
      </div>

      {/* Filter pills */}
      <div className="inline-flex w-fit max-w-full flex-wrap gap-0.5 overflow-x-auto rounded-xl bg-[#eef1f6] p-1">
        {(
          [
            ['all', 'All'],
            ['here', 'Here'],
            ...(hasKnownRoster ? ([['missing', 'Missing']] as const) : []),
            ['late', 'Late'],
          ] as [FilterKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-[9px] border-none px-4 py-[9px] text-[13px] font-semibold whitespace-nowrap cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] ${
              filter === key ? 'bg-[#12284a] text-white' : 'bg-transparent text-[#56617a] hover:text-[#12284a]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      {filteredRows.length === 0 ? (
        <div className={EMPTY_STATE_CLASSES}>
          <p className="m-0 text-sm text-[#7c8aa0]">No one matches this filter yet.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[18px] bg-white shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[900px]:hidden">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr>
                  {['Participant', 'Program', 'Status', 'Checked In', 'Method', 'Action'].map((heading) => (
                    <th
                      key={heading}
                      className="border-b border-[#eef1f6] px-5 py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, index) => {
                  const cellBorder = index === filteredRows.length - 1 ? '' : 'border-b border-[#f2f4f8]'
                  const badge = STATUS_BADGE[row.status]
                  const busy = busyKey === (row.checkInId ?? row.student.uuid)
                  return (
                    <tr key={row.key}>
                      <td className={`px-5 py-4 align-middle ${cellBorder}`}>
                        <button
                          type="button"
                          onClick={() => onSelectStudent(row.student)}
                          className="cursor-pointer border-none bg-transparent p-0 text-left font-[inherit]"
                        >
                          <div className="text-[13.5px] font-bold whitespace-nowrap text-[#12284a] hover:underline">{row.student.fullName}</div>
                          <div className="text-[12px] text-[#9aa6ba]">{row.student.id}</div>
                          <div className="text-[12px] text-[#9aa6ba]">{row.student.email}</div>
                        </button>
                      </td>
                      <td className={`px-5 py-4 align-middle text-[13px] text-[#33415c] ${cellBorder}`}>
                        <div>{row.student.faculty}</div>
                        <div className="text-[12px] text-[#9aa6ba]">{row.student.program}</div>
                      </td>
                      <td className={`px-5 py-4 align-middle ${cellBorder}`}>
                        <Pill bg={badge.bg} text={badge.text}>
                          {row.status}
                        </Pill>
                      </td>
                      <td className={`px-5 py-4 align-middle text-[13px] whitespace-nowrap text-[#33415c] ${cellBorder}`}>
                        {row.checkedInAt ? new Date(row.checkedInAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'}
                      </td>
                      <td className={`px-5 py-4 align-middle text-[13px] whitespace-nowrap text-[#33415c] ${cellBorder}`}>
                        {row.method === 'qr' ? (
                          'QR scan'
                        ) : row.method === 'manual' ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-[#eaf2fe] px-2 py-[2px] text-[11.5px] font-bold text-[#2f6fed]"
                            title={row.checkedInBy ? `Checked in manually by ${row.checkedInBy}` : 'Checked in manually by staff'}
                          >
                            Manual
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={`px-5 py-4 align-middle whitespace-nowrap ${cellBorder}`}>
                        {row.status === 'Absent' && currentSession ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleManualCheckIn(row.student)}
                            className="rounded-[8px] border border-[#dbe9fc] bg-[#eaf2fe] px-3 py-[7px] text-[12.5px] font-bold text-[#2f6fed] cursor-pointer [transition:background-color_150ms_ease] hover:not-disabled:bg-[#dbe9fc] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busy ? 'Checking in…' : 'Check in'}
                          </button>
                        ) : row.checkInId ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setUndoTarget(row)}
                            className="rounded-[8px] border border-transparent px-3 py-[7px] text-[12.5px] font-semibold text-[#9aa6ba] cursor-pointer [transition:color_150ms_ease] hover:not-disabled:text-[#d1453d] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busy ? 'Undoing…' : 'Undo'}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="hidden flex-col gap-3 max-[900px]:flex">
            {filteredRows.map((row) => {
              const badge = STATUS_BADGE[row.status]
              const busy = busyKey === (row.checkInId ?? row.student.uuid)
              return (
                <div key={row.key} className="flex flex-col gap-2.5 rounded-2xl bg-white p-[18px] shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
                  <div className="flex items-start justify-between gap-2.5">
                    <button
                      type="button"
                      onClick={() => onSelectStudent(row.student)}
                      className="cursor-pointer border-none bg-transparent p-0 text-left font-[inherit]"
                    >
                      <div className="text-[15px] font-bold text-[#12284a]">{row.student.fullName}</div>
                      <div className="text-[12px] text-[#9aa6ba]">{row.student.id}</div>
                    </button>
                    <Pill bg={badge.bg} text={badge.text}>
                      {row.status}
                    </Pill>
                  </div>
                  <div className="text-[13px] text-[#56617a]">{row.student.email}</div>
                  <div className="text-[13px] text-[#56617a]">
                    {row.student.faculty} &middot; {row.student.program}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f2f4f8] pt-2.5 text-[13px]">
                    <span
                      className="text-[#56617a]"
                      title={row.method === 'manual' && row.checkedInBy ? `Checked in manually by ${row.checkedInBy}` : undefined}
                    >
                      {row.checkedInAt
                        ? `Checked in ${new Date(row.checkedInAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · ${row.method === 'manual' ? 'Manual' : 'QR scan'}`
                        : 'Not checked in'}
                    </span>
                    {row.status === 'Absent' && currentSession ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleManualCheckIn(row.student)}
                        className="rounded-[8px] border border-[#dbe9fc] bg-[#eaf2fe] px-3 py-[7px] text-[12.5px] font-bold text-[#2f6fed] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy ? 'Checking in…' : 'Check in'}
                      </button>
                    ) : row.checkInId ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setUndoTarget(row)}
                        className="rounded-[8px] border border-transparent px-3 py-[7px] text-[12.5px] font-semibold text-[#9aa6ba] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy ? 'Undoing…' : 'Undo'}
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <Modal open={!!undoTarget} onClose={() => setUndoTarget(null)}>
        {undoTarget && (
          <div className="flex flex-col gap-4">
            <h2 className="m-0 text-lg font-extrabold text-[#12284a]">Undo this check-in?</h2>
            <p className="m-0 text-sm text-[#56617a]">
              This removes <strong>{undoTarget.student.fullName}</strong>&rsquo;s check-in record for this session. If
              they&rsquo;re still here, they&rsquo;ll need to be scanned or checked in again.
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setUndoTarget(null)}
                className="rounded-[10px] border-none bg-transparent px-[18px] py-2.5 text-[13.5px] font-bold text-[#7c8aa0] cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] hover:bg-[#f2f5fa] hover:text-[#56617a]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleUndo(undoTarget)}
                className="rounded-[10px] border-none bg-[#d1453d] px-5 py-2.5 text-[13.5px] font-bold text-white cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#b93a33]"
              >
                Undo check-in
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
