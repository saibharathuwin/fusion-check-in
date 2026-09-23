import { describe, expect, it } from 'vitest'
import { getEventDayRange, generateSessionsFromTemplates, createSessionTypeDraft } from './addEventData'

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
})
