import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal/Modal'
import { dropInvitee, rejoinInvitee } from '../../data/inviteesData'
import {
  DROP_REASONS,
  describeDropFrom,
  findNextSession,
  sortSessionsChronologically,
  type DropReason,
  type InviteePeriod,
} from '../../data/inviteePeriods'
import type { EventSession } from '../../data/sessionsData'
import type { Student } from '../StudentDirectory/studentDirectoryData'
import { TablePager } from './TablePager'
import { pageSlice } from './tablePaging'

const FIELD_LABEL_CLASSES = 'text-[13px] font-bold text-[#33415c]'
const FIELD_ERROR_CLASSES = 'text-[12.5px] font-semibold text-[#d1453d]'
const INPUT_CLASSES =
  'w-full rounded-[10px] border border-[#dfe5ef] bg-white px-3 py-2.5 text-[14px] text-[#1d1d1f] focus:border-[#0d9488] focus:shadow-[0_0_0_3px_rgba(13,148,136,0.18)] focus:outline-none'
const ROW_BUTTON_CLASSES =
  'inline-flex items-center rounded-[9px] border border-[#dfe5ef] bg-white px-3 py-1.5 text-[12.5px] font-bold text-[#33415c] cursor-pointer hover:bg-[#f4f7fb] focus-visible:outline-2 focus-visible:outline-[#0d9488] disabled:cursor-not-allowed disabled:opacity-50'
const PRIMARY_BUTTON_CLASSES =
  'rounded-[10px] border-none bg-[linear-gradient(120deg,#0d9488,#14b8a6)] px-5 py-2.5 text-[13.5px] font-bold text-white cursor-pointer disabled:opacity-60'
const TABLE_HEAD_CLASSES = 'px-4 py-2.5 text-left text-[11.5px] font-bold tracking-[0.4px] text-[#7c8aa0] uppercase'
const TABLE_CELL_CLASSES = 'px-4 py-3 align-middle text-[13.5px] text-[#33415c] border-t border-[#eef1f6]'
const SEGMENT_CLASSES = 'rounded-full px-3.5 py-1.5 text-[12.5px] font-bold cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0d9488]'

type StatusFilter = 'all' | 'active' | 'dropped' | 'joinedLater'

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'dropped', label: 'Dropped' },
  { key: 'joinedLater', label: 'Joined later' },
]

