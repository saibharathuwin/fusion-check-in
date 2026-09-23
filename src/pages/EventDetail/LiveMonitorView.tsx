import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronRightIcon, ClockIcon, PersonPlusIcon, SearchIcon, XIcon } from '../../components/icons/NavIcons'
import { Modal } from '../../components/Modal/Modal'
import { recordCheckIn, type AttendeeRow } from '../../data/attendanceData'
import { sessionWindowStatus, type EventSession } from '../../data/sessionsData'
import type { EventItem } from '../Events/eventsData'
import { getAvatarTheme, getInitials, searchStudents, type AvatarTheme, type Student } from '../StudentDirectory/studentDirectoryData'
import { CHECK_IN_STATUS_BADGE, formatCheckInTime } from './attendeeFormatting'
import { LoadingState } from './attendeeDisplay'

const ACCENT_TEAL = '#0f766e'
const ACCENT_AMBER = '#eaa421'
const NAVY = '#0e1c3a'

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
  const open = sessions.find((s) => sessionWindowStatus(s, now) === 'open')
  if (open) return open
  const closed = sessions.filter((s) => sessionWindowStatus(s, now) === 'closed')
  if (closed.length > 0) return closed[closed.length - 1]
  return sessions[0]
}

function formatTimeAgo(checkedInAt: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(checkedInAt).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
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
        No check-ins yet this session — this fills in as people scan in.
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
  session,
  checkedInUuids,
  isInviteOnly,
  invitees,
}: {
  open: boolean
  onClose: () => void
  eventId: string
  session: EventSession | null
  checkedInUuids: Set<string>
  // Invite-only events restrict who can even be searched here to the invite list — otherwise the
  // search would surface every student in the database, most of whom aren't eligible for this
  // event at all. Open/Limited events have no such roster, so search stays unrestricted for them.
  isInviteOnly: boolean
  invitees: Student[] | null
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchData, setSearchData] = useState<{ query: string; results: Student[] } | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [justCheckedIn, setJustCheckedIn] = useState<string | null>(null)

  // Reset the panel's own state whenever it opens (or the focused session changes while open) —
  // adjusted during render rather than in an effect, so there's no extra render between the modal
  // opening and its fields being cleared.
  const [resetKey, setResetKey] = useState<string>(`${open}:${session?.id ?? ''}`)
  const currentResetKey = `${open}:${session?.id ?? ''}`
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
  // Only meaningfully "loading" once the invite list itself is in — until then there's nothing
  // correct to show for an Invite-only event, so the search box stays disabled instead.
  const inviteListLoading = isInviteOnly && invitees === null

  const inviteeUuids = useMemo(() => (invitees ? new Set(invitees.map((s) => s.uuid)) : null), [invitees])

  useEffect(() => {
    if (!open || !trimmedQuery || inviteListLoading) return
    searchStudents(trimmedQuery).then((found) => {
      const eligible = isInviteOnly && inviteeUuids ? found.filter((s) => inviteeUuids.has(s.uuid)) : found
      setSearchData({ query: trimmedQuery, results: eligible.filter((s) => !checkedInUuids.has(s.uuid)) })
    })
  }, [open, trimmedQuery, checkedInUuids, isInviteOnly, inviteeUuids, inviteListLoading])

  async function handleCheckIn(student: Student) {
    if (!session) return
    setActionError(null)
    setBusyKey(student.uuid)
    try {
      const result = await recordCheckIn({ eventId, sessionId: session.id, studentUuid: student.uuid, method: 'manual' })
      if (result.outcome !== 'checked_in' && result.outcome !== 'already_checked_in') {
        setActionError(`Couldn't check in ${student.fullName}: ${result.outcome.replaceAll('_', ' ')}.`)
      } else {
        setJustCheckedIn(student.fullName)
        setSearchQuery('')
      }
    } catch {
      setActionError(`Couldn't check in ${student.fullName}. Please try again.`)
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="flex flex-col gap-5 text-left">
        <div className="border-b border-[#eef1f6] pb-4">
          <h2 className="m-0 text-[21px] font-extrabold text-[#12284a]">Check in manually</h2>
          <p className="m-0 mt-2 text-[14px] leading-relaxed text-[#7c8aa0]">
            {session ? (
              <>
                For <span className="font-bold text-[#33415c]">{session.label}</span> — works even if their pass didn't scan. Recorded
                with an Early/On-time/Late badge based on the actual time.
                {isInviteOnly && ' Only students on this event’s invite list can be checked in here.'}
              </>
            ) : (
              'No session is currently active to check students into.'
            )}
          </p>
        </div>

        {session && (
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
                placeholder={inviteListLoading ? 'Loading invite list…' : 'Search by name, student ID, or email...'}
                className="flex-1 border-none text-[15px] text-[#12284a] outline-none disabled:cursor-not-allowed"
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
            {justCheckedIn && !searchQuery && <p className="m-0 text-[13px] font-semibold text-[#159a56]">{justCheckedIn} checked in.</p>}

            {trimmedQuery && (
              <div className="max-h-[360px] overflow-y-auto rounded-[12px] border border-[#eef1f6]">
                {searchLoading ? (
                  <p className="m-0 px-3 py-5 text-center text-sm text-[#9aa6ba]">Searching…</p>
                ) : searchResults.length === 0 ? (
                  <p className="m-0 px-3 py-5 text-center text-sm text-[#9aa6ba]">
                    {isInviteOnly ? 'No invited student matches, or already checked in.' : 'No match, or already checked in.'}
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
                            onClick={() => handleCheckIn(student)}
                            className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left cursor-pointer [transition:background-color_150ms_ease] hover:not-disabled:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13.5px] font-extrabold ${AVATAR_THEME_CLASSES[getAvatarTheme(student.id)]}`}
                            >
                              {getInitials(student.fullName)}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="text-[15px] font-bold text-[#12284a]">{student.fullName}</span>
                              <span className="truncate text-[13px] text-[#9aa6ba]">
                                {student.id} &middot; {student.email}
                              </span>
                            </div>
                            <span className="shrink-0 text-[13px] font-bold text-[#2f6fed]">{busy ? 'Checking in…' : 'Check in'}</span>
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
  // When the day/session pills above have exactly one session selected, this pins the monitor to
  // that session instead of auto-detecting whichever one is open right now.
  pinnedSessionId: string | null
  capacity: number | null
  isInviteOnly: boolean
  invitedCount: number | null
  invitees: Student[] | null
  onSelectStudent: (student: Student) => void
}

export function LiveMonitorView({
  event,
  sessions,
  allAttendees,
  attendeesLoading,
  pinnedSessionId,
  capacity,
  isInviteOnly,
  invitedCount,
  invitees,
  onSelectStudent,
}: LiveMonitorViewProps) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(interval)
  }, [])

  const [manualCheckInOpen, setManualCheckInOpen] = useState(false)

  const autoSession = useMemo(() => pickCurrentSession(sessions, now), [sessions, now])
  const currentSession = pinnedSessionId ? (sessions.find((s) => s.id === pinnedSessionId) ?? autoSession) : autoSession

  const dayDates = useMemo(() => Array.from(new Set(sessions.map((s) => s.date))).sort(), [sessions])
  const dayIndex = currentSession ? dayDates.indexOf(currentSession.date) + 1 : null

  const sessionAttendees = useMemo(
    () => (currentSession ? allAttendees.filter((a) => a.sessionId === currentSession.id) : []),
    [allAttendees, currentSession],
  )

  const checkedInUuids = useMemo(() => new Set(sessionAttendees.map((a) => a.student.uuid)), [sessionAttendees])

  const recentCount = useMemo(
    () => sessionAttendees.filter((a) => now.getTime() - new Date(a.checkedInAt).getTime() <= 5 * 60_000).length,
    [sessionAttendees, now],
  )

  const denominator = isInviteOnly ? invitedCount : capacity
  const capacityPercent = denominator && denominator > 0 ? Math.min(100, Math.round((sessionAttendees.length / denominator) * 100)) : null

  const early = sessionAttendees.filter((a) => a.status === 'early').length
  const onTime = sessionAttendees.filter((a) => a.status === 'on-time').length
  const late = sessionAttendees.filter((a) => a.status === 'late').length

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

  const missingStudents = useMemo(() => {
    if (!isInviteOnly || !invitees) return null
    const checkedInUuids = new Set(sessionAttendees.map((a) => a.student.uuid))
    return invitees.filter((s) => !checkedInUuids.has(s.uuid))
  }, [isInviteOnly, invitees, sessionAttendees])

  const scopeQuery = currentSession ? `?sessions=${currentSession.id}` : ''
  const attendeeListHref = `/events/${event.id}/analysis/attendees${scopeQuery}`
  const missingListHref = `/events/${event.id}/analysis/missing${scopeQuery}`

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
            {dayIndex && dayDates.length > 1 ? `Day ${dayIndex} of ${dayDates.length} · ` : ''}
            Session: {currentSession?.label ?? '—'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setManualCheckInOpen(true)}
            disabled={!currentSession}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#ccfbf1] bg-[#f0fdfa] px-3.5 py-1.5 text-[12.5px] font-bold text-[#0d9488] cursor-pointer [transition:background-color_150ms_ease] hover:not-disabled:bg-[#ccfbf1] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PersonPlusIcon size={14} />
            Check in manually
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fde8e8] px-3 py-1.5 text-[12px] font-bold text-[#d1453d]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#d1453d] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#d1453d]" />
            </span>
            LIVE
          </span>
          <span className="text-[13px] font-semibold text-[#56617a]">
            {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Four stat cards */}
      <div className="flex flex-wrap gap-[14px]">
        <StatCard label="Live count" value={sessionAttendees.length} sublabel={recentCount > 0 ? `+${recentCount} in the last 5 min` : undefined} />
        <StatCard
          label={isInviteOnly ? 'Of invited' : 'Of capacity'}
          value={denominator !== null ? `${sessionAttendees.length} / ${denominator}` : sessionAttendees.length}
        >
          {capacityPercent !== null && (
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#eef1f6]">
              <div className="h-full rounded-full" style={{ width: `${capacityPercent}%`, background: ACCENT_AMBER }} />
            </div>
          )}
        </StatCard>
        <div className="flex min-w-[190px] flex-1 flex-col gap-2 rounded-2xl border border-[#eef1f6] bg-white p-5 shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
          <span className="text-[11px] font-bold tracking-[0.6px] text-[#9aa6ba] uppercase">Arrival status</span>
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
            <p className="m-0 mt-0.5 text-[12.5px] text-[#7c8aa0]">Newest scans appear at the top, updating automatically.</p>
          </div>

          {recentFeed.length === 0 ? (
            <div className="flex items-center justify-center rounded-xl bg-[#f7f9fc] py-10 text-sm text-[#7c8aa0]">No check-ins yet.</div>
          ) : (
            <div className="flex flex-col gap-1">
              {recentFeed.map((attendee, index) => {
                const badge = CHECK_IN_STATUS_BADGE[attendee.status]
                return (
                  <button
                    key={attendee.checkInId}
                    type="button"
                    onClick={() => onSelectStudent(attendee.student)}
                    className={`flex w-full items-center gap-3 rounded-xl border-none px-2.5 py-2.5 text-left cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f7f9fc] ${
                      index === 0 ? 'bg-[#f0fdf9]' : 'bg-transparent'
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${AVATAR_THEME_CLASSES[getAvatarTheme(attendee.student.id)]}`}
                    >
                      {getInitials(attendee.student.fullName)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[14px] font-bold text-[#12284a]">{attendee.student.fullName}</span>
                      <span className="truncate text-[12px] text-[#9aa6ba]">
                        {attendee.student.faculty} · {attendee.student.program}
                      </span>
                    </span>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-[3px] text-[11.5px] font-bold"
                      style={{ background: badge.bg, color: badge.text }}
                    >
                      {badge.label}
                    </span>
                    <span className="w-14 shrink-0 text-right text-[12px] text-[#9aa6ba]">{formatTimeAgo(attendee.checkedInAt, now)}</span>
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
        session={currentSession}
        checkedInUuids={checkedInUuids}
        isInviteOnly={isInviteOnly}
        invitees={invitees}
      />
    </div>
  )
}
