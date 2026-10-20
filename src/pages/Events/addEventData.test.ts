import { describe, expect, it } from 'vitest'
import {
  getEventDayRange,
  generateSessionsFromTemplates,
  createSessionTypeDraft,
  createSessionRow,
  getSessionFormErrors,
  getSessionFormWarnings,
} from './addEventData'

describe('getEventDayRange', () => {
  it('returns every date from startDate to endDate inclusive', () => {
    expect(getEventDayRange('2026-09-24', '2026-09-26')).toEqual(['2026-09-24', '2026-09-25', '2026-09-26'])
  })

  it('returns a single day when start and end are the same date', () => {
    expect(getEventDayRange('2026-09-24', '2026-09-24')).toEqual(['2026-09-24'])
  })

  it('spans a month boundary correctly', () => {
    expect(getEventDayRange('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
  })

  it('returns just startDate when endDate is missing', () => {
    expect(getEventDayRange('2026-09-24', '')).toEqual(['2026-09-24'])
  })

  it('returns just startDate when endDate is before startDate (not-yet-valid form state)', () => {
    expect(getEventDayRange('2026-09-24', '2026-09-20')).toEqual(['2026-09-24'])
  })

  it('returns an empty range when startDate is missing', () => {
    expect(getEventDayRange('', '2026-09-24')).toEqual([])
    expect(getEventDayRange('', '')).toEqual([])
  })
})

describe('generateSessionsFromTemplates', () => {
  const dayRange = ['2026-09-24', '2026-09-25']

  it('expands one type across every day it is checked for, ordered day-by-day', () => {
    const morning = createSessionTypeDraft({
      label: 'Morning',
      openTime: '08:00',
      closeTime: '12:00',
      eventStartTime: '08:00',
      lateGraceMinutes: 10,
      days: dayRange,
    })
    const rows = generateSessionsFromTemplates([morning], dayRange)
    expect(rows.map((r) => r.label)).toEqual(['Day 1 – Morning', 'Day 2 – Morning'])
    expect(rows.every((r) => r.openTime === '08:00' && r.closeTime === '12:00' && r.lateGraceMinutes === 10)).toBe(true)
  })

  it('interleaves multiple types day-by-day, not type-by-type', () => {
    const morning = createSessionTypeDraft({ label: 'Morning', openTime: '08:00', closeTime: '12:00', days: dayRange })
    const afternoon = createSessionTypeDraft({ label: 'Afternoon', openTime: '13:00', closeTime: '17:00', days: dayRange })
    const rows = generateSessionsFromTemplates([morning, afternoon], dayRange)
    expect(rows.map((r) => r.label)).toEqual(['Day 1 – Morning', 'Day 1 – Afternoon', 'Day 2 – Morning', 'Day 2 – Afternoon'])
  })

  it('only generates a row for the days a type is actually checked for', () => {
    const fridayOnly = createSessionTypeDraft({ label: 'Evening', openTime: '18:00', closeTime: '21:00', days: ['2026-09-25'] })
    const rows = generateSessionsFromTemplates([fridayOnly], dayRange)
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe('2026-09-25')
  })

  it('defaults eventStartTime to openTime when a type leaves it blank', () => {
    const type = createSessionTypeDraft({ label: 'Morning', openTime: '08:00', closeTime: '12:00', eventStartTime: '', days: dayRange })
    const rows = generateSessionsFromTemplates([type], dayRange)
    expect(rows.every((r) => r.eventStartTime === '08:00')).toBe(true)
  })

  it('omits the "Day N" prefix for a single-day event, using just the type label', () => {
    const singleDay = ['2026-09-24']
    const type = createSessionTypeDraft({ label: 'Morning', openTime: '08:00', closeTime: '12:00', days: singleDay })
    const rows = generateSessionsFromTemplates([type], singleDay)
    expect(rows[0].label).toBe('Morning')
  })

  it('marks every generated row labelTouched so the generic auto-relabeler never overwrites it', () => {
    const type = createSessionTypeDraft({ label: 'Morning', openTime: '08:00', closeTime: '12:00', days: dayRange })
    const rows = generateSessionsFromTemplates([type], dayRange)
    expect(rows.every((r) => r.labelTouched)).toBe(true)
  })

  it('produces nothing for a type with no days selected', () => {
    const type = createSessionTypeDraft({ label: 'Morning', openTime: '08:00', closeTime: '12:00', days: [] })
    expect(generateSessionsFromTemplates([type], dayRange)).toEqual([])
  })

  it('defaults eventEndTime to closeTime when a type leaves it blank', () => {
    const type = createSessionTypeDraft({ label: 'Morning', openTime: '08:00', closeTime: '12:00', eventEndTime: '', days: dayRange })
    const rows = generateSessionsFromTemplates([type], dayRange)
    expect(rows.every((r) => r.eventEndTime === '12:00')).toBe(true)
  })
})

describe('getSessionFormErrors', () => {
  const baseSession = {
    label: 'Day 1',
    date: '2026-10-15',
    openTime: '08:00',
    closeTime: '12:00',
    eventStartTime: '08:00',
    eventEndTime: '12:00',
    lateGraceMinutes: 10,
  }

  it('requires eventEndTime', () => {
    const session = createSessionRow({ ...baseSession, eventEndTime: '' })
    const errors = getSessionFormErrors([session], 'edit')
    expect(errors[session.key]?.eventEndTime).toBe('Required.')
  })

  it('no longer rejects an eventEndTime after Closes — relaxed to a warning instead (see getSessionFormWarnings below)', () => {
    const session = createSessionRow({ ...baseSession, eventEndTime: '13:00' }) // after Closes (12:00)
    const errors = getSessionFormErrors([session], 'edit')
    expect(errors[session.key]?.eventEndTime).toBeUndefined()
  })

  it('still rejects an eventEndTime before Opens', () => {
    const session = createSessionRow({ ...baseSession, eventEndTime: '07:00' }) // before Opens (08:00)
    const errors = getSessionFormErrors([session], 'edit')
    expect(errors[session.key]?.eventEndTime).toMatch(/within the check-in window/)
  })

  it('rejects an eventEndTime before eventStartTime', () => {
    const session = createSessionRow({ ...baseSession, eventStartTime: '10:00', eventEndTime: '09:00' })
    const errors = getSessionFormErrors([session], 'edit')
    expect(errors[session.key]?.eventEndTime).toBeDefined()
  })

  it('accepts a valid eventEndTime with no errors', () => {
    const session = createSessionRow({ ...baseSession })
    const errors = getSessionFormErrors([session], 'edit')
    expect(errors[session.key]?.eventEndTime).toBeUndefined()
  })

  it("flags a last-day session whose Closes runs past the event's own End time", () => {
    const session = createSessionRow({ ...baseSession, date: '2026-10-17', closeTime: '22:00', eventEndTime: '20:00' })
    const errors = getSessionFormErrors([session], 'edit', {
      startDate: '2026-10-13',
      endDate: '2026-10-17',
      startTime: '09:00',
      endTime: '17:00',
    })
    expect(errors[session.key]?.closeTime).toMatch(/End time/)
  })

  it("allows a non-last-day session's Closes to run past the event's overall End time", () => {
    // Day 2 of 5 closing at 10pm is fine even though the event's own End time is 5pm — only the
    // actual last calendar day is checked, since every earlier day already ends before that moment.
    const session = createSessionRow({ ...baseSession, date: '2026-10-14', closeTime: '22:00', eventEndTime: '20:00' })
    const errors = getSessionFormErrors([session], 'edit', {
      startDate: '2026-10-13',
      endDate: '2026-10-17',
      startTime: '09:00',
      endTime: '17:00',
    })
    expect(errors[session.key]?.closeTime).toBeUndefined()
  })

  it("allows the last day's Closes to land exactly on the event's own End time", () => {
    const session = createSessionRow({ ...baseSession, date: '2026-10-17', closeTime: '17:00', eventStartTime: '09:00', eventEndTime: '17:00' })
    const errors = getSessionFormErrors([session], 'edit', {
      startDate: '2026-10-13',
      endDate: '2026-10-17',
      startTime: '09:00',
      endTime: '17:00',
    })
    expect(errors[session.key]?.closeTime).toBeUndefined()
  })

  it('no longer rejects an eventStartTime before Opens — relaxed to a warning instead', () => {
    const session = createSessionRow({ ...baseSession, eventStartTime: '07:00' }) // before Opens (08:00)
    const errors = getSessionFormErrors([session], 'edit')
    expect(errors[session.key]?.eventStartTime).toBeUndefined()
  })

  it('still rejects an eventStartTime after Closes', () => {
    const session = createSessionRow({ ...baseSession, eventStartTime: '13:00' }) // after Closes (12:00)
    const errors = getSessionFormErrors([session], 'edit')
    expect(errors[session.key]?.eventStartTime).toMatch(/within the check-in window/)
  })
})

describe('getSessionFormWarnings', () => {
  const baseSession = {
    label: 'Day 1',
    date: '2026-10-15',
    openTime: '08:00',
    closeTime: '12:00',
    eventStartTime: '08:00',
    eventEndTime: '12:00',
    lateGraceMinutes: 10,
  }

  it('returns nothing for a session with no issues', () => {
    const session = createSessionRow({ ...baseSession })
    expect(getSessionFormWarnings([session])).toEqual({})
  })

  it('warns when the event starts before check-in opens', () => {
    const session = createSessionRow({ ...baseSession, eventStartTime: '07:00' })
    const warnings = getSessionFormWarnings([session])
    expect(warnings[session.key]?.[0]).toMatch(/starts at 7:00 AM.*doesn't open until 8:00 AM/)
  })

  it('warns when check-in closes before the event ends', () => {
    const session = createSessionRow({ ...baseSession, eventEndTime: '13:00' })
    const warnings = getSessionFormWarnings([session])
    expect(warnings[session.key]?.[0]).toMatch(/closes at 12:00 PM.*doesn't end until 1:00 PM/)
  })

  // The real example this was written for: Day 5 – Morning (08:00–18:00, starts 10:00) and Day 5
  // – Afternoon (13:00–18:00, starts 14:00) overlap from 1:00 PM to 6:00 PM.
  it('warns both sessions when their same-day check-in windows overlap, naming each other', () => {
    const morning = createSessionRow({
      label: 'Day 5 – Morning',
      date: '2026-10-15',
      openTime: '08:00',
      closeTime: '18:00',
      eventStartTime: '10:00',
      eventEndTime: '12:00',
      lateGraceMinutes: 10,
    })
    const afternoon = createSessionRow({
      label: 'Day 5 – Afternoon',
      date: '2026-10-15',
      openTime: '13:00',
      closeTime: '18:00',
      eventStartTime: '14:00',
      eventEndTime: '17:00',
      lateGraceMinutes: 10,
    })
    const warnings = getSessionFormWarnings([morning, afternoon])
    expect(warnings[morning.key]?.some((w) => w.includes('overlaps with "Day 5 – Afternoon"'))).toBe(true)
    expect(warnings[afternoon.key]?.some((w) => w.includes('overlaps with "Day 5 – Morning"'))).toBe(true)
  })

  it('does not warn about two same-day sessions whose windows merely touch, not overlap', () => {
    const first = createSessionRow({ ...baseSession, label: 'First', openTime: '08:00', closeTime: '12:00' })
    const second = createSessionRow({ ...baseSession, label: 'Second', openTime: '12:00', closeTime: '16:00', eventStartTime: '12:00', eventEndTime: '16:00' })
    const warnings = getSessionFormWarnings([first, second])
    expect(warnings[first.key]).toBeUndefined()
    expect(warnings[second.key]).toBeUndefined()
  })

  it('does not warn about two sessions on different days even if their clock times overlap', () => {
    const day1 = createSessionRow({ ...baseSession, date: '2026-10-15' })
    const day2 = createSessionRow({ ...baseSession, date: '2026-10-16' })
    const warnings = getSessionFormWarnings([day1, day2])
    expect(warnings[day1.key]).toBeUndefined()
    expect(warnings[day2.key]).toBeUndefined()
  })
})
