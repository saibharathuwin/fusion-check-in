import type { CheckInStatus } from '../../data/attendanceData'

// Shared formatting/constants for attendee display — split from attendeeDisplay.tsx (which holds
// the actual components) since a file mixing component and non-component exports breaks Fast
// Refresh.

export function formatCheckInTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// "how late" relative to the event's own scheduled start time (not the check-in window) — rounds
// to the nearest minute and floors at 1, since a checked_in_at that lands in the same instant as
// eventStartsAt still counts as late by this page's definition (see fetchEventAttendance's status).
export function formatLateBy(checkedInAt: string, eventStartsAt: string): string {
  const minutes = Math.max(1, Math.round((new Date(checkedInAt).getTime() - new Date(eventStartsAt).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min late`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder === 0 ? `${hours}h late` : `${hours}h ${remainder}m late`
}

export const CHECK_IN_STATUS_BADGE: Record<CheckInStatus, { label: string; bg: string; text: string }> = {
  early: { label: 'Early', bg: '#eaf2fe', text: '#2f6fed' },
  'on-time': { label: 'On-time', bg: '#e1f8ec', text: '#159a56' },
  late: { label: 'Late', bg: '#fff8e1', text: '#a0740f' },
}

// auto-fill + a 300px minimum reflows into a multi-column grid on wide screens and collapses to a
// single column once the viewport can't fit a second card — no manual breakpoints needed.
export const CARD_GRID_CLASSES = 'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4'

export const EMPTY_STATE_CLASSES =
  'flex flex-col items-center gap-2 rounded-[18px] bg-white px-5 py-[60px] text-center shadow-[0_2px_10px_rgba(15,40,74,0.05)]'

// Shared filter state for the Full Attendee List / Who's Missing filter bars (see StudentFilterBar
// in attendeeDisplay.tsx) — the Name/ID/Faculty/Level/Year fields both pages have in common.
export interface StudentFilterState {
  name: string
  studentId: string
  faculty: string
  level: string
  year: string
}

export const EMPTY_STUDENT_FILTERS: StudentFilterState = { name: '', studentId: '', faculty: 'All', level: 'All', year: 'All' }

export const FILTER_SELECT_CLASSES =
  'w-full rounded-[10px] border border-[#e2e6ee] bg-white px-3 py-[10px] text-[13.5px] font-semibold text-[#12284a] cursor-pointer [transition:border-color_150ms_ease] hover:border-[#c7d0e0] focus:border-[#0d9488] focus:outline-none'
