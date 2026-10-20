import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronRightIcon, ClockIcon, PersonPlusIcon, SearchIcon, XIcon } from '../../components/icons/NavIcons'
import { Modal } from '../../components/Modal/Modal'
import { recordCheckIn, undoCheckIn, type AttendeeRow } from '../../data/attendanceData'
import { pickOpenSession, sessionWindowStatus, type EventSession } from '../../data/sessionsData'
import type { EventItem } from '../Events/eventsData'
import { getAvatarTheme, getInitials, searchStudents, type AvatarTheme, type Student } from '../StudentDirectory/studentDirectoryData'
import { CHECK_IN_STATUS_BADGE, formatCheckInTime } from './attendeeFormatting'
import { averageStatusCounts, studentsInEverySession } from './commonAttendance'
import { DroppedStudentsCard, type DroppedEntry } from './DroppedStudentsCard'
import { LoadingState } from './attendeeDisplay'
import { useSearchResultsNav } from '../../lib/useSearchResultsNav'

const ACCENT_TEAL = '#0f766e'
const ACCENT_AMBER = '#eaa421'
const NAVY = '#0e1c3a'

// Inline style, not a conditional Tailwind class — see TypeaheadInput/PassToolsPage for why a
// same-string conditional class can silently lose to a base class regardless of source order.
const HIGHLIGHT_STYLE = { backgroundColor: '#0d9488', color: '#ffffff' }

const AVATAR_THEME_CLASSES: Record<AvatarTheme, string> = {
  blue: 'bg-[#d6e7fc] text-[#2f6fed]',
  green: 'bg-[#d3f1e2] text-[#12a35c]',
  teal: 'bg-[#ccfbf1] text-[#0d9488]',
  purple: 'bg-[#e4dbfb] text-[#8b5cf6]',
  amber: 'bg-[#fff3d6] text-[#b3790a]',
  pink: 'bg-[#fde7f1] text-[#d13d82]',
}

const CARD_CLASSES = 'flex flex-col gap-4 rounded-2xl border border-[#eef1f6] bg-white p-6 shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[641px]:p-5'

// Prefers a session whose window is open right now; failing that, the most recently closed one
// (today's, most likely), else just the first upcoming one — same rule LiveCheckInsPanel uses, so
// "the current session" means the same thing everywhere in this app.
function pickCurrentSession(sessions: EventSession[], now: Date): EventSession | null {
  if (sessions.length === 0) return null
  const open = pickOpenSession(sessions, now)
  if (open) return open
  const closed = sessions.filter((s) => sessionWindowStatus(s, now) === 'closed')
  if (closed.length > 0) return closed[closed.length - 1]
  return sessions[0]
}

// The actual clock time a check-in happened, with its date — not "N hours ago", which stops being
// useful once a check-in is from earlier today, let alone from a previous day of a multi-day
// event, and not bare time either, since that's ambiguous the moment more than one day is in view.
function formatArrivalTime(checkedInAt: string): string {
  const date = new Date(checkedInAt)
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}

