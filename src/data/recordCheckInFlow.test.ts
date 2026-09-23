import { describe, expect, it } from 'vitest'
import { sessionWindowStatus } from './sessionsData'
import { computeAttendanceStatus, type EventTiming } from './checkInStatus'

// An integration-style test of the two-step decision record_check_in() makes for every scan (see
// supabase/schema-status-vs-window.sql) — window accept/reject first, status computed completely
// separately second, and only for a scan the window actually accepted. Mirrors exactly the four
// scenarios requested: scan before window (rejected), scan after window (rejected), scan within
// window but before event start (early), and scan within window after event start + grace (late).

interface Session {
  date: string
  openTime: string
  closeTime: string
  eventStartTime: string
  lateGraceMinutes: number
}

type ScanResult = { accepted: false; reason: 'session_not_started' | 'session_closed' } | { accepted: true; status: 'early' | 'on-time' | 'late' }

// A minimal client-side mirror of record_check_in()'s own two independent steps — see that
// function's SQL for the authoritative version this is kept in sync with.
function decideScan(session: Session, scannedAt: Date): ScanResult {
  const windowStatus = sessionWindowStatus(session, scannedAt)
  if (windowStatus === 'not-started') return { accepted: false, reason: 'session_not_started' }
  if (windowStatus === 'closed') return { accepted: false, reason: 'session_closed' }

  const timing: EventTiming = { date: session.date, eventStartTime: session.eventStartTime, lateGraceMinutes: session.lateGraceMinutes }
  return { accepted: true, status: computeAttendanceStatus(timing, scannedAt) }
}

// A session with real early-arrival AND late-departure buffer built into its window — the exact
// shape the window/status split exists to support. Window: 7:00–10:00 AM. Event itself: 8:00 AM,
// with a 10-minute grace period.
const session: Session = {
  date: '2026-11-20',
  openTime: '07:00',
  closeTime: '10:00',
  eventStartTime: '08:00',
  lateGraceMinutes: 10,
}

describe('record_check_in decision flow (window, then status — mirrors the SQL function)', () => {
  it('scan before the window: rejected, unrelated to lateness', () => {
    const result = decideScan(session, new Date('2026-11-20T06:45:00'))
    expect(result).toEqual({ accepted: false, reason: 'session_not_started' })
  })

  it('scan after the window: rejected, unrelated to lateness', () => {
    const result = decideScan(session, new Date('2026-11-20T10:15:00'))
    expect(result).toEqual({ accepted: false, reason: 'session_closed' })
  })

  it('scan within the window but before the event start: accepted, "early"', () => {
    const result = decideScan(session, new Date('2026-11-20T07:20:00'))
    expect(result).toEqual({ accepted: true, status: 'early' })
  })

  it('scan within the window, at the event start: accepted, "on-time"', () => {
    const result = decideScan(session, new Date('2026-11-20T08:00:00'))
    expect(result).toEqual({ accepted: true, status: 'on-time' })
  })

  it('scan within the window and after event start + grace period: accepted, "late"', () => {
    const result = decideScan(session, new Date('2026-11-20T08:45:00'))
    expect(result).toEqual({ accepted: true, status: 'late' })
  })

  it('a scan accepted near the end of the window can still be "late" without being rejected', () => {
    // Proves the two steps are genuinely independent: this scan is deep in the window's
    // late-arrival buffer (accepted), and also well past the grace period (late) — both true at
    // once, computed from two different time sources, neither one influencing the other.
    const result = decideScan(session, new Date('2026-11-20T09:55:00'))
    expect(result).toEqual({ accepted: true, status: 'late' })
  })
})
