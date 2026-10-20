import { describe, expect, it } from 'vitest'
import type { ColumnMapping } from './csvImportData'
import { buildSmartImportRows, stripJunkHeaderRows, summarizeSmartImport, toValidateRowsInput } from './smartImport'

const mapping: ColumnMapping = {
  student_number: 'Student ID',
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  faculty: 'Faculty',
  program: 'Program',
  program_level: 'Level',
  year: 'Year',
  status: null,
}

describe('stripJunkHeaderRows', () => {
  it('drops the Qualtrics question-text row and the ImportId row that follows it', () => {
    const rows = [
      { 'First Name': 'Please choose...', Email: 'Recipient Email' },
      { 'First Name': '{"ImportId":"QID1"}', Email: '{"ImportId":"QID2"}' },
      { 'First Name': 'Jaxon', Email: 'jaxon@uwindsor.ca' },
    ]
    const result = stripJunkHeaderRows(rows)
    expect(result.droppedCount).toBe(2)
    expect(result.rows).toEqual([{ 'First Name': 'Jaxon', Email: 'jaxon@uwindsor.ca' }])
  })

  it('leaves a normal file with no junk rows untouched', () => {
    const rows = [{ 'First Name': 'Jaxon', Email: 'jaxon@uwindsor.ca' }]
    const result = stripJunkHeaderRows(rows)
    expect(result.droppedCount).toBe(0)
    expect(result.rows).toBe(rows)
  })
})

describe('buildSmartImportRows — messy sample', () => {
  const rawRows: Record<string, string>[] = [
    // ALL CAPS name, "2nd year", clean 9-digit ID, "Civil Engr" fuzzy-matches a faculty
    {
      'Student ID': '123456789',
      'First Name': 'JAXON',
      'Last Name': 'ADAMS',
      Email: 'Jaxon.Adams@UWindsor.ca',
      Faculty: '',
      Program: 'Civil Engr',
      Level: '',
      Year: '2nd year',
    },
    // all-lowercase name, "grade 1", scientific-notation ID
    {
      'Student ID': '2.9E+09',
      'First Name': 'sofia',
      'Last Name': 'adams',
      Email: 'sofia.adams@uwindsor.ca',
      Faculty: 'Faculty of Science',
      Program: 'Kinesiology',
      Level: '',
      Year: 'grade 1',
    },
    // "first year" (ordinal word), duplicate email with row above's address reused
    {
      'Student ID': '',
      'First Name': 'Emily',
      'Last Name': 'Adeyemi',
      Email: 'sofia.adams@uwindsor.ca',
      Faculty: 'Faculty of Science',
      Program: 'Psychology',
      Level: '',
      Year: 'first year',
    },
  ]

  const rows = buildSmartImportRows(rawRows, mapping)

  it('title-cases an ALL CAPS name', () => {
    expect(rows[0].fields.first_name.value).toBe('Jaxon')
    expect(rows[0].fields.last_name.value).toBe('Adams')
    expect(rows[0].fields.first_name.confidence).toBe('high')
  })

  it('title-cases an all-lowercase name', () => {
    expect(rows[1].fields.first_name.value).toBe('Sofia')
    expect(rows[1].fields.last_name.value).toBe('Adams')
  })

  it('lowercases and trims the email', () => {
    expect(rows[0].fields.email.value).toBe('jaxon.adams@uwindsor.ca')
  })

  it('converts "2nd year" to 2', () => {
    expect(rows[0].fields.year.value).toBe('2')
    expect(rows[0].fields.year.confidence).toBe('high')
  })

  it('converts "grade 1" to 1', () => {
    expect(rows[1].fields.year.value).toBe('1')
  })

  it('converts the ordinal word "first year" to 1', () => {
    expect(rows[2].fields.year.value).toBe('1')
  })

  it('blanks a scientific-notation student ID and flags it as damaged, never guessing the digits', () => {
    expect(rows[1].fields.student_number.value).toBe('')
    expect(rows[1].fields.student_number.note).toContain('damaged')
    expect(rows[1].needsReview).toBe(true)
  })

  it('fuzzy-matches "Civil Engr" to Faculty of Engineering, flagged for confirmation', () => {
    expect(rows[0].fields.faculty.value).toBe('Faculty of Engineering')
    expect(rows[0].fields.faculty.confidence).not.toBe('high')
    expect(rows[0].needsReview).toBe(true)
  })

  it('flags the second occurrence of a duplicate email, not the first', () => {
    expect(rows[1].reasons.some((r) => r.startsWith('Duplicate email'))).toBe(false)
    expect(rows[2].reasons.some((r) => r.startsWith('Duplicate email'))).toBe(true)
    expect(rows[2].needsReview).toBe(true)
  })

  it('summarizes the batch', () => {
    const summary = summarizeSmartImport(rows)
    expect(summary.total).toBe(3)
    expect(summary.damagedIds).toBe(1)
    expect(summary.duplicates).toBe(1)
    expect(summary.needsReview).toBeGreaterThan(0)
  })

  it('round-trips cleaned values into validateRows-compatible input', () => {
    const { rawRows: converted, mapping: identityMapping } = toValidateRowsInput(rows)
    expect(converted[0].first_name).toBe('Jaxon')
    expect(converted[0].year).toBe('2')
    expect(identityMapping.first_name).toBe('first_name')
  })
})

describe('buildSmartImportRows — additional edge cases', () => {
  it('flags a value containing "semester" instead of silently converting it', () => {
    const rows = buildSmartImportRows(
      [{ Year: '4th semester', 'First Name': 'A', 'Last Name': 'B', Email: 'a@uwindsor.ca' }],
      { ...mapping, year: 'Year' },
    )
    expect(rows[0].fields.year.note).toMatch(/semester/i)
    expect(rows[0].needsReview).toBe(true)
  })

  it('leaves an already-mixed-case name untouched', () => {
    const rows = buildSmartImportRows([{ 'First Name': 'DeAndre', 'Last Name': 'B', Email: 'a@uwindsor.ca' }], mapping)
    expect(rows[0].fields.first_name.value).toBe('DeAndre')
    expect(rows[0].fields.first_name.changed).toBe(false)
  })

  it('flags an invalid email instead of guessing', () => {
    const rows = buildSmartImportRows([{ 'First Name': 'A', 'Last Name': 'B', Email: 'not-an-email' }], mapping)
    expect(rows[0].fields.email.confidence).toBe('low')
    expect(rows[0].needsReview).toBe(true)
  })

  // Faculty, program, program level and year are all optional now — a row with only name/email
  // filled in shouldn't be flagged for review just because those columns are blank.
  it('does not flag a row as needing review when faculty/program/level/year are all blank', () => {
    const rows = buildSmartImportRows(
      [{ 'First Name': 'A', 'Last Name': 'B', Email: 'a@uwindsor.ca', Faculty: '', Program: '', Level: '', Year: '' }],
      mapping,
    )
    expect(rows[0].fields.faculty.confidence).toBe('high')
    expect(rows[0].fields.program.confidence).toBe('high')
    expect(rows[0].fields.program_level.confidence).toBe('high')
    expect(rows[0].fields.year.confidence).toBe('high')
    expect(rows[0].needsReview).toBe(false)
  })
})
