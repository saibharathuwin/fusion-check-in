import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  parseTabularFile,
  isSupportedTabularFile,
  TABULAR_FILE_ACCEPT,
  UNSUPPORTED_FILE_MESSAGE,
} from '../../lib/parseTabularFile'
import { Link, useOutletContext } from 'react-router-dom'
import { ChevronLeftIcon, FileUploadIcon } from '../../components/icons/NavIcons'
import { Modal } from '../../components/Modal/Modal'
import { addInvitee, dropInvitee, fetchRoster, searchStudents, type InviteRoster } from '../../data/inviteesData'
import {
  DROP_REASONS,
  describeDropFrom,
  findNextSession,
  formatSessionLabel,
  sortSessionsChronologically,
  type DropReason,
  type InviteePeriod,
} from '../../data/inviteePeriods'
import { getSessionsForEvent, type EventSession } from '../../data/sessionsData'
import { runWithConcurrency } from '../Students/csvImportData'
import type { Student } from '../StudentDirectory/studentDirectoryData'
import { LoadingState } from './attendeeDisplay'
import type { EventDetailContext } from './EventDetailLayout'
import { InviteRosterPanel } from './InviteRosterPanel'
import { TablePager } from './TablePager'
import { pageSlice } from './tablePaging'

const FIELD_LABEL_CLASSES = 'text-[13px] font-bold text-[#33415c]'
const FIELD_ERROR_CLASSES = 'text-[12.5px] font-semibold text-[#d1453d]'
const INPUT_CLASSES =
  'w-full rounded-[10px] border border-[#dfe5ef] bg-white px-3.5 py-2.5 text-[14px] text-[#1d1d1f] focus:border-[#0d9488] focus:shadow-[0_0_0_3px_rgba(13,148,136,0.18)] focus:outline-none'
const ROW_BUTTON_CLASSES =
  'inline-flex items-center rounded-[9px] border border-[#dfe5ef] bg-white px-3 py-1.5 text-[12.5px] font-bold text-[#33415c] cursor-pointer hover:bg-[#f4f7fb] focus-visible:outline-2 focus-visible:outline-[#0d9488] disabled:opacity-60'
const PRIMARY_BUTTON_CLASSES =
  'rounded-[10px] border-none bg-[linear-gradient(120deg,#0d9488,#14b8a6)] px-5 py-2.5 text-[13.5px] font-bold text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-60'

// Matches the CSV header normalising InviteeSelector.tsx already uses for the add-by-CSV flow.
function normalizeCsvHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

const STUDENT_NUMBER_ALIASES = ['student_number', 'student_id', 'studentid', 'id_number', 'id']
const EMAIL_ALIASES = ['email', 'email_address', 'university_email']

interface DropCsvPreview {
  matched: { value: string; student: Student }[]
  notInvited: string[]
  columnUsed: 'student_number' | 'email'
}

