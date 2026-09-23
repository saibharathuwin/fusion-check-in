import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRightIcon, DownloadIcon } from '../../components/icons/NavIcons'
import type { AttendeeRow } from '../../data/attendanceData'
import type { EventSession } from '../../data/sessionsData'
import type { EventItem } from '../Events/eventsData'
import type { Student } from '../StudentDirectory/studentDirectoryData'
import { LoadingState } from './attendeeDisplay'

const NAVY = '#0e1c3a'
const ACCENT_TEAL = '#0f766e'
const ACCENT_AMBER = '#eaa421'

const CARD_CLASSES = 'flex flex-col gap-4 rounded-2xl border border-[#eef1f6] bg-white p-6 shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[641px]:p-5'

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
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

function buildAttendanceCsv(rows: AttendeeRow[]): string {
  const header = ['Name', 'Student Number', 'Email', 'Faculty', 'Program', 'Status', 'Checked In', 'Method']
  const lines = rows.map((r) =>
    [
      r.student.fullName,
      r.student.id,
      r.student.email,
      r.student.faculty,
      r.student.program,
      r.status,
      new Date(r.checkedInAt).toLocaleString('en-US'),
      r.method === 'qr' ? 'QR scan' : 'Manual',
    ]
      .map((v) => csvEscape(String(v)))
      .join(','),
  )
  return [header.map(csvEscape).join(','), ...lines].join('\n')
}

function StatCard({ label, value, sublabel }: { label: string; value: React.ReactNode; sublabel?: string }) {
  return (
    <div className="flex min-w-[190px] flex-1 flex-col gap-1.5 rounded-2xl border border-[#eef1f6] bg-white p-5 shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
      <span className="text-[11px] font-bold tracking-[0.6px] text-[#9aa6ba] uppercase">{label}</span>
      <span className="text-[26px] leading-[1.1] font-extrabold" style={{ color: NAVY }}>
        {value}
      </span>
      {sublabel && <span className="text-[12px] font-semibold text-[#7c8aa0]">{sublabel}</span>}
    </div>
  )
}

// A "group" is whichever unit the bars compare — a day for a multi-day event, or an individual
// session for a single-day event with more than one session (see groupStats below). `key` is
// whatever uniquely identifies that unit (a date, or a session id) — never shown, just used to
// match the highlighted "best" bar.
interface GroupStat {
  label: string
  key: string
  count: number
  pct: number | null
}

