import { describe, expect, it } from 'vitest'
import {
  droppedInScope,
  expectedInvitees,
  findNextSession,
  periodCovers,
  sortSessionsChronologically,
  type InviteePeriod,
} from './inviteePeriods'
import type { EventSession } from './sessionsData'

function session(id: string, date: string, openTime: string): EventSession {
  return {
    id,
    eventId: 'event-1',
    label: id,
    date,
    openTime,
    closeTime: '18:00',
    eventStartTime: openTime,
    eventEndTime: '18:00',
    lateGraceMinutes: 10,
    checkpointTypeId: 'cp',
  } as EventSession
}

function period(studentId: string, overrides: Partial<InviteePeriod> = {}): InviteePeriod {
  return {
    id: `p-${studentId}-${Math.random()}`,
    eventId: 'event-1',
    studentId,
    joinedFromSessionId: null,
    droppedFromSessionId: null,
    reason: null,
    note: null,
    joinedByName: null,
    droppedByName: null,
    droppedAt: null,
    createdAt: '2026-10-01T10:00:00Z',
    ...overrides,
  }
}

const day1Morning = session('d1-am', '2026-10-05', '08:00')
const day1Afternoon = session('d1-pm', '2026-10-05', '13:00')
const day2Morning = session('d2-am', '2026-10-06', '08:00')
const allSessions = [day2Morning, day1Afternoon, day1Morning]
const sessionsById = new Map(allSessions.map((s) => [s.id, s]))
const invitees = [{ uuid: 'a' }, { uuid: 'b' }, { uuid: 'c' }]

describe('sortSessionsChronologically', () => {
  it('orders by date, then open time', () => {
    expect(sortSessionsChronologically(allSessions).map((s) => s.id)).toEqual(['d1-am', 'd1-pm', 'd2-am'])
  })
})

describe('findNextSession', () => {
  it('skips sessions whose window has already closed', () => {
    const next = findNextSession(sortSessionsChronologically(allSessions), new Date('2026-10-06T09:00:00'))
    expect(next?.id).toBe('d2-am')
  })

  it('returns the earliest session while its window is still open', () => {
    const next = findNextSession(sortSessionsChronologically(allSessions), new Date('2026-10-05T12:00:00'))
    expect(next?.id).toBe('d1-am')
  })

  it('returns null once every window has closed', () => {
    expect(findNextSession(sortSessionsChronologically(allSessions), new Date('2026-12-01T12:00:00'))).toBeNull()
  })
})

describe('periodCovers', () => {
  it('covers every session for an open period with no start', () => {
    expect(periodCovers(period('a'), day1Morning, sessionsById)).toBe(true)
    expect(periodCovers(period('a'), day2Morning, sessionsById)).toBe(true)
  })

  it('does not cover sessions before a late join', () => {
    const p = period('a', { joinedFromSessionId: 'd1-pm' })
    expect(periodCovers(p, day1Morning, sessionsById)).toBe(false)
    expect(periodCovers(p, day1Afternoon, sessionsById)).toBe(true)
  })

  it('stops covering from the drop session onward', () => {
    const p = period('a', { droppedFromSessionId: 'd1-pm', reason: 'Withdrew' })
    expect(periodCovers(p, day1Morning, sessionsById)).toBe(true)
    expect(periodCovers(p, day1Afternoon, sessionsById)).toBe(false)
    expect(periodCovers(p, day2Morning, sessionsById)).toBe(false)
  })
})

describe('expectedInvitees', () => {
  it('whole-event scope counts only people still invited at the end', () => {
    const periods = [period('a', { droppedFromSessionId: 'd1-pm', reason: 'Withdrew' }), period('b'), period('c')]
    const result = expectedInvitees(invitees, periods, allSessions, allSessions)
    expect(result.map((i) => i.uuid)).toEqual(['b', 'c'])
  })

  it('a late joiner is counted for the whole event once they join', () => {
    const periods = [period('a'), period('b'), period('c', { joinedFromSessionId: 'd2-am' })]
    expect(expectedInvitees(invitees, periods, allSessions, allSessions).map((i) => i.uuid)).toEqual(['a', 'b', 'c'])
  })

  it('a single session only counts people covering that session', () => {
    const periods = [period('a', { droppedFromSessionId: 'd1-pm', reason: 'Withdrew' }), period('b'), period('c', { joinedFromSessionId: 'd2-am' })]
    expect(expectedInvitees(invitees, periods, allSessions, [day1Afternoon]).map((i) => i.uuid)).toEqual(['b'])
    expect(expectedInvitees(invitees, periods, allSessions, [day2Morning]).map((i) => i.uuid)).toEqual(['b', 'c'])
  })

  it('a rejoined student is expected again from the rejoin session', () => {
    const periods = [
      period('a', { droppedFromSessionId: 'd1-pm', reason: 'Withdrew' }),
      period('a', { joinedFromSessionId: 'd2-am' }),
      period('b'),
      period('c'),
    ]
    expect(expectedInvitees(invitees, periods, allSessions, [day1Afternoon]).map((i) => i.uuid)).toEqual(['b', 'c'])
    expect(expectedInvitees(invitees, periods, allSessions, [day2Morning]).map((i) => i.uuid)).toEqual(['a', 'b', 'c'])
  })

  it('with no sessions, keeps only students with an open period', () => {
    const periods = [period('a', { droppedFromSessionId: 'd1-pm', reason: 'Withdrew' }), period('b')]
    expect(expectedInvitees(invitees, periods, [], []).map((i) => i.uuid)).toEqual(['b'])
  })
})

describe('droppedInScope', () => {
  it('lists people dropped by the end of the scope', () => {
    const periods = [period('a', { droppedFromSessionId: 'd1-pm', reason: 'Withdrew' }), period('b', { droppedFromSessionId: 'd2-am', reason: 'Other' })]
    expect(droppedInScope(periods, allSessions, [day1Afternoon]).map((p) => p.studentId)).toEqual(['a'])
    expect(droppedInScope(periods, allSessions, allSessions).map((p) => p.studentId)).toEqual(['a', 'b'])
  })
})