function DropByCsvSection({
  eventId,
  activeInvitees,
  nextSession,
  nextFromLabel,
  onDropped,
}: {
  eventId: string
  activeInvitees: Student[]
  nextSession: EventSession | null
  nextFromLabel: string
  onDropped: (message: string) => void
}) {
  const [csvError, setCsvError] = useState('')
  const [preview, setPreview] = useState<DropCsvPreview | null>(null)
  const [reason, setReason] = useState<DropReason>('Other')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const csvInputRef = useRef<HTMLInputElement>(null)

  function handleCsvFile(file: File) {
    setCsvError('')
    setPreview(null)
    if (!isSupportedTabularFile(file)) {
      setCsvError(UNSUPPORTED_FILE_MESSAGE)
      return
    }

    parseTabularFile(file, {
      complete: (results) => {
        const headers = results.meta.fields
        const byNormalized = new Map<string, string>()
        for (const h of headers) {
          const norm = normalizeCsvHeader(h)
          if (!byNormalized.has(norm)) byNormalized.set(norm, h)
        }

        const numberHeader = STUDENT_NUMBER_ALIASES.map((a) => byNormalized.get(a)).find(Boolean)
        const emailHeader = EMAIL_ALIASES.map((a) => byNormalized.get(a)).find(Boolean)
        if (!numberHeader && !emailHeader) {
          setCsvError('This CSV needs a student_number column (or an email column as a fallback).')
          return
        }
        const columnUsed: DropCsvPreview['columnUsed'] = numberHeader ? 'student_number' : 'email'

        // Only matched against students currently on the invite list — someone not invited (or
        // already dropped) has nothing here to drop them from.
        const byNumber = new Map(activeInvitees.filter((s) => s.id).map((s) => [(s.id as string).trim().toLowerCase(), s]))
        const byEmail = new Map(activeInvitees.map((s) => [s.email.trim().toLowerCase(), s]))

        const matched: DropCsvPreview['matched'] = []
        const notInvited: string[] = []
        const seen = new Set<string>()

        for (const row of results.data) {
          const numberValue = numberHeader ? (row[numberHeader] ?? '').trim() : ''
          const emailValue = emailHeader ? (row[emailHeader] ?? '').trim() : ''
          const usingNumber = numberValue !== ''
          const value = usingNumber ? numberValue : emailValue
          if (!value) continue
          const key = value.toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)

          const student = usingNumber ? byNumber.get(key) : byEmail.get(key)
          if (student) matched.push({ value, student })
          else notInvited.push(value)
        }

        if (matched.length === 0 && notInvited.length === 0) {
          setCsvError('This CSV has no rows to read.')
          return
        }
        setPreview({ matched, notInvited, columnUsed })
      },
      error: () => setCsvError('Could not read this file. Please check it is a valid CSV or Excel (.xlsx) file and try again.'),
    })
  }

  async function handleConfirm() {
    if (!preview || !nextSession) return
    setSubmitting(true)
    setCsvError('')
    const outcomes = await runWithConcurrency(preview.matched, 6, async ({ student }) => {
      try {
        await dropInvitee({ eventId, studentId: student.uuid, fromSessionId: nextSession.id, reason, note: note.trim() || null })
        return true
      } catch {
        return false
      }
    })
    const droppedCount = outcomes.filter(Boolean).length
    setSubmitting(false)
    setPreview(null)
    setNote('')
    onDropped(
      droppedCount === preview.matched.length
        ? `Dropped ${droppedCount} student${droppedCount === 1 ? '' : 's'} from ${nextFromLabel}: ${reason}.`
        : `Dropped ${droppedCount} of ${preview.matched.length} students from ${nextFromLabel}. ${preview.matched.length - droppedCount} failed, try again for those.`,
    )
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="drop-csv-heading">
      <div>
        <h2 id="drop-csv-heading" className="m-0 text-[16px] font-extrabold text-[#12284a]">
          Drop students via CSV
        </h2>
        <p className="m-0 mt-1 text-[13px] text-[#7c8aa0]">
          Upload a CSV or Excel (.xlsx) file with a student_number column, an email column, or both, to drop more than a handful at once instead of one by one.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={() => csvInputRef.current?.click()} className={ROW_BUTTON_CLASSES}>
          <FileUploadIcon size={14} />
          <span className="ml-1.5">Choose file</span>
        </button>
        <input
          ref={csvInputRef}
          type="file"
          accept={TABULAR_FILE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleCsvFile(file)
            e.target.value = ''
          }}
        />
      </div>

      {csvError && (
        <p role="alert" className={`m-0 ${FIELD_ERROR_CLASSES}`}>
          {csvError}
        </p>
      )}

      {preview && (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-[12.5px] font-bold text-[#12284a]">
            Matched by {preview.columnUsed === 'student_number' ? 'student number' : 'email'}: {preview.matched.length} currently
            invited, {preview.notInvited.length} not currently invited
          </p>

          {preview.matched.length > 0 && (
            <div className="max-h-[150px] overflow-y-auto rounded-[10px] border border-[#fde3c4] bg-[#fffaf3] px-3 py-2.5 text-[12.5px] text-[#12284a]">
              {preview.matched.map((m) => (
                <div key={m.student.uuid}>
                  <span className="font-semibold">{m.value}</span> &rarr; {m.student.fullName} ({m.student.email})
                </div>
              ))}
            </div>
          )}

          {preview.notInvited.length > 0 && (
            <div className="max-h-[150px] overflow-y-auto rounded-[10px] border border-[#f8c9c9] bg-[#fdf3f3] px-3 py-2.5 text-[12.5px] text-[#d1453d]">
              <p className="m-0 mb-1 font-bold">Not currently invited, so there&apos;s nothing to drop for:</p>
              {preview.notInvited.map((value) => (
                <div key={value}>{value}</div>
              ))}
            </div>
          )}

          {preview.matched.length > 0 && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className={FIELD_LABEL_CLASSES} htmlFor="drop-csv-reason">
                  Reason
                </label>
                <select
                  id="drop-csv-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value as DropReason)}
                  className={INPUT_CLASSES}
                >
                  {DROP_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={FIELD_LABEL_CLASSES} htmlFor="drop-csv-note">
                  Note <span className="font-normal text-[#9aa6ba]">(optional)</span>
                </label>
                <input id="drop-csv-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} className={INPUT_CLASSES} />
              </div>

              <p className="m-0 text-[12px] text-[#9aa6ba]">
                Applies to all {preview.matched.length} from <span className="font-bold text-[#56617a]">{nextFromLabel}</span> onward,
                same as dropping one at a time.
              </p>
            </>
          )}

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={preview.matched.length === 0 || submitting || !nextSession}
              className={PRIMARY_BUTTON_CLASSES}
            >
              {submitting ? 'Dropping…' : `Drop ${preview.matched.length} student${preview.matched.length === 1 ? '' : 's'}`}
            </button>
            <button type="button" onClick={() => setPreview(null)} className={ROW_BUTTON_CLASSES}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function AddInviteesSection({
  eventId,
  invitedUuids,
  droppedUuids,
  nextSession,
  onAdded,
}: {
  eventId: string
  invitedUuids: Set<string>
  droppedUuids: Set<string>
  nextSession: EventSession | null
  onAdded: (message: string) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Student[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  // Tracks an add the instant it succeeds, before invitedUuids' roster refetch comes back — without
  // this, a row would briefly still show "Add" after being clicked, which is exactly the moment a
  // rushed staffer double-clicks it.
  const [justAddedIds, setJustAddedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) return
    let cancelled = false
    searchStudents(term)
      .then((rows) => {
        if (cancelled) return
        setResults(rows)
        setSearchError(null)
      })
      .catch(() => {
        if (cancelled) return
        setSearchError('Could not search students. Try again.')
      })
      .finally(() => {
        if (!cancelled) setSearching(false)
      })
    return () => {
      cancelled = true
    }
  }, [query])

  const [resultPage, setResultPage] = useState(1)
  const pagedResults = pageSlice(results, resultPage)
  const trimmed = query.trim()
  const showingResults = trimmed.length >= 2

  function handleQueryChange(value: string) {
    setQuery(value)
    setResultPage(1)
    setAddError(null)
    setSearching(value.trim().length >= 2)
    if (value.trim().length < 2) {
      setResults([])
      setSearchError(null)
    }
  }

  const handleAdd = useCallback(
    async (student: Student) => {
      setAddingId(student.uuid)
      setAddError(null)
      try {
        await addInvitee({ eventId, studentId: student.uuid, joinedFromSessionId: nextSession?.id ?? null })
        const verb = droppedUuids.has(student.uuid) ? 'Rejoined' : 'Added'
        onAdded(`${verb} ${student.fullName} from ${nextSession ? formatSessionLabel(nextSession) : 'the next session'}.`)
        setJustAddedIds((prev) => new Set(prev).add(student.uuid))
      } catch {
        setAddError(`Could not add ${student.fullName}. Try again.`)
      } finally {
        setAddingId(null)
      }
    },
    [eventId, nextSession, onAdded, droppedUuids],
  )

  return (
    <section className="flex flex-col gap-3" aria-labelledby="add-invitees-heading">
      <div>
        <h2 id="add-invitees-heading" className="m-0 text-[16px] font-extrabold text-[#12284a]">
          Add students
        </h2>
        <p className="m-0 mt-1 text-[13px] text-[#7c8aa0]">Search by name or student number, then add them to the invite list.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={FIELD_LABEL_CLASSES} htmlFor="invitee-search">
          Search students
        </label>
        <input
          id="invitee-search"
          type="search"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Name or student number"
          autoComplete="off"
          className={INPUT_CLASSES}
          aria-describedby="invitee-search-hint"
        />
        <span id="invitee-search-hint" className="text-[12px] text-[#9aa6ba]">
          Type at least 2 characters.
        </span>
      </div>

      {addError && (
        <p role="alert" className={`m-0 ${FIELD_ERROR_CLASSES}`}>
          {addError}
        </p>
      )}
      {searchError && (
        <p role="alert" className={`m-0 ${FIELD_ERROR_CLASSES}`}>
          {searchError}
        </p>
      )}

      {showingResults && searching && <LoadingState label="Searching…" />}

      {showingResults && !searching && !searchError && (
        results.length === 0 ? (
          <p className="m-0 text-[13px] text-[#7c8aa0]">No students match “{trimmed}”.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <caption className="sr-only">Students matching your search</caption>
              <thead>
                <tr>
                  <th scope="col" className="px-3 py-2 text-left text-[11.5px] font-bold tracking-[0.4px] text-[#7c8aa0] uppercase">Name</th>
                  <th scope="col" className="px-3 py-2 text-left text-[11.5px] font-bold tracking-[0.4px] text-[#7c8aa0] uppercase">Program</th>
                  <th scope="col" className="px-3 py-2 text-right text-[11.5px] font-bold tracking-[0.4px] text-[#7c8aa0] uppercase">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedResults.map((student) => {
                  const alreadyInvited = invitedUuids.has(student.uuid) || justAddedIds.has(student.uuid)
                  const previouslyDropped = !alreadyInvited && droppedUuids.has(student.uuid)
                  return (
                    <tr key={student.uuid}>
                      <td className="border-t border-[#eef1f6] px-3 py-2.5 text-[13.5px] font-bold text-[#1d1d1f]">{student.fullName}</td>
                      <td className="border-t border-[#eef1f6] px-3 py-2.5 text-[13px] text-[#33415c]">{student.program}</td>
                      <td className="border-t border-[#eef1f6] px-3 py-2.5 text-right">
                        {alreadyInvited ? (
                          <span className="inline-flex items-center rounded-[9px] border border-[#e2e6ee] bg-[#f2f5fa] px-3 py-1.5 text-[12.5px] font-bold whitespace-nowrap text-[#56617a]">
                            Already invited
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAdd(student)}
                            disabled={addingId !== null || !nextSession}
                            aria-label={`${previouslyDropped ? 'Rejoin' : 'Add'} ${student.fullName} to the invite list`}
                            className={
                              previouslyDropped
                                ? 'inline-flex items-center rounded-[9px] border border-[#fde3c4] bg-[#fff8e1] px-3 py-1.5 text-[12.5px] font-bold whitespace-nowrap text-[#a0740f] cursor-pointer hover:bg-[#fef0c7] focus-visible:outline-2 focus-visible:outline-[#a0740f] disabled:cursor-not-allowed disabled:opacity-60'
                                : ROW_BUTTON_CLASSES
                            }
                          >
                            {addingId === student.uuid
                              ? previouslyDropped
                                ? 'Rejoining…'
                                : 'Adding…'
                              : previouslyDropped
                                ? 'Rejoin'
                                : 'Add'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <TablePager label="Search results" page={resultPage} total={results.length} onPage={setResultPage} />
          </div>
        )
      )}
    </section>
  )
}

export function EventInviteesPage() {
  const { event } = useOutletContext<EventDetailContext>()
  const isInviteOnly = event.registrationType === 'Invite-only'

  const [sessions, setSessions] = useState<EventSession[]>([])
  useEffect(() => {
    getSessionsForEvent(event.id).then(setSessions)
  }, [event.id])

  const [rosterData, setRosterData] = useState<{ eventId: string; roster: InviteRoster } | null>(null)
  const roster = rosterData?.eventId === event.id ? rosterData.roster : null
  const invitees = roster?.students ?? null
  const periods: InviteePeriod[] | null = roster?.periods ?? null

  const loadRoster = useCallback(() => {
    fetchRoster(event.id).then((r) => setRosterData({ eventId: event.id, roster: r }))
  }, [event.id])

  useEffect(() => {
    if (isInviteOnly) loadRoster()
  }, [isInviteOnly, loadRoster])

  const [message, setMessage] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [dropCsvOpen, setDropCsvOpen] = useState(false)
  const invitedUuids = useMemo(
    () => new Set((periods ?? []).filter((p) => p.droppedFromSessionId === null).map((p) => p.studentId)),
    [periods],
  )
  // Anyone with a period here but no longer in invitedUuids has only closed (dropped) periods —
  // shown in the Add search so re-adding them reads as "rejoin", not "invite a stranger".
  const droppedUuids = useMemo(
    () => new Set((periods ?? []).map((p) => p.studentId).filter((id) => !invitedUuids.has(id))),
    [periods, invitedUuids],
  )
  const activeInvitees = useMemo(() => (invitees ?? []).filter((s) => invitedUuids.has(s.uuid)), [invitees, invitedUuids])
  const orderedSessions = sortSessionsChronologically(sessions)
  const nextSession = findNextSession(orderedSessions, new Date())
  const nextFromLabel = nextSession ? describeDropFrom(nextSession, nextSession.id === orderedSessions[0]?.id) : ''

  function handleChanged(text?: string) {
    if (text) setMessage(text)
    loadRoster()
  }

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-[22px]">
      <Link
        to={`/events/${event.id}`}
        className="inline-flex w-fit items-center gap-1 text-[13.5px] font-semibold text-[#7c8aa0] no-underline [transition:color_150ms_ease] hover:text-[#2f6fed]"
      >
        <ChevronLeftIcon size={16} />
        Back to Event
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 mb-1 text-[26px] font-extrabold text-[#1d1d1f] max-[701px]:text-[22px]">Invited students</h1>
          <p className="m-0 text-sm text-[#7c8aa0]">{event.program}</p>
        </div>
        {isInviteOnly && (
          <div className="flex flex-wrap gap-2.5">
            <button type="button" onClick={() => setDropCsvOpen(true)} className={ROW_BUTTON_CLASSES}>
              <FileUploadIcon size={14} />
              <span className="ml-1.5">Drop via CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="rounded-[10px] border-none bg-[linear-gradient(120deg,#0d9488,#14b8a6)] px-5 py-2.5 text-[13.5px] font-bold text-white cursor-pointer"
            >
              Add students
            </button>
          </div>
        )}
      </div>

      {!isInviteOnly ? (
        <p className="m-0 text-sm text-[#7c8aa0]">This event isn't invite-only, so there's no invite list to manage.</p>
      ) : (
        <>
          {message && (
            <p role="status" className="m-0 rounded-[10px] bg-[#ecfdf5] px-4 py-2.5 text-[13.5px] font-semibold text-[#0f766e]">
              {message}
            </p>
          )}

          <Modal open={addOpen} onClose={() => setAddOpen(false)} size="lg">
            <AddInviteesSection
              eventId={event.id}
              invitedUuids={invitedUuids}
              droppedUuids={droppedUuids}
              nextSession={nextSession}
              onAdded={(text) => handleChanged(text)}
            />
          </Modal>

          <Modal open={dropCsvOpen} onClose={() => setDropCsvOpen(false)} size="lg">
            <DropByCsvSection
              eventId={event.id}
              activeInvitees={activeInvitees}
              nextSession={nextSession}
              nextFromLabel={nextFromLabel}
              onDropped={(text) => {
                handleChanged(text)
                setDropCsvOpen(false)
              }}
            />
          </Modal>

          {invitees && periods ? (
            <InviteRosterPanel
              eventId={event.id}
              students={invitees}
              periods={periods}
              sessions={sessions}
              onChanged={() => handleChanged()}
            />
          ) : (
            <LoadingState label="Loading invited students…" />
          )}
        </>
      )}
    </div>
  )
}
