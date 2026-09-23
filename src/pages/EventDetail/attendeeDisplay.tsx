import type { ReactNode } from 'react'
import { RefreshIcon, SearchIcon } from '../../components/icons/NavIcons'
import { StudentCard } from '../../components/StudentCard/StudentCard'
import { rowActivationProps } from '../../lib/rowActivation'
import type { AttendeeRow } from '../../data/attendanceData'
import { FACULTIES, LEVELS, YEARS } from '../AddStudent/addStudentData'
import { getAvatarTheme, getInitials, STATUS_COLORS, type AvatarTheme, type Student } from '../StudentDirectory/studentDirectoryData'
import {
  CARD_GRID_CLASSES,
  CHECK_IN_STATUS_BADGE,
  EMPTY_STATE_CLASSES,
  FILTER_SELECT_CLASSES,
  formatCheckInTime,
  formatLateBy,
  type StudentFilterState,
} from './attendeeFormatting'

const AVATAR_THEME_CLASSES: Record<AvatarTheme, string> = {
  blue: 'bg-[#d6e7fc] text-[#2f6fed]',
  green: 'bg-[#d3f1e2] text-[#12a35c]',
  teal: 'bg-[#ccfbf1] text-[#0d9488]',
  purple: 'bg-[#e4dbfb] text-[#8b5cf6]',
  amber: 'bg-[#fff3d6] text-[#b3790a]',
  pink: 'bg-[#fde7f1] text-[#d13d82]',
}

// Same filter-bar look as the Student Directory's own (StudentDirectoryPage) — Name/ID search
// plus Faculty/Level/Year selects, with room for one more page-specific select (a check-in status
// for the Full Attendee List, a roster status for Who's Missing) via `extra`, right before Reset.

const RESET_BTN_CLASSES =
  'inline-flex items-center gap-[7px] self-end rounded-[10px] border border-[#ccfbf1] bg-[#e5faf7] px-4 py-[10px] text-[13.5px] font-bold text-[#0d9488] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#ccfbf1] h-[41px]'

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-[150px] flex-col gap-[7px] max-[701px]:min-w-full max-[901px]:min-w-[47%] max-[901px]:flex-1">
      <span className="text-[11px] font-bold tracking-[0.6px] text-[#9aa6ba] uppercase">{label}</span>
      {children}
    </div>
  )
}

