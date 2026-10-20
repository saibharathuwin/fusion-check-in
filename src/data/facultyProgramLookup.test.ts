import { describe, expect, it } from 'vitest'
import { matchFaculty } from './facultyProgramLookup'

describe('matchFaculty', () => {
  it('matches an exact faculty name', () => {
    expect(matchFaculty('Faculty of Science', '')?.via).toBe('exact')
  })

  it('matches "Engineering" -> "Faculty of Engineering" via suffix normalizing', () => {
    const match = matchFaculty('Engineering', '')
    expect(match?.faculty).toBe('Faculty of Engineering')
    expect(match?.via).toBe('suffix')
  })

  // Regression: a short faculty answer like "Business" used to get overruled by whatever program
  // text happened to score well against the program catalog — e.g. a program of "General" scored a
  // near-perfect fuzzy match against "General Engineering", silently reassigning an Odette student
  // to Engineering even though they'd correctly written "Business" in the faculty field.
  it('trusts an explicit (if short) faculty answer over unrelated/generic program text', () => {
    expect(matchFaculty('Business', 'General')?.faculty).toBe('Odette School of Business')
    expect(matchFaculty('Business', 'N/A')?.faculty).toBe('Odette School of Business')
    expect(matchFaculty('Business', 'Bachelors')?.faculty).toBe('Odette School of Business')
    expect(matchFaculty('Business', '')?.faculty).toBe('Odette School of Business')
  })

  it('still fuzzy-matches minor faculty-text typos to the right faculty', () => {
    expect(matchFaculty('Bussiness', '')?.faculty).toBe('Odette School of Business')
    expect(matchFaculty('Busines', '')?.faculty).toBe('Odette School of Business')
  })

  it('falls back to fuzzy-matching the program text when the faculty field is blank', () => {
    const match = matchFaculty('', 'Civil Engineering')
    expect(match?.faculty).toBe('Faculty of Engineering')
    expect(match?.via).toBe('program')
  })

  it('falls back to the program text when the faculty text matches nothing at all', () => {
    const match = matchFaculty('asdf1234', 'History')
    expect(match?.faculty).toBe('Faculty of Arts, Humanities and Social Sciences')
    expect(match?.via).toBe('program')
  })

  it('returns null when neither field resembles anything real', () => {
    expect(matchFaculty('asdf1234', 'zzz9999')).toBeNull()
    expect(matchFaculty('', '')).toBeNull()
  })
})
