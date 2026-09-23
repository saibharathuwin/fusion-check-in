import { describe, expect, it } from 'vitest'
import { sessionWindowStatus } from './sessionsData'

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
