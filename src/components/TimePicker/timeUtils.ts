// Single source of truth for converting between this app's stored time format (24-hour "HH:MM",
// matching what a native <input type="time"> has always produced) and the 12-hour AM/PM text
// TimePicker shows and accepts. Getting the noon/midnight edge exactly right here is the whole
// point of this file — 12 AM is hour 0, 12 PM is hour 12, and every other hour just adds/subtracts
// 12 depending on which side of noon it's on.

// 24h "HH:MM" -> "10:37 PM" / "12:00 PM" / "12:00 AM" for display.
export function formatTime12h(value: string): string {
  const [hStr, mStr] = value.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

// Parses free-typed text — "10:37 PM", "10:37pm", "10 pm", or a bare 24h-style "22:37" — into a
// strict 24h "HH:MM" value. Returns null for anything it can't confidently resolve, so the caller
// can fall back to the last known-good value instead of silently storing a guess.
export function parseTimeInput(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\./g, '')
  if (!s) return null

  const match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
  if (!match) return null

  let hour = Number(match[1])
  const minute = match[2] ? Number(match[2]) : 0
  const meridiem = match[3]

  if (minute < 0 || minute > 59) return null

  if (meridiem) {
    // 12-hour input: hour must be 1-12. 12 AM is midnight (hour 0); every other AM hour is
    // itself. 12 PM is noon (hour 12, unchanged); every other PM hour adds 12.
    if (hour < 1 || hour > 12) return null
    if (meridiem === 'am') hour = hour === 12 ? 0 : hour
    else hour = hour === 12 ? 12 : hour + 12
  } else {
    // No AM/PM given — only accepted if it's already an unambiguous 24h hour (0 or 13-23);
    // 1-12 without a meridiem is genuinely ambiguous and gets rejected rather than guessed.
    if (hour === 0) {
      // midnight, fine as-is
    } else if (hour > 23 || hour <= 12) {
      return null
    }
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export type Period = 'AM' | 'PM'

export interface TimeParts {
  hour12: number // 1-12
  minute: number // 0-59
  period: Period
}

// 24h "HH:MM" -> { hour12, minute, period }, for driving the three-column picker. An empty/
// unparseable value falls back to a neutral starting position (12:00 AM) rather than throwing,
// since the columns need somewhere to render even before a real value has been chosen.
export function toTimeParts(value: string): TimeParts {
  const [hStr, mStr] = value.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return { hour12: 12, minute: 0, period: 'AM' }
  const period: Period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return { hour12, minute: m, period }
}

// { hour12, minute, period } -> 24h "HH:MM" — the inverse of toTimeParts, same noon/midnight rule
// (12 AM is hour 0, 12 PM stays hour 12).
export function fromTimeParts({ hour12, minute, period }: TimeParts): string {
  const base = hour12 % 12
  const hour = period === 'PM' ? base + 12 : base
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export const HOUR_OPTIONS: number[] = Array.from({ length: 12 }, (_, i) => i + 1)
export const MINUTE_OPTIONS: number[] = Array.from({ length: 60 }, (_, i) => i)
export const PERIOD_OPTIONS: Period[] = ['AM', 'PM']
