import { describe, expect, it } from 'vitest'
import { formatTime12h, toTimeParts } from './timeUtils'

describe('formatTime12h', () => {
  it('formats a plain 24h time', () => {
    expect(formatTime12h('14:30')).toBe('2:30 PM')
    expect(formatTime12h('00:00')).toBe('12:00 AM')
    expect(formatTime12h('12:00')).toBe('12:00 PM')
  })

  it('never throws on a missing value — a restored draft can genuinely hand this undefined', () => {
    // @ts-expect-error — exercising the runtime-unsafe case a stale localStorage draft can produce
    // despite the string type, see EventForm.tsx's EVENT_DRAFT_KEY comment.
    expect(() => formatTime12h(undefined)).not.toThrow()
    expect(formatTime12h('')).toBe('')
  })
})

describe('toTimeParts', () => {
  it('splits a plain 24h time into hour12/minute/period', () => {
    expect(toTimeParts('14:30')).toEqual({ hour12: 2, minute: 30, period: 'PM' })
    expect(toTimeParts('00:15')).toEqual({ hour12: 12, minute: 15, period: 'AM' })
  })

  it('never throws on a missing value, falling back to a neutral 12:00 AM', () => {
    // @ts-expect-error — same runtime-unsafe case as formatTime12h above; this is the one that
    // actually blanked the whole Add/Edit Event page before this fix, since TimePicker calls this
    // unconditionally on every render.
    expect(() => toTimeParts(undefined)).not.toThrow()
    // @ts-expect-error — see above
    expect(toTimeParts(undefined)).toEqual({ hour12: 12, minute: 0, period: 'AM' })
    expect(toTimeParts('')).toEqual({ hour12: 12, minute: 0, period: 'AM' })
  })
})
