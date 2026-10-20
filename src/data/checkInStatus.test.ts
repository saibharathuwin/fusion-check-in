import { describe, expect, it } from 'vitest'
import { computeAttendanceStatus, formatLateAfterTime, type EventTiming } from './checkInStatus'

// computeAttendanceStatus answers ONE question — "was this person on time" — and is deliberately
// tested with no reference to a check-in window anywhere in this file. Window accept/reject is a
// completely separate concern, covered in sessionsData.test.ts against sessionWindowStatus.

const timing: EventTiming = {
  date: '2026-11-20',
  eventStartTime: '08:00',
  lateGraceMinutes: 10,
}

describe('computeAttendanceStatus', () => {
  it('is "early" for a scan well before the event start', () => {
    expect(computeAttendanceStatus(timing, new Date('2026-11-20T07:00:00'))).toBe('early')
  })

  it('is "early" for a scan one minute before the event start', () => {
    expect(computeAttendanceStatus(timing, new Date('2026-11-20T07:59:00'))).toBe('early')
  })

  it('is "on-time" for a scan exactly at the event start', () => {
    expect(computeAttendanceStatus(timing, new Date('2026-11-20T08:00:00'))).toBe('on-time')
  })

  it('is "on-time" for a scan inside the grace period', () => {
    expect(computeAttendanceStatus(timing, new Date('2026-11-20T08:05:00'))).toBe('on-time')
  })

  it('is "on-time" for a scan exactly at the grace period boundary (inclusive)', () => {
    expect(computeAttendanceStatus(timing, new Date('2026-11-20T08:10:00'))).toBe('on-time')
  })

  it('is "late" for a scan one minute past the grace period', () => {
    expect(computeAttendanceStatus(timing, new Date('2026-11-20T08:11:00'))).toBe('late')
  })

  it('is "late" for a scan well after the grace period', () => {
    expect(computeAttendanceStatus(timing, new Date('2026-11-20T09:30:00'))).toBe('late')
  })

  it('is judged purely against eventStartTime, never a wider check-in window', () => {
    // A scan far outside any plausible check-in window is still just "late" here — this function
    // has no concept of window accept/reject at all, by design.
    const looseTiming: EventTiming = { date: '2026-11-20', eventStartTime: '08:00', lateGraceMinutes: 0 }
    expect(computeAttendanceStatus(looseTiming, new Date('2026-11-21T03:00:00'))).toBe('late')
  })

  it('treats a zero-minute grace period as "late" starting the instant after the event start', () => {
    const noGrace: EventTiming = { date: '2026-11-20', eventStartTime: '08:00', lateGraceMinutes: 0 }
    expect(computeAttendanceStatus(noGrace, new Date('2026-11-20T08:00:00'))).toBe('on-time')
    expect(computeAttendanceStatus(noGrace, new Date('2026-11-20T08:00:01'))).toBe('late')
  })
})

describe('formatLateAfterTime', () => {
  it('reports the clock time the grace period ends', () => {
    expect(formatLateAfterTime(timing)).toBe('8:10 AM')
  })

  it('rolls over into the next hour correctly', () => {
    const timingNearHour: EventTiming = { date: '2026-11-20', eventStartTime: '08:55', lateGraceMinutes: 10 }
    expect(formatLateAfterTime(timingNearHour)).toBe('9:05 AM')
  })
})
