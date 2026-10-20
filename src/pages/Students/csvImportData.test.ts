import { describe, expect, it } from 'vitest'
import { validateRows, type ColumnMapping } from './csvImportData'

const mapping: ColumnMapping = {
  student_number: 'student_number',
  first_name: 'first_name',
  last_name: 'last_name',
  email: 'email',
  faculty: 'faculty',
  program: 'program',
  program_level: 'program_level',
  year: 'year',
  status: 'status',
}

describe('validateRows', () => {
  // Faculty, program and year are optional now — only name and email are required to create a new
  // student, matching the manual Add Student form's own relaxed requirements.
  it('accepts a new student with only name and email, leaving faculty/program/year blank', () => {
    const rows = validateRows(
      [{ first_name: 'Jaxon', last_name: 'Adams', email: 'jaxon@uwindsor.ca', faculty: '', program: '', program_level: '', year: '', student_number: '', status: '' }],
      mapping,
      [],
    )
    expect(rows[0].outcome).toBe('new')
    expect(rows[0].errors).toEqual([])
  })

  it('still rejects a new student missing first name, last name, or email', () => {
    const rows = validateRows([{ first_name: '', last_name: 'Adams', email: 'jaxon@uwindsor.ca' }], mapping, [])
    expect(rows[0].outcome).toBe('error')
    expect(rows[0].errors).toContain('Missing first name')
  })
})