function DropDialog({
  student,
  nextSession,
  fromLabel,
  eventId,
  onClose,
  onDropped,
}: {
  student: Student | null
  nextSession: EventSession | null
  fromLabel: string
  eventId: string
  onClose: () => void
  onDropped: (message: string) => void
}) {
  const [reason, setReason] = useState<DropReason>('Withdrew')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!student || !nextSession) return
    setSubmitting(true)
    setError(null)
    try {
      await dropInvitee({
        eventId,
        studentId: student.uuid,
        fromSessionId: nextSession.id,
        reason,
        note: note.trim() || null,
      })
      onDropped(`Dropped ${student.fullName} from ${fromLabel}: ${reason}.`)
      onClose()
    } catch {
      setError('Could not drop this student. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={student !== null} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" aria-labelledby="drop-dialog-title">
        <div>
          <h2 id="drop-dialog-title" className="m-0 text-[18px] font-extrabold text-[#1d1d1f]">
            Drop {student?.fullName ?? 'student'}
          </h2>
          <p className="m-0 mt-1 text-[13px] text-[#7c8aa0]">
            Applies from <span className="font-bold text-[#33415c]">{fromLabel}</span> onward. They stay on the invite list but can't check in from then on.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={FIELD_LABEL_CLASSES} htmlFor="drop-reason">
            Reason
          </label>
          <select id="drop-reason" value={reason} onChange={(e) => setReason(e.target.value as DropReason)} className={INPUT_CLASSES}>
            {DROP_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={FIELD_LABEL_CLASSES} htmlFor="drop-note">
            Note <span className="font-normal text-[#9aa6ba]">(optional)</span>
          </label>
          <input
            id="drop-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={INPUT_CLASSES}
            aria-describedby={error ? 'drop-error' : undefined}
            aria-invalid={error ? true : undefined}
          />
        </div>

        {error && (
          <span id="drop-error" role="alert" className={FIELD_ERROR_CLASSES}>
            {error}
          </span>
        )}

        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className={ROW_BUTTON_CLASSES}>
            Cancel
          </button>
          <button type="submit" disabled={submitting || !nextSession} className={PRIMARY_BUTTON_CLASSES}>
            {submitting ? 'Dropping…' : 'Drop student'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Doubles as a filter shortcut when `onClick` is given — a real <button> (not a div with a click
// handler) so it's reachable and operable by keyboard alone, with aria-pressed reflecting whether
// its own filter is the one currently applied, same convention as the Active/Dropped pills below.
function StatTile({
  value,
  label,
  tone,
  onClick,
  active,
}: {
  value: number
  label: string
  tone: string
  onClick?: () => void
  active?: boolean
}) {
  const content = (
    <>
      <span className="text-[22px] leading-none font-extrabold" style={{ color: tone }}>
        {value}
      </span>
      <span className="text-[12px] font-semibold text-[#7c8aa0]">{label}</span>
    </>
  )

  if (!onClick) {
    return <div className="flex min-w-[140px] flex-col gap-0.5 rounded-[14px] border border-[#eef1f6] bg-white px-4 py-3">{content}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`Show only "${label}"`}
      className="flex min-w-[140px] cursor-pointer flex-col gap-0.5 rounded-[14px] bg-white px-4 py-3 text-left [transition:box-shadow_150ms_ease] focus-visible:outline-2 focus-visible:outline-[#0d9488]"
      style={{ boxShadow: `0 0 0 ${active ? 2 : 1}px ${active ? tone : '#eef1f6'}` }}
    >
      {content}
    </button>
  )
}

export function InviteRosterPanel({
  eventId,
  students,
  periods,
  sessions,
  onChanged,
}: {
  eventId: string
  students: Student[]
  periods: InviteePeriod[]
  sessions: EventSession[]
  onChanged: () => void
}) {
  const [dropTarget, setDropTarget] = useState<Student | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)

  const orderedSessions = sortSessionsChronologically(sessions)
  const sessionsById = new Map(sessions.map((s) => [s.id, s]))
  const firstSessionId = orderedSessions[0]?.id
  const nextSession = findNextSession(orderedSessions, new Date())
  const nextFromLabel = nextSession ? describeDropFrom(nextSession, nextSession.id === firstSessionId) : ''

  // One row per student: their current invite if they have one, otherwise their latest drop.
  const openByStudent = new Map(periods.filter((p) => p.droppedFromSessionId === null).map((p) => [p.studentId, p]))
  const latestByStudent = new Map<string, InviteePeriod>()
  for (const p of periods) latestByStudent.set(p.studentId, p)

  const rows = students
    .map((student) => ({
      student,
      open: openByStudent.get(student.uuid) ?? null,
      latest: latestByStudent.get(student.uuid) ?? null,
    }))
    .filter((row): row is { student: Student; open: InviteePeriod | null; latest: InviteePeriod } => row.latest !== null)

  const activeCount = rows.filter((r) => r.open).length
  const droppedCount = rows.length - activeCount
  const joinedLaterCount = rows.filter((r) => r.open && r.open.joinedFromSessionId !== null).length

  const normalizedQuery = query.trim().toLowerCase()
  const visibleRows = rows.filter((r) => {
    if (statusFilter === 'active' && !r.open) return false
    if (statusFilter === 'dropped' && r.open) return false
    if (statusFilter === 'joinedLater' && !(r.open && r.open.joinedFromSessionId !== null)) return false
    if (normalizedQuery === '') return true
    const s = r.student
    return [s.fullName, s.id ?? '', s.program, s.faculty].some((field) => field.toLowerCase().includes(normalizedQuery))
  })

  function handleQueryChange(value: string) {
    setQuery(value)
    setPage(1)
  }

  function handleStatusChange(next: StatusFilter) {
    setStatusFilter(next)
    setPage(1)
  }

  async function handleRejoin(student: Student) {
    if (!nextSession) return
    setActionError(null)
    setMessage(null)
    try {
      await rejoinInvitee({ eventId, studentId: student.uuid, joinedFromSessionId: nextSession.id })
      setMessage(`Rejoined ${student.fullName} from ${nextFromLabel}.`)
      onChanged()
    } catch {
      setActionError(`Could not rejoin ${student.fullName}. Try again.`)
    }
  }

  function handleDropped(text: string) {
    setMessage(text)
    onChanged()
  }

  function statusCell(open: InviteePeriod | null, latest: InviteePeriod) {
    if (open) {
      if (open.joinedFromSessionId === null) {
        return <span className="inline-flex rounded-full bg-[#eef1f6] px-2.5 py-0.5 text-[12px] font-bold text-[#56617a]">Active</span>
      }
      const joinedSession = sessionsById.get(open.joinedFromSessionId)
      return (
        <span className="inline-flex rounded-full bg-[#ecfdf5] px-2.5 py-0.5 text-[12px] font-bold text-[#0f766e]">
          Joined {describeDropFrom(joinedSession, false)}
        </span>
      )
    }
    const fromSession = sessionsById.get(latest.droppedFromSessionId as string)
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex w-fit rounded-full bg-[#fff8e1] px-2.5 py-0.5 text-[12px] font-bold text-[#a0740f]">
          Dropped · {describeDropFrom(fromSession, fromSession?.id === firstSessionId)}
        </span>
        <span className="text-[12px] text-[#7c8aa0]">
          {latest.reason}
          {latest.note ? `: ${latest.note}` : ''}
        </span>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="invite-roster-heading">
      <h2 id="invite-roster-heading" className="sr-only">
        Invited students
      </h2>

      {/* role="group" (not "status") — these are now also filter shortcuts, and a live region
          shouldn't host focusable controls. Clicking a tile applies that filter; clicking the
          same one again clears back to "all", same toggle behavior as the pills below. */}
      <div className="flex flex-wrap gap-3" role="group" aria-label="Invite totals — click a tile to filter the list below">
        <StatTile
          value={activeCount}
          label="Invited now"
          tone="#0e1c3a"
          active={statusFilter === 'active'}
          onClick={() => handleStatusChange(statusFilter === 'active' ? 'all' : 'active')}
        />
        <StatTile
          value={droppedCount}
          label="Dropped"
          tone="#a0740f"
          active={statusFilter === 'dropped'}
          onClick={() => handleStatusChange(statusFilter === 'dropped' ? 'all' : 'dropped')}
        />
        <StatTile
          value={joinedLaterCount}
          label="Joined later"
          tone="#0f766e"
          active={statusFilter === 'joinedLater'}
          onClick={() => handleStatusChange(statusFilter === 'joinedLater' ? 'all' : 'joinedLater')}
        />
      </div>

      {!nextSession && orderedSessions.length > 0 && (
        <p className="m-0 text-[12.5px] text-[#9aa6ba]">No upcoming session left, so there's nothing to drop, add, or rejoin from.</p>
      )}

      {message && (
        <p className="m-0 rounded-[10px] bg-[#ecfdf5] px-4 py-2.5 text-[13px] font-semibold text-[#0f766e]">{message}</p>
      )}
      {actionError && (
        <p role="alert" className={`m-0 ${FIELD_ERROR_CLASSES}`}>
          {actionError}
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
          <label className={FIELD_LABEL_CLASSES} htmlFor="roster-search">
            Search
          </label>
          <input
            id="roster-search"
            type="search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Name, student number, program or faculty"
            autoComplete="off"
            className={INPUT_CLASSES}
          />
        </div>

        <div role="group" aria-label="Show students" className="flex gap-1.5">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={statusFilter === option.key}
              onClick={() => handleStatusChange(option.key)}
              className={`${SEGMENT_CLASSES} ${
                statusFilter === option.key ? 'bg-[#0d9488] text-white' : 'bg-[#eef1f6] text-[#56617a] hover:bg-[#e2e6ee]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="m-0 text-sm text-[#7c8aa0]">No students invited yet. Use Add students to invite someone.</p>
      ) : visibleRows.length === 0 ? (
        <p className="m-0 text-sm text-[#7c8aa0]">No students match these filters.</p>
      ) : (
        <>
          {/* Desktop table — the Drop/Rejoin button lives in a 4th column, which would sit off the
              right edge of a narrow phone screen behind a horizontal scroll. The card list below
              is the mobile equivalent, with that same button shown directly on each card instead. */}
          <div className="overflow-x-auto max-[701px]:hidden">
            <table className="w-full border-collapse">
              <caption className="sr-only">Invited students and their status</caption>
              <thead>
                <tr>
                  <th scope="col" className={TABLE_HEAD_CLASSES}>Name</th>
                  <th scope="col" className={TABLE_HEAD_CLASSES}>Faculty</th>
                  <th scope="col" className={TABLE_HEAD_CLASSES}>Status</th>
                  <th scope="col" className={`${TABLE_HEAD_CLASSES} text-right`}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageSlice(visibleRows, page).map(({ student, open, latest }) => (
                  <tr key={student.uuid}>
                    <td className={TABLE_CELL_CLASSES}>
                      <span className="font-bold text-[#1d1d1f]">{student.fullName}</span>
                    </td>
                    <td className={TABLE_CELL_CLASSES}>{student.faculty}</td>
                    <td className={TABLE_CELL_CLASSES}>{statusCell(open, latest)}</td>
                    <td className={`${TABLE_CELL_CLASSES} text-right`}>
                      {open ? (
                        <button
                          type="button"
                          onClick={() => setDropTarget(student)}
                          disabled={!nextSession}
                          aria-label={`Drop ${student.fullName} from the next session`}
                          className={ROW_BUTTON_CLASSES}
                        >
                          Drop
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRejoin(student)}
                          disabled={!nextSession}
                          aria-label={`Rejoin ${student.fullName} from the next session`}
                          className={ROW_BUTTON_CLASSES}
                        >
                          Rejoin
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="hidden flex-col gap-2.5 max-[701px]:flex">
            {pageSlice(visibleRows, page).map(({ student, open, latest }) => (
              <div key={student.uuid} className="flex flex-col gap-2.5 rounded-[14px] border border-[#eef1f6] bg-white p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-bold text-[#1d1d1f]">{student.fullName}</span>
                    <span className="text-[12.5px] text-[#56617a]">{student.faculty}</span>
                  </div>
                  {open ? (
                    <button
                      type="button"
                      onClick={() => setDropTarget(student)}
                      disabled={!nextSession}
                      aria-label={`Drop ${student.fullName} from the next session`}
                      className={`shrink-0 ${ROW_BUTTON_CLASSES}`}
                    >
                      Drop
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRejoin(student)}
                      disabled={!nextSession}
                      aria-label={`Rejoin ${student.fullName} from the next session`}
                      className={`shrink-0 ${ROW_BUTTON_CLASSES}`}
                    >
                      Rejoin
                    </button>
                  )}
                </div>
                {statusCell(open, latest)}
              </div>
            ))}
          </div>

          <TablePager label="Invited students" page={page} total={visibleRows.length} onPage={setPage} />
        </>
      )}

      <DropDialog
        key={dropTarget?.uuid ?? 'none'}
        student={dropTarget}
        nextSession={nextSession}
        fromLabel={nextFromLabel}
        eventId={eventId}
        onClose={() => setDropTarget(null)}
        onDropped={handleDropped}
      />
    </section>
  )
}