function formatCountdown(ms: number): string {
  const totalMinutes = Math.ceil(ms / 60_000)
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

function StatCard({
  label,
  value,
  sublabel,
  accent,
  children,
}: {
  label: string
  value: React.ReactNode
  sublabel?: string
  accent?: 'amber'
  children?: React.ReactNode
}) {
  return (
    <div
      className={`flex min-w-[190px] flex-1 flex-col gap-1.5 rounded-2xl border p-5 ${
        accent === 'amber' ? 'border-[#f5dfb0] bg-[#fff8ea]' : 'border-[#eef1f6] bg-white shadow-[0_2px_10px_rgba(15,40,74,0.05)]'
      }`}
    >
      <span className="text-[11px] font-bold tracking-[0.6px] text-[#9aa6ba] uppercase">{label}</span>
      <span className={`text-[26px] leading-[1.1] font-extrabold ${accent === 'amber' ? 'text-[#a0740f]' : 'text-[#0e1c3a]'}`}>{value}</span>
      {sublabel && <span className="text-[12px] font-semibold text-[#7c8aa0]">{sublabel}</span>}
      {children}
    </div>
  )
}

// Line-with-filled-area chart of cumulative check-ins for the current session, y-axis quartered to
// the session's capacity (or invited count) rather than auto-scaled, and a highlighted badge over
// the latest point so the live total reads at a glance without hovering.
function CheckInsBuildingUpChart({ attendees, denominator }: { attendees: AttendeeRow[]; denominator: number | null }) {
  if (attendees.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl bg-[#f7f9fc] py-16 text-sm text-[#7c8aa0]">
        No check-ins yet this session. This fills in as people scan in.
      </div>
    )
  }

  const sorted = [...attendees].sort((a, b) => new Date(a.checkedInAt).getTime() - new Date(b.checkedInAt).getTime())
  const data = sorted.map((row, index) => ({ label: formatCheckInTime(row.checkedInAt), count: index + 1 }))
  const maxValue = Math.max(denominator ?? 0, sorted.length)
  // Four evenly-spaced ticks (0, ¼, ½, ¾, max) — matches "0/6/12/18/24" style scaling from the
  // approved design rather than whatever ticks recharts would auto-generate.
  const tickMax = Math.max(4, Math.ceil(maxValue / 4) * 4)
  const ticks = [0, tickMax / 4, tickMax / 2, (tickMax * 3) / 4, tickMax]
  const last = data[data.length - 1]

  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={data} margin={{ top: 26, right: 20, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id="checkInFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT_TEAL} stopOpacity={0.25} />
            <stop offset="100%" stopColor={ACCENT_TEAL} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11.5, fill: '#7c8aa0' }} axisLine={{ stroke: '#eef1f6' }} tickLine={false} minTickGap={28} />
        <YAxis
          domain={[0, tickMax]}
          ticks={ticks}
          allowDecimals={false}
          tick={{ fontSize: 12, fill: '#7c8aa0' }}
          axisLine={{ stroke: '#eef1f6' }}
          tickLine={false}
          width={30}
        />
        <Tooltip formatter={(value) => [`${value} checked in`, '']} />
        <Area
          type="monotone"
          dataKey="count"
          stroke={ACCENT_TEAL}
          strokeWidth={2.5}
          fill="url(#checkInFill)"
          activeDot={{ r: 5 }}
          // A custom per-point dot rather than a separate ReferenceDot overlay — recharts hands
          // this the real computed pixel position (cx/cy) for each point directly, so the "current
          // count" badge on the last point can't drift out of alignment the way a second
          // category-string-matched series did (duplicate x-axis labels made that lookup
          // ambiguous). Every other point renders nothing, keeping the line itself dot-free.
          dot={(props: { cx?: number; cy?: number; index?: number }) => {
            const { cx = 0, cy = 0, index = -1 } = props
            if (index !== data.length - 1) return <g key={`dot-${index}`} />
            const text = String(last.count)
            const width = 18 + text.length * 8
            return (
              <g key={`dot-${index}`}>
                <circle cx={cx} cy={cy} r={4.5} fill={ACCENT_TEAL} stroke="white" strokeWidth={2} />
                <g transform={`translate(${cx - width / 2}, ${cy - 34})`}>
                  <rect width={width} height={22} rx={11} fill={ACCENT_TEAL} />
                  <text x={width / 2} y={15} textAnchor="middle" fontSize={12} fontWeight={700} fill="white">
                    {text}
                  </text>
                </g>
              </g>
            )
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// Staff-initiated fallback for a broken scanner or a student who arrived without their pass
// scanned — searches the real students table and records a 'manual' check-in against the
// currently-focused session. Lives in a Modal so it layers over the dashboard rather than
// disturbing its layout; the dashboard itself updates the moment the check-in lands via the same
// Realtime subscription that powers the live feed, so there's nothing to manually refresh here.
function ManualCheckInModal({
  open,
  onClose,
  eventId,
  targetSessions,
  allAttendees,
  isInviteOnly,
  invitees,
}: {
  open: boolean
  onClose: () => void
  eventId: string
  // One session normally; every session of a day when "All sessions" is picked for that day — a
  // manual check-in is then recorded against each of them in one action, skipping any the student
  // is already in rather than silently guessing a single one to use.
  targetSessions: EventSession[]
  allAttendees: AttendeeRow[]
  // Invite-only events restrict who can even be searched here to the invite list — otherwise the
  // search would surface every student in the database, most of whom aren't eligible for this
  // event at all. Open/Limited events have no such roster, so search stays unrestricted for them.
  isInviteOnly: boolean
  invitees: Student[] | null
}) {
  const session = targetSessions.length === 1 ? targetSessions[0] : null
  const targetSessionIds = useMemo(() => targetSessions.map((s) => s.id), [targetSessions])
  // Excluded from search only once they're in EVERY target session — someone who only made it to
  // Morning should still show up so staff can top them up with Afternoon.
  const checkedInUuids = useMemo(
    () => studentsInEverySession(allAttendees, targetSessionIds),
    [allAttendees, targetSessionIds],
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [searchData, setSearchData] = useState<{ query: string; results: Student[] } | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // checkInIds: only the check-ins this action actually just created (never an "already checked
  // in" outcome's existing id) — that's what Undo reverses, and what tells us whether to even show
  // it. undoing: true while the undo itself is in flight, so the button can't be double-clicked.
  const [justCheckedIn, setJustCheckedIn] = useState<{ message: string; checkInIds: string[]; undoing: boolean } | null>(null)

  // Reset the panel's own state whenever it opens (or the focused session changes while open) —
  // adjusted during render rather than in an effect, so there's no extra render between the modal
  // opening and its fields being cleared.
  const [resetKey, setResetKey] = useState<string>(`${open}:${targetSessionIds.join(',')}`)
  const currentResetKey = `${open}:${targetSessionIds.join(',')}`
  if (currentResetKey !== resetKey) {
    setResetKey(currentResetKey)
    if (open) {
      setSearchQuery('')
      setSearchData(null)
      setActionError(null)
      setJustCheckedIn(null)
    }
  }

  const trimmedQuery = searchQuery.trim()
  const searchResults = searchData?.query === trimmedQuery ? searchData.results : []
  const searchLoading = trimmedQuery !== '' && searchData?.query !== trimmedQuery
  const { highlighted, setHighlighted, handleKeyDown: handleResultsKeyDown } = useSearchResultsNav(searchResults, handleCheckIn)
  // Only meaningfully "loading" once the invite list itself is in — until then there's nothing
  // correct to show for an Invite-only event, so the search box stays disabled instead.
  const inviteListLoading = isInviteOnly && invitees === null

  const inviteeUuids = useMemo(() => (invitees ? new Set(invitees.map((s) => s.uuid)) : null), [invitees])

  useEffect(() => {
    if (!open || !trimmedQuery || inviteListLoading) return
    searchStudents(trimmedQuery).then((found) => {
      const eligible = isInviteOnly && inviteeUuids ? found.filter((s) => inviteeUuids.has(s.uuid)) : found
      // Already-checked-in students stay in the results (shown as "Already checked in", not
      // actionable) instead of silently disappearing — see the row rendering below.
      setSearchData({ query: trimmedQuery, results: eligible })
    })
  }, [open, trimmedQuery, checkedInUuids, isInviteOnly, inviteeUuids, inviteListLoading])

  // The real check-in id(s) behind an "Already checked in" row — only within the sessions this
  // modal targets, same scoping handleCheckIn itself uses, so undoing here can never touch a
  // check-in from some other session this modal isn't even working with.
  function existingCheckInIds(studentUuid: string): string[] {
    return allAttendees
      .filter((a) => a.student.uuid === studentUuid && a.sessionId && targetSessionIds.includes(a.sessionId))
      .map((a) => a.checkInId)
  }

  // Undoes a check-in found already in place via search — distinct from handleUndoLast below,
  // which only reverses whatever THIS modal session itself just created. This one covers the case
  // that's actually most common: a student was checked in earlier (by a scan, by someone else, in
  // an earlier visit to this modal) and staff now wants to correct that record.
  async function handleUndoExisting(student: Student) {
    const ids = existingCheckInIds(student.uuid)
    if (ids.length === 0) return
    setActionError(null)
    setBusyKey(student.uuid)
    try {
      await Promise.all(ids.map((id) => undoCheckIn(id)))
      setJustCheckedIn({ message: `${student.fullName}'s check-in undone.`, checkInIds: [], undoing: false })
    } catch {
      setActionError(`Couldn't undo ${student.fullName}'s check-in. Please try again.`)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleCheckIn(student: Student) {
    // Guards both the mouse click (also blocked by the button's own `disabled`) and the keyboard
    // path (Enter on a highlighted row, from useSearchResultsNav, which calls this directly and
    // has no idea the row is non-actionable) — a student already checked in does nothing here.
    if (targetSessions.length === 0 || checkedInUuids.has(student.uuid)) return
    setActionError(null)
    setBusyKey(student.uuid)
    try {
      const outcomes = await Promise.all(
        targetSessions.map(async (s) => ({
          session: s,
          result: await recordCheckIn({ eventId, sessionId: s.id, studentUuid: student.uuid, method: 'manual' }),
        })),
      )
      const ok = (o: (typeof outcomes)[number]) => o.result.outcome === 'checked_in' || o.result.outcome === 'already_checked_in'
      const failed = outcomes.filter((o) => !ok(o))
      const newlyCheckedOutcomes = outcomes.filter((o) => o.result.outcome === 'checked_in')
      const newlyChecked = newlyCheckedOutcomes.map((o) => o.session.label)
      const alreadyIn = outcomes.filter((o) => o.result.outcome === 'already_checked_in').map((o) => o.session.label)
      // Only the check-ins actually just created here are undoable — never an "already checked
      // in" outcome's existing id, which could belong to an earlier, unrelated action.
      const newCheckInIds = newlyCheckedOutcomes.map((o) => o.result.checkInId).filter((id): id is string => id !== null)

      if (failed.length > 0) {
        setActionError(
          `${student.fullName}: ${failed.map((o) => `${o.session.label}: ${o.result.outcome.replaceAll('_', ' ')}`).join('; ')}.`,
        )
      }
      if (targetSessions.length === 1) {
        if (ok(outcomes[0])) {
          setJustCheckedIn({ message: `${student.fullName} checked in.`, checkInIds: newCheckInIds, undoing: false })
          setSearchQuery('')
        }
      } else if (newlyChecked.length > 0 || alreadyIn.length > 0) {
        const parts = []
        if (newlyChecked.length > 0) parts.push(`checked in to ${newlyChecked.join(' & ')}`)
        if (alreadyIn.length > 0) parts.push(`already in ${alreadyIn.join(' & ')}`)
        setJustCheckedIn({ message: `${student.fullName}: ${parts.join(', ')}.`, checkInIds: newCheckInIds, undoing: false })
        setSearchQuery('')
      }
    } catch {
      setActionError(`Couldn't check in ${student.fullName}. Please try again.`)
    } finally {
      setBusyKey(null)
    }
  }

  // Reverses exactly the check-in(s) the manual action just above created — e.g. a mis-scan the
  // camera actually caught fine but staff then also checked in manually by mistake, or simply the
  // wrong name picked from the search results. No confirmation dialog: unlike undoing some
  // arbitrary row from the full attendance table (a much larger blast radius, further away in time
  // and in the UI from when the mistake happened), this is "undo the thing I just did, right now",
  // the same low-friction pattern as an undo toast.
  async function handleUndoLast() {
    if (!justCheckedIn || justCheckedIn.checkInIds.length === 0) return
    setJustCheckedIn((prev) => (prev ? { ...prev, undoing: true } : prev))
    setActionError(null)
    try {
      await Promise.all(justCheckedIn.checkInIds.map((id) => undoCheckIn(id)))
      setJustCheckedIn(null)
    } catch {
      setActionError("Couldn't undo that check-in. Please try again.")
      setJustCheckedIn((prev) => (prev ? { ...prev, undoing: false } : prev))
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="flex flex-col gap-5 text-left">
        <div className="border-b border-[#eef1f6] pb-4">
          <h2 className="m-0 text-[21px] font-extrabold text-[#1d1d1f]">Check in manually</h2>
          <p className="m-0 mt-2 text-[14px] leading-relaxed text-[#7c8aa0]">
            {session ? (
              <>
                For <span className="font-bold text-[#33415c]">{session.label}</span>. Works even if their pass didn't scan. Recorded
                with an Early/On-time/Late badge based on the actual time.
                {isInviteOnly && ' Only students on this event’s invite list can be checked in here.'}
              </>
            ) : targetSessions.length > 1 ? (
              <>
                For all {targetSessions.length} sessions of this day. Checks a student into each one in a single action, skipping
                any they're already in.
                {isInviteOnly && ' Only students on this event’s invite list can be checked in here.'}
              </>
            ) : (
              'No session is currently active to check students into.'
            )}
          </p>
        </div>

        {targetSessions.length > 0 && (
          <>
            <div className="flex items-center gap-2.5 rounded-[12px] border border-[#e2e6ee] bg-white px-4 py-3.5 text-[#7c8aa0] [transition:border-color_150ms_ease] focus-within:border-[#0d9488]">
              <SearchIcon size={17} />
              <input
                type="text"
                aria-label="Search by name, student ID, or email"
                autoFocus
                disabled={inviteListLoading}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleResultsKeyDown}
                placeholder={inviteListLoading ? 'Loading invite list…' : 'Search by name, student ID, or email...'}
                className="flex-1 border-none text-[15px] text-[#12284a] outline-none disabled:cursor-not-allowed"
                role="combobox"
                aria-expanded={searchResults.length > 0}
                aria-haspopup="listbox"
                aria-controls="manual-checkin-results"
                aria-activedescendant={highlighted >= 0 ? `manual-checkin-option-${highlighted}` : undefined}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="shrink-0 cursor-pointer border-none bg-transparent p-0 text-[#9aa6ba] hover:text-[#56617a]"
                  aria-label="Clear search"
                >
                  <XIcon size={15} />
                </button>
              )}
            </div>

            {actionError && <p className="m-0 text-[13px] font-semibold text-[#d1453d]">{actionError}</p>}
            {justCheckedIn && !searchQuery && (
              <div className="flex items-center justify-between gap-3">
                <p className="m-0 text-[13px] font-semibold text-[#159a56]">{justCheckedIn.message}</p>
                {justCheckedIn.checkInIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleUndoLast()}
                    disabled={justCheckedIn.undoing}
                    className="shrink-0 cursor-pointer border-none bg-transparent p-0 text-[13px] font-bold text-[#d1453d] underline [transition:opacity_150ms_ease] hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {justCheckedIn.undoing ? 'Undoing…' : 'Undo'}
                  </button>
                )}
              </div>
            )}

            {trimmedQuery && (
              <div className="max-h-[360px] overflow-y-auto rounded-[12px] border border-[#eef1f6]">
                {searchLoading ? (
                  <p className="m-0 px-3 py-5 text-center text-sm text-[#9aa6ba]">Searching…</p>
                ) : searchResults.length === 0 ? (
                  <p className="m-0 px-3 py-5 text-center text-sm text-[#9aa6ba]">
                    {isInviteOnly ? 'No invited student matches.' : 'No match.'}
                  </p>
                ) : (
                  <ul id="manual-checkin-results" role="listbox" className="m-0 flex list-none flex-col p-0">
                    {searchResults.map((student, index) => {
                      const busy = busyKey === student.uuid
                      const alreadyCheckedIn = checkedInUuids.has(student.uuid)
                      const isHighlighted = index === highlighted && !alreadyCheckedIn

                      // Two different row shapes, not one button with a conditional label — an
                      // "Already checked in" row's Undo is its own real <button>, and a <button>
                      // can't nest inside another <button> (invalid HTML, breaks keyboard/AT
                      // behavior), so this row has to be a plain container instead of itself being
                      // the clickable element the way an actionable "Check in" row still is.
                      if (alreadyCheckedIn) {
                        return (
                          <li key={student.uuid} className="border-b border-[#f0f2f7] last:border-b-0" role="presentation">
                            <div id={`manual-checkin-option-${index}`} role="option" aria-selected={false} className="flex w-full items-center gap-3.5 px-4 py-3.5">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13.5px] font-extrabold bg-[#d3f1e2] text-[#12a35c]">
                                {getInitials(student.fullName)}
                              </div>
                              <div className="flex min-w-0 flex-1 flex-col">
                                <span className="text-[15px] font-bold text-[#12284a]">{student.fullName}</span>
                                <span className="truncate text-[13px] text-[#9aa6ba]">
                                  {student.id ?? 'ID pending'} &middot; {student.email}
                                </span>
                              </div>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleUndoExisting(student)}
                                aria-label={`Undo ${student.fullName}'s check-in`}
                                title="Checked in already — click to undo"
                                className="inline-flex shrink-0 cursor-pointer items-center rounded-[9px] border border-[#e2e6ee] bg-[#f2f5fa] px-3 py-1.5 text-[12.5px] font-bold whitespace-nowrap text-[#56617a] [transition:background-color_150ms_ease,color_150ms_ease] hover:not-disabled:border-[#f8c9c9] hover:not-disabled:bg-[#fde8e8] hover:not-disabled:text-[#d1453d] focus-visible:outline-2 focus-visible:outline-[#0d9488] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {busy ? 'Undoing…' : 'Already checked in — Undo'}
                              </button>
                            </div>
                          </li>
                        )
                      }

                      return (
                        <li key={student.uuid} className="border-b border-[#f0f2f7] last:border-b-0" role="presentation">
                          <button
                            id={`manual-checkin-option-${index}`}
                            type="button"
                            role="option"
                            aria-selected={isHighlighted}
                            disabled={busy}
                            onClick={() => handleCheckIn(student)}
                            onMouseEnter={() => setHighlighted(index)}
                            style={isHighlighted ? HIGHLIGHT_STYLE : undefined}
                            className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left cursor-pointer [transition:background-color_150ms_ease] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13.5px] font-extrabold ${AVATAR_THEME_CLASSES[getAvatarTheme(student.id ?? student.uuid)]}`}
                            >
                              {getInitials(student.fullName)}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="text-[15px] font-bold" style={isHighlighted ? { color: '#ffffff' } : { color: '#12284a' }}>
                                {student.fullName}
                              </span>
                              <span
                                className="truncate text-[13px]"
                                style={isHighlighted ? { color: 'rgba(255,255,255,0.85)' } : { color: '#9aa6ba' }}
                              >
                                {student.id ?? 'ID pending'} &middot; {student.email}
                              </span>
                            </div>
                            <span
                              className="shrink-0 text-[13px] font-bold"
                              style={isHighlighted ? { color: '#ffffff' } : { color: '#2f6fed' }}
                            >
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
          </>
        )}
      </div>
    </Modal>
  )
}

interface LiveMonitorViewProps {
  event: EventItem
  // ALL sessions/attendance for this event, unfiltered by whatever day/session pill is selected up
  // in the shared nav — the live monitor always focuses on one concrete session (see
  // pickCurrentSession) rather than the broader "whole event"/"whole day" scopes the summary view
  // supports, so it resolves its own scope from the full data rather than reusing the parent's.
  sessions: EventSession[]
  allAttendees: AttendeeRow[]
  attendeesLoading: boolean
  // When the day/session pickers above have exactly one session selected, this pins the monitor to
  // that session instead of auto-detecting whichever one is open right now.
  pinnedSessionId: string | null
  // The full set of session ids in scope — null for "whole event", one id for a single session, or
  // several for a day with more than one session ("All sessions"). Live count and Of invited add up
  // every session in this set, so they always mean "checked in out of expected, for what's picked
  // above" rather than silently falling back to just one session within it.
  scopedSessionIds: string[] | null
  capacity: number | null
  isInviteOnly: boolean
  invitedCount: number | null
  invitees: Student[] | null
  dropped: DroppedEntry[] | null
  onSelectStudent: (student: Student) => void
}

export function LiveMonitorView({
  event,
  sessions,
  allAttendees,
  attendeesLoading,
  pinnedSessionId,
  scopedSessionIds,
  capacity,
  isInviteOnly,
  invitedCount,
  invitees,
  dropped,
  onSelectStudent,
}: LiveMonitorViewProps) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(interval)
  }, [])

  const [manualCheckInOpen, setManualCheckInOpen] = useState(false)

  // A day with more than one session selected ("All sessions"), or — when no day is picked — the
  // whole event once more than one of its own sessions has actually started. Either way, the
  // headline numbers below switch from "checked in to this session" to "common people": only
  // those who attended EVERY session in the combined scope, not everyone who showed up to just
  // one of them. Nobody can have attended a session that hasn't opened yet, so a session that
  // hasn't started doesn't count against anyone for "Whole event".
  const occurredSessions = useMemo(() => sessions.filter((s) => sessionWindowStatus(s, now) !== 'not-started'), [sessions, now])

  // Restricted to the picked scope so "the session running now" means now within that day, not
  // wherever the event happens to be live — otherwise picking Day 2 before its morning session
  // opens could still show Day 1's last session here.
  const candidateSessions = useMemo(
    () => (scopedSessionIds ? sessions.filter((s) => scopedSessionIds.includes(s.id)) : sessions),
    [sessions, scopedSessionIds],
  )
  const autoSession = useMemo(() => pickCurrentSession(candidateSessions, now), [candidateSessions, now])
  const currentSession = pinnedSessionId ? (sessions.find((s) => s.id === pinnedSessionId) ?? autoSession) : autoSession

  const dayDates = useMemo(() => Array.from(new Set(sessions.map((s) => s.date))).sort(), [sessions])
  const dayIndex = currentSession ? dayDates.indexOf(currentSession.date) + 1 : null

  const aggregateScopeSessions = scopedSessionIds ? candidateSessions : occurredSessions
  const isAggregateView = aggregateScopeSessions.length > 1

  const scopeAttendeeRows = useMemo(() => {
    const ids = new Set(aggregateScopeSessions.map((s) => s.id))
    return allAttendees.filter((a) => a.sessionId && ids.has(a.sessionId))
  }, [aggregateScopeSessions, allAttendees])

  // Only students with a check-in in EVERY session of the scope.
  const aggregateScopeSessionIds = useMemo(() => aggregateScopeSessions.map((s) => s.id), [aggregateScopeSessions])

  // "All sessions" picked for one specific day (not "Whole event", which can span many days) —
  // the one case where manual check-in targets every session of the day at once, rather than
  // silently guessing which single one to use.
  const isDayAllSessions = scopedSessionIds !== null && scopedSessionIds.length > 1
  const manualCheckInTargets = isDayAllSessions ? aggregateScopeSessions : currentSession ? [currentSession] : []
  const commonStudentUuids = useMemo(
    () => (isAggregateView ? studentsInEverySession(scopeAttendeeRows, aggregateScopeSessionIds) : new Set<string>()),
    [isAggregateView, scopeAttendeeRows, aggregateScopeSessionIds],
  )

  const sessionAttendees = useMemo(() => {
    if (isAggregateView) return scopeAttendeeRows
    return currentSession ? allAttendees.filter((a) => a.sessionId === currentSession.id) : []
  }, [allAttendees, currentSession, isAggregateView, scopeAttendeeRows])

  const checkedInUuids = useMemo(() => new Set(sessionAttendees.map((a) => a.student.uuid)), [sessionAttendees])

  // The headline number: common people once aggregated, otherwise this session's own attendance
  // (which is already one row per student, so .length is the same thing there).
  const liveCount = isAggregateView ? commonStudentUuids.size : sessionAttendees.length

  const recentCount = useMemo(
    () => sessionAttendees.filter((a) => now.getTime() - new Date(a.checkedInAt).getTime() <= 5 * 60_000).length,
    [sessionAttendees, now],
  )

  const denominator = isInviteOnly ? invitedCount : capacity
  const capacityPercent = denominator && denominator > 0 ? Math.min(100, Math.round((liveCount / denominator) * 100)) : null

  // Early/On-time/Late: a combined person has more than one arrival time, so there's no single
  // status to tag them with. Averaging each session's own count keeps the three numbers meaningful
  // without pretending one status applies to everybody.
  const { early, onTime, late } = useMemo(() => {
    if (!isAggregateView) {
      return {
        early: sessionAttendees.filter((a) => a.status === 'early').length,
        onTime: sessionAttendees.filter((a) => a.status === 'on-time').length,
        late: sessionAttendees.filter((a) => a.status === 'late').length,
      }
    }
    return averageStatusCounts(scopeAttendeeRows, aggregateScopeSessionIds)
  }, [isAggregateView, sessionAttendees, scopeAttendeeRows, aggregateScopeSessionIds])

  const closesInLabel = useMemo(() => {
    if (!currentSession) return '—'
    const opens = new Date(`${currentSession.date}T${currentSession.openTime}`)
    const closes = new Date(`${currentSession.date}T${currentSession.closeTime}`)
    if (currentSession.closeTime < currentSession.openTime) closes.setDate(closes.getDate() + 1)
    if (now < opens) return `Opens in ${formatCountdown(opens.getTime() - now.getTime())}`
    if (now > closes) return 'Closed'
    return formatCountdown(closes.getTime() - now.getTime())
  }, [currentSession, now])

  const recentFeed = useMemo(
    () => [...sessionAttendees].sort((a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime()).slice(0, 5),
    [sessionAttendees],
  )

  // Aggregated, the feed shows one row per common person (their latest check-in among the scoped
  // sessions) instead of every individual scan — matching what the headline number counts.
  const feedItems = useMemo(() => {
    if (!isAggregateView) return recentFeed
    const latestByStudent = new Map<string, AttendeeRow>()
    for (const a of scopeAttendeeRows) {
      if (!commonStudentUuids.has(a.student.uuid)) continue
      const existing = latestByStudent.get(a.student.uuid)
      if (!existing || new Date(a.checkedInAt) > new Date(existing.checkedInAt)) latestByStudent.set(a.student.uuid, a)
    }
    return [...latestByStudent.values()].sort((a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime()).slice(0, 5)
  }, [isAggregateView, recentFeed, scopeAttendeeRows, commonStudentUuids])

  const missingStudents = useMemo(() => {
    if (!isInviteOnly || !invitees) return null
    const attendedAll = isAggregateView ? commonStudentUuids : checkedInUuids
    return invitees.filter((s) => !attendedAll.has(s.uuid))
  }, [isInviteOnly, invitees, isAggregateView, commonStudentUuids, checkedInUuids])

  // Whole event with more than one session already underway needs the full set passed along, not
  // just whichever single one happens to be live right now — otherwise the full attendee list and
  // missing list downstream would be scoped to a different (narrower) set than this page itself.
  const scopeQuery = isAggregateView
    ? `?sessions=${aggregateScopeSessionIds.join(',')}`
    : currentSession
      ? `?sessions=${currentSession.id}`
      : ''
  const attendeeListHref = `/events/${event.id}/analysis/attendees${scopeQuery}`
  const missingListHref = `/events/${event.id}/analysis/missing${scopeQuery}`
  const droppedListHref = `/events/${event.id}/analysis/dropped${scopeQuery}`

  if (attendeesLoading) return <LoadingState label="Loading live check-ins…" />

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Header — event name, Day X of Y · Session, LIVE badge, current time. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 mb-1 text-[26px] font-extrabold max-[701px]:text-[22px]" style={{ color: NAVY }}>
            {event.program}
          </h1>
          <p className="m-0 text-sm text-[#7c8aa0]">
            {!isAggregateView && dayIndex && dayDates.length > 1 ? `Day ${dayIndex} of ${dayDates.length} · ` : ''}
            Session: {isAggregateView ? (scopedSessionIds ? 'All sessions' : 'All sessions so far') : (currentSession?.label ?? '—')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setManualCheckInOpen(true)}
            disabled={manualCheckInTargets.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#ccfbf1] bg-[#f0fdfa] px-3.5 py-1.5 text-[12.5px] font-bold text-[#0d9488] cursor-pointer [transition:background-color_150ms_ease] hover:not-disabled:bg-[#ccfbf1] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PersonPlusIcon size={14} />
            Check in manually
          </button>
          <span className="text-[13px] font-semibold text-[#56617a]">
            {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Four stat cards */}
      <div className="flex flex-wrap gap-[14px]">
        <StatCard
          label={isAggregateView ? 'Attended every session' : 'Live count'}
          value={liveCount}
          sublabel={recentCount > 0 ? `+${recentCount} in the last 5 min` : undefined}
        />
        <StatCard label={isInviteOnly ? 'Of invited' : 'Of capacity'} value={denominator !== null ? `${liveCount} / ${denominator}` : liveCount}>
          {capacityPercent !== null && (
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#eef1f6]">
              <div className="h-full rounded-full" style={{ width: `${capacityPercent}%`, background: ACCENT_AMBER }} />
            </div>
          )}
        </StatCard>
        <div className="flex min-w-[190px] flex-1 flex-col gap-2 rounded-2xl border border-[#eef1f6] bg-white p-5 shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
          <span className="text-[11px] font-bold tracking-[0.6px] text-[#9aa6ba] uppercase">
            Arrival status{isAggregateView ? ' (avg. per session)' : ''}
          </span>
          <div className="flex flex-col gap-1 text-[13px] font-semibold text-[#33415c]">
            <span className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#2f6fed]" /> Early
              </span>
              {early}
            </span>
            <span className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#159a56]" /> On-time
              </span>
              {onTime}
            </span>
            <span className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#c9930f]" /> Late
              </span>
              {late}
            </span>
          </div>
        </div>
        <StatCard label="Session closes in" value={closesInLabel} sublabel={currentSession ? `Closes at ${formatCheckInTime(`${currentSession.date}T${currentSession.closeTime}`)}` : undefined} accent="amber" />
      </div>

      {/* Feed + chart + missing */}
      <div className="grid grid-cols-[1.4fr_1fr] gap-[18px] max-[961px]:grid-cols-1">
        <div className={CARD_CLASSES}>
          <div>
            <h2 className="m-0 flex items-center gap-2 text-[15px] font-extrabold" style={{ color: NAVY }}>
              <span className="h-2 w-2 rounded-full bg-[#159a56]" />
              Live check-in feed
            </h2>
            <p className="m-0 mt-0.5 text-[12.5px] text-[#7c8aa0]">
              {isAggregateView ? "Everyone who's attended every session in view, most recent first." : 'Newest scans appear at the top, updating automatically.'}
            </p>
          </div>

          {feedItems.length === 0 ? (
            <div className="flex items-center justify-center rounded-xl bg-[#f7f9fc] py-10 text-sm text-[#7c8aa0]">
              {isAggregateView ? 'Nobody has attended every session yet.' : 'No check-ins yet.'}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {feedItems.map((attendee, index) => {
                const badge = CHECK_IN_STATUS_BADGE[attendee.status]
                return (
                  <button
                    key={attendee.checkInId}
                    type="button"
                    onClick={() => onSelectStudent(attendee.student)}
                    // record_check_in() records who was signed in (Admin, Staff, or the shared
                    // Kiosk login) for every check-in now, scan or manual — see
                    // schema-checkin-by-always.sql — so this is meaningful for a QR scan too, not
                    // just a manual one.
                    title={attendee.checkedInBy ? `Checked in by ${attendee.checkedInBy}` : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl border-none px-2.5 py-2.5 text-left cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f7f9fc] ${
                      index === 0 ? 'bg-[#f0fdf9]' : 'bg-transparent'
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${AVATAR_THEME_CLASSES[getAvatarTheme(attendee.student.id ?? attendee.student.uuid)]}`}
                    >
                      {getInitials(attendee.student.fullName)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[14px] font-bold text-[#12284a]">{attendee.student.fullName}</span>
                      <span className="truncate text-[12px] text-[#9aa6ba]">
                        {[attendee.student.faculty, attendee.student.program].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {!isAggregateView && (
                      <span
                        className="shrink-0 rounded-full px-2.5 py-[3px] text-[11.5px] font-bold"
                        style={{ background: badge.bg, color: badge.text }}
                      >
                        {badge.label}
                      </span>
                    )}
                    <span className="shrink-0 text-right text-[12px] whitespace-nowrap text-[#9aa6ba]">{formatArrivalTime(attendee.checkedInAt)}</span>
                  </button>
                )
              })}
            </div>
          )}

          <Link
            to={attendeeListHref}
            className="mt-1 inline-flex w-fit items-center gap-1 self-end text-[13px] font-bold no-underline [transition:gap_150ms_ease] hover:gap-1.5"
            style={{ color: ACCENT_TEAL }}
          >
            View full attendee list
            <ChevronRightIcon size={14} />
          </Link>
        </div>

        <div className="flex flex-col gap-[18px]">
          {isInviteOnly ? (
            dropped === null ? (
              <div className={CARD_CLASSES}>
                <LoadingState label="Loading dropped students…" />
              </div>
            ) : (
              <DroppedStudentsCard rows={dropped} listHref={droppedListHref} />
            )
          ) : (
            <div className={CARD_CLASSES}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="m-0 text-[15px] font-extrabold" style={{ color: NAVY }}>
                    Check-ins building up
                  </h2>
                  <p className="m-0 mt-0.5 text-[12.5px] text-[#7c8aa0]">This session, so far</p>
                </div>
                <ClockIcon size={16} />
              </div>
              <CheckInsBuildingUpChart attendees={sessionAttendees} denominator={denominator} />
            </div>
          )}

          {missingStudents !== null && (
            <div className={CARD_CLASSES}>
              <h2 className="m-0 text-[15px] font-extrabold" style={{ color: NAVY }}>
                Not checked in yet
              </h2>
              <span className="text-[28px] leading-[1.1] font-extrabold" style={{ color: NAVY }}>
                {missingStudents.length}
              </span>
              <p className="m-0 text-[12.5px] text-[#7c8aa0]">out of {invitedCount ?? invitees?.length ?? 0} invited</p>
              <Link
                to={missingListHref}
                className="mt-1 inline-flex w-fit items-center gap-1 text-[13px] font-bold no-underline [transition:gap_150ms_ease] hover:gap-1.5"
                style={{ color: ACCENT_TEAL }}
              >
                See who's missing
                <ChevronRightIcon size={14} />
              </Link>
            </div>
          )}
        </div>
      </div>

      <ManualCheckInModal
        open={manualCheckInOpen}
        onClose={() => setManualCheckInOpen(false)}
        eventId={event.id}
        targetSessions={manualCheckInTargets}
        allAttendees={allAttendees}
        isInviteOnly={isInviteOnly}
        invitees={invitees}
      />
    </div>
  )
}
