import { describe, expect, it } from 'vitest'
import { averageStatusCounts, studentsInEverySession } from './commonAttendance'

function row(studentUuid: string, sessionId: string, status: 'early' | 'on-time' | 'late' = 'on-time') {
  return { sessionId, student: { uuid: studentUuid }, status }
}

describe('studentsInEverySession', () => {
  it('matches the 10/7/5 example: common people, not the sum', () => {
    // Morning: 10 people (a1..a10). Afternoon: 7 people, 5 of whom overlap with Morning (a1..a5),
    // plus 2 new ones (b1, b2). Only a1..a5 attended both.
    const morning = Array.from({ length: 10 }, (_, i) => row(`a${i + 1}`, 'morning'))
    const afternoon = [...Array.from({ length: 5 }, (_, i) => row(`a${i + 1}`, 'afternoon')), row('b1', 'afternoon'), row('b2', 'afternoon')]
    const records = [...morning, ...afternoon]

    const common = studentsInEverySession(records, ['morning', 'afternoon'])
    expect(common.size).toBe(5)
    expect([...common].sort()).toEqual(['a1', 'a2', 'a3', 'a4', 'a5'])
  })

  it('a student only in one of the sessions is not common', () => {
    const records = [row('a1', 'morning'), row('a1', 'afternoon'), row('a2', 'morning')]
    expect(studentsInEverySession(records, ['morning', 'afternoon'])).toEqual(new Set(['a1']))
  })

  it('a single session in scope just returns everyone who attended it', () => {
    const records = [row('a1', 'morning'), row('a2', 'morning')]
    expect(studentsInEverySession(records, ['morning'])).toEqual(new Set(['a1', 'a2']))
  })

  it('is empty when the scope has no sessions', () => {
    expect(studentsInEverySession([row('a1', 'morning')], [])).toEqual(new Set())
  })

  it('ignores records outside the scope', () => {
    const records = [row('a1', 'morning'), row('a1', 'afternoon'), row('a1', 'evening')]
    expect(studentsInEverySession(records, ['morning', 'afternoon'])).toEqual(new Set(['a1']))
  })
})

describe('averageStatusCounts', () => {
  it('averages each status across the scoped sessions', () => {
    const records = [
      row('a1', 'morning', 'early'),
      row('a2', 'morning', 'early'),
      row('a3', 'morning', 'on-time'),
      row('a4', 'afternoon', 'early'),
      row('a5', 'afternoon', 'late'),
      row('a6', 'afternoon', 'late'),
    ]
    // Morning: early=2, on-time=1, late=0. Afternoon: early=1, on-time=0, late=2.
    // Averages: early=(2+1)/2=1.5->2, on-time=(1+0)/2=0.5->1 (round half up), late=(0+2)/2=1.
    expect(averageStatusCounts(records, ['morning', 'afternoon'])).toEqual({ early: 2, onTime: 1, late: 1 })
  })

  it('is zero across the board when the scope has no sessions', () => {
    expect(averageStatusCounts([], [])).toEqual({ early: 0, onTime: 0, late: 0 })
  })
})
