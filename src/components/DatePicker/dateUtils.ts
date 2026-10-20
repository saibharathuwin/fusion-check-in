// Single source of truth for converting between this app's stored date format (ISO "YYYY-MM-DD",
// matching what a native <input type="date"> has always produced) and the calendar grids/typed
// text DatePicker shows and accepts. Mirrors timeUtils.ts's role for TimePicker.

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
export const MONTH_SHORT_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const WEEKDAY_SHORT_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// A plain {year, month (0-11), day} triple parsed straight out of the components, rather than a
// real Date — avoids every date-math bug that comes from a Date object silently carrying a time
// zone and hours/minutes nobody asked for. All the grid/navigation math below works in this space.
export interface DateParts {
  year: number
  month: number // 0-11
  day: number
}

export function isoToParts(iso: string): DateParts | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  if (month < 0 || month > 11 || day < 1 || day > 31) return null
  return { year, month, day }
}

export function partsToIso({ year, month, day }: DateParts): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`
}

export function todayParts(): DateParts {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() }
}

// Number of real days in a given month (handles leap years via JS's own month-rollover behavior:
// "day 0 of the next month" is the last day of this one).
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

// 24h "HH:MM"-style clean value -> "Jun 22, 2021", for the text input's display when not focused.
export function formatDateDisplay(iso: string): string {
  const parts = isoToParts(iso)
  if (!parts) return iso
  return `${MONTH_SHORT_NAMES[parts.month]} ${parts.day}, ${parts.year}`
}

// Parses free-typed text into a strict ISO "YYYY-MM-DD" value. Accepts the display format ("Jun
// 22, 2021"), a plain "6/22/2021" or "06-22-2021", or an already-ISO "2021-06-22". Returns null
// for anything it can't confidently resolve, so the caller can fall back to the last known-good
// value instead of silently storing a guess (same contract as timeUtils.ts's parseTimeInput).
export function parseDateInput(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) {
    const year = Number(iso[1])
    const month = Number(iso[2]) - 1
    const day = Number(iso[3])
    if (month < 0 || month > 11) return null
    if (day < 1 || day > daysInMonth(year, month)) return null
    return partsToIso({ year, month, day })
  }

  const slashOrDash = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (slashOrDash) {
    const month = Number(slashOrDash[1]) - 1
    const day = Number(slashOrDash[2])
    const year = Number(slashOrDash[3])
    if (month < 0 || month > 11) return null
    if (day < 1 || day > daysInMonth(year, month)) return null
    return partsToIso({ year, month, day })
  }

  const named = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/)
  if (named) {
    const monthIndex = MONTH_NAMES.findIndex((m) => m.toLowerCase().startsWith(named[1].toLowerCase()))
    if (monthIndex === -1) return null
    const day = Number(named[2])
    const year = Number(named[3])
    if (day < 1 || day > daysInMonth(year, monthIndex)) return null
    return partsToIso({ year, month: monthIndex, day })
  }

  return null
}

// The 42-cell (6-week) grid Month view renders — includes the tail end of the previous month and
// the start of the next so every week row is always full, each cell flagged with whether it
// actually belongs to the requested month (rendered muted, but still clickable/selectable — the
// common "jump to that month" convenience every calendar widget offers).
export interface MonthGridCell extends DateParts {
  inCurrentMonth: boolean
}

export function getMonthGrid(year: number, month: number): MonthGridCell[] {
  const firstWeekday = new Date(year, month, 1).getDay() // 0 = Sunday
  const totalDays = daysInMonth(year, month)
  const prevMonth = month === 0 ? 11 : month - 1
  const prevYear = month === 0 ? year - 1 : year
  const prevMonthDays = daysInMonth(prevYear, prevMonth)

  const cells: MonthGridCell[] = []

  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ year: prevYear, month: prevMonth, day: prevMonthDays - i, inCurrentMonth: false })
  }
  for (let day = 1; day <= totalDays; day++) {
    cells.push({ year, month, day, inCurrentMonth: true })
  }
  const nextMonth = month === 11 ? 0 : month + 1
  const nextYear = month === 11 ? year + 1 : year
  let nextDay = 1
  while (cells.length < 42) {
    cells.push({ year: nextYear, month: nextMonth, day: nextDay, inCurrentMonth: false })
    nextDay++
  }

  return cells
}

export function compareDateParts(a: DateParts, b: DateParts): number {
  if (a.year !== b.year) return a.year - b.year
  if (a.month !== b.month) return a.month - b.month
  return a.day - b.day
}

export function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month))
}

// The decade-aligned start year for Decade view (2021 -> 2020) — the view then shows this year
// through the one 10 years later, plus a muted cell on either side (the adjacent decade), 12 cells
// total, the same convention most Material-style date pickers use for their decade grid.
export function decadeStart(year: number): number {
  return Math.floor(year / 10) * 10
}