// One bar per group — the bar for whichever group had the highest attendance % is picked out in
// amber so the best/worst one reads at a glance, matching the "Best day"/"Best session" callout in
// the Final Attendance card above it.
function AttendanceBarChart({ stats, bestKey }: { stats: GroupStat[]; bestKey: string | null }) {
  const maxPct = Math.max(10, ...stats.map((d) => d.pct ?? 0))
  return (
    <div className="flex items-end gap-4 overflow-x-auto pt-6 pb-1">
      {stats.map((group) => {
        const heightPct = group.pct !== null ? Math.max(4, (group.pct / maxPct) * 100) : 4
        const isBest = group.key === bestKey
        return (
          <div key={group.key} className="flex min-w-[64px] flex-1 flex-col items-center gap-2">
            <span className="text-[12.5px] font-bold" style={{ color: isBest ? '#a0740f' : '#56617a' }}>
              {group.pct !== null ? `${group.pct}%` : '—'}
            </span>
            <div className="flex h-[140px] w-full items-end rounded-t-lg bg-[#f5f8fc]">
              <div
                className="w-full rounded-t-lg"
                style={{ height: `${heightPct}%`, background: isBest ? ACCENT_AMBER : ACCENT_TEAL }}
              />
            </div>
            <span className={`text-[12.5px] ${isBest ? 'font-extrabold' : 'font-semibold'}`} style={{ color: isBest ? NAVY : '#7c8aa0' }}>
              {group.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function AttendanceByFacultyChart({ attendees }: { attendees: AttendeeRow[] }) {
  const counts = useMemo(() => {
    // One student can appear once per day they attended — deduped by student here so a student who
    // came all 5 days isn't counted as 5 separate people in their faculty's bar when "Whole event"
    // is selected (a single day's own scope has no duplicates to begin with, since a student can't
    // check into the same session twice).
    const map = new Map<string, Set<string>>()
    attendees.forEach((a) => {
      const set = map.get(a.student.faculty) ?? new Set<string>()
      set.add(a.student.uuid)
      map.set(a.student.faculty, set)
    })
    return Array.from(map.entries())
      .map(([faculty, uuids]) => [faculty, uuids.size] as const)
      .sort((a, b) => b[1] - a[1])
  }, [attendees])

  if (counts.length === 0) {
    return <p className="m-0 text-sm text-[#7c8aa0]">No check-ins to break down yet.</p>
  }

  const maxCount = counts[0][1]

  return (
    <div className="flex flex-col gap-4">
      {counts.map(([faculty, count]) => (
        <div key={faculty} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3 text-[13px] font-semibold text-[#33415c]">
            <span className="truncate">{faculty}</span>
            <span className="shrink-0 font-bold" style={{ color: NAVY }}>
              {count}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#eef1f6]">
            <div className="h-full rounded-full" style={{ width: `${(count / maxCount) * 100}%`, background: ACCENT_TEAL }} />
          </div>
        </div>
      ))}
    </div>
  )
}

interface CompletedReportViewProps {
  event: EventItem
  days: { date: string; label: string; sessions: EventSession[] }[]
  allAttendees: AttendeeRow[]
  attendees: AttendeeRow[]
  attendeesLoading: boolean
  capacity: number | null
  isInviteOnly: boolean
  invitedCount: number | null
  invitees: Student[] | null
  attendeeListHref: string
}

export function CompletedReportView({
  event,
  days,
  allAttendees,
  attendees,
  attendeesLoading,
  capacity,
  isInviteOnly,
  invitedCount,
  invitees,
  attendeeListHref,
}: CompletedReportViewProps) {
  const denominator = isInviteOnly ? invitedCount : capacity

  // Always whole-event, regardless of the day/session pills above — these compare across days (or
  // sessions), so narrowing to one would make the comparison meaningless.
  const dayStats = useMemo<GroupStat[]>(
    () =>
      days.map((day) => {
        const sessionIds = new Set(day.sessions.map((s) => s.id))
        const count = allAttendees.filter((a) => a.sessionId && sessionIds.has(a.sessionId)).length
        const pct = denominator && denominator > 0 ? Math.round((count / denominator) * 100) : null
        return { label: day.label, key: day.date, count, pct }
      }),
    [days, allAttendees, denominator],
  )

  // A single-day event has nothing to compare across days — but if that one day has more than one
  // session, comparing sessions instead is just as useful (and otherwise that card would sit empty
  // for the very common case of a single-day, multi-session event).
  const singleDayMultiSession = days.length === 1 && days[0].sessions.length > 1
  const sessionStats = useMemo<GroupStat[]>(() => {
    if (!singleDayMultiSession) return []
    return days[0].sessions.map((session) => {
      const count = allAttendees.filter((a) => a.sessionId === session.id).length
      const pct = denominator && denominator > 0 ? Math.round((count / denominator) * 100) : null
      return { label: session.label, key: session.id, count, pct }
    })
  }, [singleDayMultiSession, days, allAttendees, denominator])

  const groupKind: 'day' | 'session' | null = days.length > 1 ? 'day' : singleDayMultiSession ? 'session' : null
  const groupStats = useMemo(
    () => (groupKind === 'day' ? dayStats : groupKind === 'session' ? sessionStats : []),
    [groupKind, dayStats, sessionStats],
  )
  const bestGroup = useMemo(
    () => groupStats.reduce<GroupStat | null>((best, g) => (g.pct !== null && (!best || g.pct > (best.pct ?? -1)) ? g : best), null),
    [groupStats],
  )

  // Unique students, not raw check-in rows — a student who attended all 5 days of a multi-day
  // event has 5 rows in `attendees` when "Whole event" is selected, and counting rows would put
  // attendance well over 100%. A single day's own scope has no duplicates to begin with (a student
  // can't check into the same session twice), so this only matters for the whole-event scope.
  const uniqueAttendeeCount = useMemo(() => new Set(attendees.map((a) => a.student.uuid)).size, [attendees])
  const finalAttendancePct = denominator && denominator > 0 ? Math.round((uniqueAttendeeCount / denominator) * 100) : null

  // "Never checked in, any day" — whole-event, not scoped to the current day/session pill, since a
  // no-show is about missing the whole event, not just whichever day happens to be selected.
  const noShowCount = useMemo(() => {
    if (!isInviteOnly || !invitees) return null
    const everCheckedInUuids = new Set(allAttendees.map((a) => a.student.uuid))
    return invitees.filter((s) => !everCheckedInUuids.has(s.uuid)).length
  }, [isInviteOnly, invitees, allAttendees])

  const early = attendees.filter((a) => a.status === 'early').length
  const onTime = attendees.filter((a) => a.status === 'on-time').length
  const late = attendees.filter((a) => a.status === 'late').length

  function handleExportCsv() {
    const filename = `${event.program.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-attendance.csv`
    downloadCsv(filename, buildAttendanceCsv(attendees))
  }

  if (attendeesLoading) return <LoadingState label="Loading attendance…" />

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Header — event name, date range, calm "Completed" badge, Export CSV. No pulsing/urgent
          colors anywhere on this view — the event is already over. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 mb-1 text-[26px] font-extrabold max-[701px]:text-[22px]" style={{ color: NAVY }}>
            {event.program}
          </h1>
          <p className="m-0 text-sm text-[#7c8aa0]">
            {days.length > 1 ? `${days.length}-day event · ` : ''}
            {event.dateLabel}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f2f5fa] px-3 py-1.5 text-[12px] font-bold text-[#56617a]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            COMPLETED
          </span>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e2e6ee] bg-white px-4 py-2 text-[13px] font-bold text-[#56617a] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f2f5fa]"
          >
            <DownloadIcon size={15} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Four summary cards */}
      <div className="flex flex-wrap gap-[14px]">
        <StatCard
          label={isInviteOnly ? 'Total students' : event.registrationType === 'Open' ? 'Total students' : 'Capacity'}
          value={denominator ?? '—'}
          sublabel={isInviteOnly ? 'invited across the event' : undefined}
        />
        <StatCard
          label="Final attendance"
          value={finalAttendancePct !== null ? `${finalAttendancePct}%` : '—'}
          sublabel={bestGroup ? `Best ${groupKind}: ${bestGroup.label} (${bestGroup.pct}%)` : undefined}
        />
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
        {noShowCount !== null && <StatCard label="No-shows" value={noShowCount} sublabel="never checked in, any day" />}
      </div>

      {/* Attendance by day + by faculty */}
      <div className="grid grid-cols-[1.4fr_1fr] gap-[18px] max-[961px]:grid-cols-1">
        <div className={CARD_CLASSES}>
          <div>
            <h2 className="m-0 text-[15px] font-extrabold" style={{ color: NAVY }}>
              {groupKind === 'session' ? 'Attendance by session' : 'Attendance by day'}
            </h2>
            <p className="m-0 mt-0.5 text-[12.5px] text-[#7c8aa0]">
              {groupKind === 'session' ? 'Checked in vs invited, each session of the event' : 'Checked in vs invited, each day of the event'}
            </p>
          </div>
          {groupKind ? (
            <AttendanceBarChart stats={groupStats} bestKey={bestGroup?.key ?? null} />
          ) : (
            <p className="m-0 text-sm text-[#7c8aa0]">This event has a single check-in session — nothing to compare.</p>
          )}
        </div>

        <div className="flex flex-col gap-[18px]">
          <div className={CARD_CLASSES}>
            <h2 className="m-0 text-[15px] font-extrabold" style={{ color: NAVY }}>
              Attendance by faculty
            </h2>
            <AttendanceByFacultyChart attendees={attendees} />
          </div>
        </div>
      </div>

      {/* Full attendee list, one click away rather than embedded on this report */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#ccfbf1] bg-[#f0fdf9] p-6">
        <div>
          <h2 className="m-0 text-[15px] font-extrabold" style={{ color: NAVY }}>
            Need the individual records?
          </h2>
          <p className="m-0 mt-0.5 text-[12.5px] text-[#56617a]">See who attended each session, arrival times, and status for every student.</p>
        </div>
        <Link
          to={attendeeListHref}
          className="inline-flex w-fit shrink-0 items-center gap-1 text-[13.5px] font-bold no-underline [transition:gap_150ms_ease] hover:gap-1.5"
          style={{ color: ACCENT_TEAL }}
        >
          Open full attendee list
          <ChevronRightIcon size={15} />
        </Link>
      </div>
    </div>
  )
}
