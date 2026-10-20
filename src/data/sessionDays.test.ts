import { describe, expect, it } from 'vitest'
import { groupSessionsByDay, splitDays } from './sessionDays'
import type { EventSession } from './sessionsData'

const TIMES = [
  { label: 'Morning', openTime: '08:00', closeTime: '12:00' },
  { label: 'Afternoon', openTime: '13:00', closeTime: '17:00' },
  { label: 'Evening', openTime: '18:00', closeTime: '21:00' },
]

function tenDayEvent(): EventSession[] {
  const sessions: EventSession[] = []
  for (let day = 1; day <= 10; day++) {
    const date = `2026-10-${String(day).padStart(2, '0')}`
    for (const t of TIMES) {
      sessions.push({
        id: `${date}-${t.label}`,
        eventId: 'event-1',
        label: `Day ${day} – ${t.label}`,
        date,
        openTime: t.openTime,
        closeTime: t.closeTime,
        eventStartTime: t.openTime,
        eventEndTime: t.closeTime,
        lateGraceMinutes: 10,
        checkpointTypeId: 'cp',
      } as EventSession)
    }
  }
  return sessions
}

describe('groupSessionsByDay — 10 days, 3 sessions each', () => {
  it('groups into ten days of three sessions, in date order', () => {
    const days = groupSessionsByDay(tenDayEvent(), new Date('2026-10-05T14:00:00'))
    expect(days).toHaveLength(10)
    expect(days.every((d) => d.sessions.length === 3)).toBe(true)
    expect(days[0].date).toBe('2026-10-01')
    expect(days[9].date).toBe('2026-10-10')
  })

  it('marks today', () => {
    const days = groupSessionsByDay(tenDayEvent(), new Date('2026-10-05T14:00:00'))
    expect(days.filter((d) => d.isToday).map((d) => d.date)).toEqual(['2026-10-05'])
  })

  it('tucks fully closed days behind "earlier days" and keeps the rest in the default row', () => {
    const { current, completed } = splitDays(groupSessionsByDay(tenDayEvent(), new Date('2026-10-05T14:00:00')))
    expect(completed.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(current).toHaveLength(6)
    expect(current[0].date).toBe('2026-10-05')
  })

  it('keeps today in the default row while any of its sessions is still open or upcoming', () => {
    // Morning and Afternoon have closed, Evening is still to come — today is not "completed".
    const { current, completed } = splitDays(groupSessionsByDay(tenDayEvent(), new Date('2026-10-05T19:00:00')))
    expect(completed.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(current[0].date).toBe('2026-10-05')
  })

  it('moves today into the completed group once its last session has closed', () => {
    const { completed } = splitDays(groupSessionsByDay(tenDayEvent(), new Date('2026-10-05T22:00:00')))
    expect(completed.map((d) => d.date)).toContain('2026-10-05')
  })
})
