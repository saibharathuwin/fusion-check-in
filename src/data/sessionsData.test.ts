import { describe, expect, it } from 'vitest'
import { pickOpenSession, sessionWindowStatus } from './sessionsData'

// sessionWindowStatus answers "will the scanner accept a scan right now at all" — purely the
// check-in WINDOW (open_time/close_time). It has no idea what time the event itself starts, and
// is tested here with no reference to eventStartTime/lateGraceMinutes anywhere — that's a
// completely separate question, covered in checkInStatus.test.ts.

const window = { date: '2026-11-20', openTime: '07:00', closeTime: '10:00' }

describe('sessionWindowStatus — window accept/reject', () => {
  it('rejects a scan before the window opens ("not-started")', () => {
    expect(sessionWindowStatus(window, new Date('2026-11-20T06:59:00'))).toBe('not-started')
  })

  it('rejects a scan after the window closes ("closed")', () => {
    expect(sessionWindowStatus(window, new Date('2026-11-20T10:01:00'))).toBe('closed')
  })

  it('accepts a scan exactly at the window open boundary', () => {
    expect(sessionWindowStatus(window, new Date('2026-11-20T07:00:00'))).toBe('open')
  })

  it('accepts a scan exactly at the window close boundary', () => {
    expect(sessionWindowStatus(window, new Date('2026-11-20T10:00:00'))).toBe('open')
  })

  it('accepts a scan within the window that is well before the event actually starts', () => {
    // This is the case the window/status split exists for: arriving during the early-buffer
    // portion of the window (well before an 8:00 AM event start, say) is a fully accepted scan —
    // whether it then reads as "early" is computeAttendanceStatus's job, not this function's.
    expect(sessionWindowStatus(window, new Date('2026-11-20T07:15:00'))).toBe('open')
  })

  it('accepts a scan within the window that is well after the event would have ended', () => {
    // Same idea from the other side: still inside the window's late-buffer, still accepted here —
    // whether it reads as "late" is computeAttendanceStatus's job.
    expect(sessionWindowStatus(window, new Date('2026-11-20T09:45:00'))).toBe('open')
  })

  it('treats a close time earlier than the open time as closing the following day (overnight window)', () => {
    const overnight = { date: '2026-11-20', openTime: '22:00', closeTime: '02:00' }
    expect(sessionWindowStatus(overnight, new Date('2026-11-20T23:30:00'))).toBe('open')
    expect(sessionWindowStatus(overnight, new Date('2026-11-21T01:30:00'))).toBe('open')
    expect(sessionWindowStatus(overnight, new Date('2026-11-21T02:01:00'))).toBe('closed')
    expect(sessionWindowStatus(overnight, new Date('2026-11-20T21:59:00'))).toBe('not-started')
  })
})

describe('pickOpenSession — overlapping windows', () => {
  // The exact real-world case this was fixed for: Day 5 – Morning opens 08:00/starts 10:00, Day 5
  // – Afternoon opens 13:00/starts 14:00, both close 18:00. Their windows overlap from 1:00 PM
  // onward, but the afternoon EVENT doesn't start until 2:00 PM.
  const morning = { date: '2026-11-20', openTime: '08:00', closeTime: '18:00', eventStartTime: '10:00' }
  const afternoon = { date: '2026-11-20', openTime: '13:00', closeTime: '18:00', eventStartTime: '14:00' }

  it('stays on the morning session before the afternoon window even opens (9 AM)', () => {
    expect(pickOpenSession([morning, afternoon], new Date('2026-11-20T09:00:00'))).toBe(morning)
  })

  it('stays on the morning session once it has started (noon)', () => {
    expect(pickOpenSession([morning, afternoon], new Date('2026-11-20T12:00:00'))).toBe(morning)
  })

  // The bug this fixes: both windows are open at 1:30 PM. A scan then is 3.5 hours after morning
  // started but only 30 minutes before afternoon starts — overwhelmingly more likely a fresh,
  // early arrival for the afternoon session than an extremely late one for the morning session.
  it('switches to the afternoon session once it is the closer one, even before it has technically started (1:30 PM)', () => {
    expect(pickOpenSession([morning, afternoon], new Date('2026-11-20T13:30:00'))).toBe(afternoon)
  })

  it('stays on the afternoon session once it has started too and is still the closer one (5 PM)', () => {
    expect(pickOpenSession([morning, afternoon], new Date('2026-11-20T17:00:00'))).toBe(afternoon)
  })

  it('still favors a session that just started over one whose own start is still hours away, even with both windows open', () => {
    // Afternoon's window opens early (10:30) well before its own 4 PM start, overlapping morning's
    // the moment morning itself starts (10:00) — at 10:35, morning is 35 min old; afternoon is
    // still 5h25m from starting. Morning is clearly the closer, more likely intended session.
    const earlyOpeningAfternoon = { date: '2026-11-20', openTime: '10:30', closeTime: '18:00', eventStartTime: '16:00' }
    expect(pickOpenSession([morning, earlyOpeningAfternoon], new Date('2026-11-20T10:35:00'))).toBe(morning)
  })

  it('returns null when no window is open', () => {
    expect(pickOpenSession([morning, afternoon], new Date('2026-11-20T19:00:00'))).toBeNull()
  })

  it('picks whichever starts soonest when neither open session has started yet', () => {
    const early = { date: '2026-11-20', openTime: '06:00', closeTime: '09:30', eventStartTime: '09:00' }
    const earlier = { date: '2026-11-20', openTime: '06:00', closeTime: '09:30', eventStartTime: '09:15' }
    expect(pickOpenSession([earlier, early], new Date('2026-11-20T06:30:00'))).toBe(early)
  })
})