export function StudentFilterBar({
  filters,
  onChange,
  onReset,
  extra,
}: {
  filters: StudentFilterState
  onChange: (patch: Partial<StudentFilterState>) => void
  onReset: () => void
  extra?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end gap-3.5 rounded-[18px] bg-white px-[22px] py-5 shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[901px]:gap-3">
      <FilterField label="Student Name">
        <div className="flex min-w-[200px] items-center gap-2 rounded-[10px] border border-[#e2e6ee] bg-white px-3 py-[10px] text-[#7c8aa0] [transition:border-color_150ms_ease] focus-within:border-[#0d9488]">
          <SearchIcon size={16} />
          <input
            type="text"
            aria-label="Search by student name"
            placeholder="Search by student name..."
            value={filters.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="flex-1 border-none text-[13.5px] text-[#12284a] outline-none"
          />
        </div>
      </FilterField>

      <FilterField label="Student ID">
        <div className="flex min-w-[200px] items-center gap-2 rounded-[10px] border border-[#e2e6ee] bg-white px-3 py-[10px] text-[#7c8aa0] [transition:border-color_150ms_ease] focus-within:border-[#0d9488]">
          <SearchIcon size={16} />
          <input
            type="text"
            aria-label="Search by student ID"
            placeholder="Search by student ID..."
            value={filters.studentId}
            onChange={(e) => onChange({ studentId: e.target.value })}
            className="flex-1 border-none text-[13.5px] text-[#12284a] outline-none"
          />
        </div>
      </FilterField>

      <FilterField label="Faculty">
        <select className={FILTER_SELECT_CLASSES} value={filters.faculty} onChange={(e) => onChange({ faculty: e.target.value })}>
          <option value="All">All</option>
          {FACULTIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </FilterField>

      <FilterField label="Program Level">
        <select className={FILTER_SELECT_CLASSES} value={filters.level} onChange={(e) => onChange({ level: e.target.value })}>
          <option value="All">All</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </FilterField>

      <FilterField label="Year">
        <select className={FILTER_SELECT_CLASSES} value={filters.year} onChange={(e) => onChange({ year: e.target.value })}>
          <option value="All">All</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </FilterField>

      {extra}

      <button
        type="button"
        className={`${RESET_BTN_CLASSES} max-[701px]:ml-0 max-[701px]:w-full max-[701px]:justify-center max-[901px]:ml-auto`}
        onClick={onReset}
      >
        <RefreshIcon size={15} />
        Reset
      </button>
    </div>
  )
}

// Shared between EventAnalysisPage (Late Arrivals) and EventAttendeesPage (the full list) so both
// render an attendee exactly the same way — one StudentCard per attendee with a check-in-time line
// and optionally how late.

export function LoadingState({ label }: { label: string }) {
  return (
    <div className={EMPTY_STATE_CLASSES}>
      <p className="m-0 text-sm text-[#7c8aa0]">{label}</p>
    </div>
  )
}

// A neat desktop table, same visual pattern as the Student Directory's table (StudentDirectoryPage)
// — one row per attendee with student/email/faculty/program/level-year columns plus a check-in
// column (time + Early/On-time/Late badge, and a Manual tag when staff-recorded). Meant to be paired
// with AttendeeCardGrid below it, hidden on mobile via the shared max-[701px] breakpoint.
export function AttendeeTable({
  attendees,
  showLateBy,
  onSelect,
}: {
  attendees: AttendeeRow[]
  showLateBy: boolean
  onSelect: (student: Student) => void
}) {
  return (
    <div className="overflow-x-auto rounded-[18px] bg-white shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[701px]:hidden">
      <table className="w-full min-w-[860px] border-collapse">
        <thead>
          <tr>
            <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
              Student
            </th>
            <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
              Email
            </th>
            <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
              Faculty &amp; Program
            </th>
            <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
              Level &amp; Year
            </th>
            <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
              Checked in
            </th>
          </tr>
        </thead>
        <tbody>
          {attendees.map((attendee, index) => {
            const cellBorder = index === attendees.length - 1 ? '' : 'border-b border-[#f2f4f8]'
            const badge = CHECK_IN_STATUS_BADGE[attendee.status]
            return (
              <tr
                key={attendee.student.uuid}
                onClick={() => onSelect(attendee.student)}
                {...rowActivationProps(() => onSelect(attendee.student))}
                className="cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f7f9fc] focus-visible:bg-[#f7f9fc] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0d9488]"
              >
                <td className={`px-[22px] py-4 align-middle ${cellBorder}`}>
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${AVATAR_THEME_CLASSES[getAvatarTheme(attendee.student.id)]}`}
                    >
                      {getInitials(attendee.student.fullName)}
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[13.5px] font-bold whitespace-nowrap text-[#12284a]">{attendee.student.fullName}</span>
                      <span className="text-[12px] font-semibold text-[#9aa6ba]">{attendee.student.id}</span>
                    </div>
                  </div>
                </td>
                <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>{attendee.student.email}</td>
                <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>
                  <div className="font-semibold text-[#12284a]">{attendee.student.faculty}</div>
                  <div className="mt-0.5 text-[12.5px] text-[#9aa6ba]">{attendee.student.program}</div>
                </td>
                <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>
                  <div className="font-semibold text-[#12284a]">{attendee.student.level}</div>
                  <div className="mt-0.5 text-[12.5px] text-[#9aa6ba]">{attendee.student.year}</div>
                </td>
                <td className={`px-[22px] py-4 align-middle ${cellBorder}`}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-semibold whitespace-nowrap text-[#33415c]">{formatCheckInTime(attendee.checkedInAt)}</span>
                    <span
                      className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-bold whitespace-nowrap"
                      style={{ background: badge.bg, color: badge.text }}
                    >
                      {badge.label}
                    </span>
                    {attendee.method === 'manual' && (
                      <span
                        className="inline-flex items-center rounded-full bg-[#eaf2fe] px-2 py-[2px] text-[11px] font-bold whitespace-nowrap text-[#2f6fed]"
                        title={attendee.checkedInBy ? `Checked in manually by ${attendee.checkedInBy}` : 'Checked in manually by staff'}
                      >
                        Manual
                      </span>
                    )}
                    {showLateBy && attendee.eventStartsAt && (
                      <span className="text-[12px] font-bold whitespace-nowrap text-[#a0740f]">{formatLateBy(attendee.checkedInAt, attendee.eventStartsAt)}</span>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// The same desktop-table treatment as AttendeeTable above, but for a plain student roster with no
// check-in of its own to show — used by "Who's Missing" (invited students who haven't checked in)
// where a Student's own directory Status (Active/Alumni/Withdrawn) is the only badge that applies.
export function StudentTable({ students, onSelect }: { students: Student[]; onSelect: (student: Student) => void }) {
  return (
    <div className="overflow-x-auto rounded-[18px] bg-white shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[701px]:hidden">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr>
            <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
              Student
            </th>
            <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
              Email
            </th>
            <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
              Faculty &amp; Program
            </th>
            <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
              Level &amp; Year
            </th>
            <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((student, index) => {
            const cellBorder = index === students.length - 1 ? '' : 'border-b border-[#f2f4f8]'
            const statusColor = STATUS_COLORS[student.status]
            return (
              <tr
                key={student.uuid}
                onClick={() => onSelect(student)}
                {...rowActivationProps(() => onSelect(student))}
                className="cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f7f9fc] focus-visible:bg-[#f7f9fc] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0d9488]"
              >
                <td className={`px-[22px] py-4 align-middle ${cellBorder}`}>
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${AVATAR_THEME_CLASSES[getAvatarTheme(student.id)]}`}
                    >
                      {getInitials(student.fullName)}
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[13.5px] font-bold whitespace-nowrap text-[#12284a]">{student.fullName}</span>
                      <span className="text-[12px] font-semibold text-[#9aa6ba]">{student.id}</span>
                    </div>
                  </div>
                </td>
                <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>{student.email}</td>
                <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>
                  <div className="font-semibold text-[#12284a]">{student.faculty}</div>
                  <div className="mt-0.5 text-[12.5px] text-[#9aa6ba]">{student.program}</div>
                </td>
                <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>
                  <div className="font-semibold text-[#12284a]">{student.level}</div>
                  <div className="mt-0.5 text-[12.5px] text-[#9aa6ba]">{student.year}</div>
                </td>
                <td className={`px-[22px] py-4 align-middle ${cellBorder}`}>
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-bold"
                    style={{ background: statusColor.bg, color: statusColor.text }}
                  >
                    {student.status}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// One student's own StudentCard (the same one the Student Directory uses) plus a check-in-time
// line, and optionally how late. Tapping a card opens the same profile modal the Directory opens,
// via onSelect. Shown only on mobile (max-[701px]) — paired with AttendeeTable above for desktop.
export function AttendeeCardGrid({
  attendees,
  showLateBy,
  onSelect,
  mobileOnly,
}: {
  attendees: AttendeeRow[]
  showLateBy: boolean
  onSelect: (student: Student) => void
  // When paired with AttendeeTable (desktop), the grid should only take over below the table's
  // max-[701px] breakpoint rather than rendering both at once.
  mobileOnly?: boolean
}) {
  return (
    <div className={mobileOnly ? 'hidden max-[701px]:block' : ''}>
      <div className={CARD_GRID_CLASSES}>
        {attendees.map((attendee) => (
          <StudentCard
            key={attendee.student.uuid}
            student={attendee.student}
            onClick={() => onSelect(attendee.student)}
            trailing={
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px]">
                <span className="inline-flex flex-wrap items-center gap-1.5 font-semibold text-[#33415c]">
                  Checked in {formatCheckInTime(attendee.checkedInAt)}
                  {(() => {
                    const badge = CHECK_IN_STATUS_BADGE[attendee.status]
                    return (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-bold"
                        style={{ background: badge.bg, color: badge.text }}
                      >
                        {badge.label}
                      </span>
                    )
                  })()}
                  {attendee.method === 'manual' && (
                    <span
                      className="inline-flex items-center rounded-full bg-[#eaf2fe] px-2 py-[2px] text-[11px] font-bold text-[#2f6fed]"
                      title={attendee.checkedInBy ? `Checked in manually by ${attendee.checkedInBy}` : 'Checked in manually by staff'}
                    >
                      Manual
                    </span>
                  )}
                </span>
                {showLateBy && attendee.eventStartsAt && (
                  <span className="font-bold text-[#a0740f]">{formatLateBy(attendee.checkedInAt, attendee.eventStartsAt)}</span>
                )}
              </div>
            }
          />
        ))}
      </div>
    </div>
  )
}
