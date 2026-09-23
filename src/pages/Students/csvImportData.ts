import { supabase } from '../../lib/supabaseClient'
import { LEVELS, STUDENT_ID_PATTERN, type StudentLevel } from '../AddStudent/addStudentData'
import { STATUS_OPTIONS, updateStudent, type Student, type StudentStatus } from '../StudentDirectory/studentDirectoryData'

export const EXPECTED_FIELD_KEYS = [
  'student_number',
  'first_name',
  'last_name',
  'email',
  'faculty',
  'program',
  'program_level',
  'year',
  'status',
] as const

export type ExpectedField = (typeof EXPECTED_FIELD_KEYS)[number]

export const EXPECTED_FIELD_LABELS: Record<ExpectedField, string> = {
  student_number: 'Student ID',
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  faculty: 'Faculty',
  program: 'Program',
  program_level: 'Program level',
  year: 'Year',
  status: 'Status',
}

// Header aliases for auto-mapping — checked only when a field's exact normalized name isn't
// present in the file (see guessColumnMapping's `exact` flag).
const FIELD_ALIASES: Record<ExpectedField, string[]> = {
  student_number: ['student_number', 'student_id', 'studentid', 'id_number', 'id'],
  first_name: ['first_name', 'firstname', 'first', 'given_name'],
  last_name: ['last_name', 'lastname', 'last', 'surname', 'family_name'],
  email: ['email', 'email_address', 'university_email'],
  faculty: ['faculty'],
  program: ['program', 'course', 'academic_program', 'major'],
  program_level: ['program_level', 'level'],
  year: ['year', 'current_year', 'year_of_study'],
  status: ['status'],
}

export type ColumnMapping = Record<ExpectedField, string | null>

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

// Exact match on every expected field's own name -> mapping step is skipped. Anything less
// (renamed/reordered headers, needing an alias guess) -> mapping step shown, pre-filled with the
// best guess so the admin usually just has to confirm rather than map from scratch.
export function guessColumnMapping(headers: string[]): { mapping: ColumnMapping; exact: boolean } {
  const byNormalized = new Map<string, string>()
  for (const header of headers) {
    const normalized = normalizeHeader(header)
    if (!byNormalized.has(normalized)) byNormalized.set(normalized, header)
  }

  const mapping = {} as ColumnMapping
  let allExact = true
  for (const field of EXPECTED_FIELD_KEYS) {
    const exactHeader = byNormalized.get(field)
    if (exactHeader) {
      mapping[field] = exactHeader
      continue
    }
    allExact = false
    mapping[field] = FIELD_ALIASES[field].map((alias) => byNormalized.get(alias)).find(Boolean) ?? null
  }
  return { mapping, exact: allExact }
}

export interface ExistingStudentRecord {
  id: string
  studentNumber: string
  firstName: string
  lastName: string
  email: string
  faculty: string
  program: string
  level: StudentLevel
  year: string
  status: StudentStatus
}

// One unfiltered fetch, matched client-side — this app's whole student table is small enough that
// this is simpler and cheaper than per-row lookups (same approach studentAnalyticsData.ts uses).
export async function fetchExistingStudentIndex(): Promise<ExistingStudentRecord[]> {
  const { data, error } = await supabase
    .from('students')
    .select('id, student_number, first_name, last_name, email, faculty, program, level, year, status')
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id as string,
    studentNumber: row.student_number as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    email: row.email as string,
    faculty: row.faculty as string,
    program: row.program as string,
    level: row.level as StudentLevel,
    year: row.year as string,
    status: row.status as StudentStatus,
  }))
}

interface MappedFields {
  studentNumber: string
  firstName: string
  lastName: string
  email: string
  faculty: string
  program: string
  level: string
  year: string
  status: string
}

export interface ChangedField {
  label: string
  from: string
  to: string
}

export interface ImportRow {
  rowNumber: number // 1-based, matching the CSV's own line numbers (header is row 1)
  raw: Record<string, string>
  mapped: MappedFields
  outcome: 'new' | 'update' | 'error'
  errors: string[]
  existingStudent?: ExistingStudentRecord
  changes?: Partial<Omit<Student, 'id' | 'fullName'>>
  changedFields?: ChangedField[]
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

// Case-insensitively resolves free-typed CSV text ("active", "GRADUATE") to the app's canonical
// casing ("Active", "Graduate"). Only called after validation has already confirmed a match exists.
function toCanonical(value: string, options: readonly string[]): string {
  return options.find((option) => option.toLowerCase() === value.toLowerCase()) ?? value
}

function getMappedValue(raw: Record<string, string>, mapping: ColumnMapping, field: ExpectedField): string {
  const header = mapping[field]
  if (!header) return ''
  return (raw[header] ?? '').trim()
}

// The full per-row pipeline: map columns -> structural checks -> in-file duplicate emails ->
// match against existing students -> new-row required-field checks -> diff against existing data.
export function validateRows(
  rawRows: Record<string, string>[],
  mapping: ColumnMapping,
  existing: ExistingStudentRecord[],
): ImportRow[] {
  const existingByEmail = new Map(existing.map((student) => [student.email.toLowerCase(), student]))
  const existingByStudentNumber = new Map(existing.map((student) => [student.studentNumber, student]))

  const rows: ImportRow[] = rawRows.map((raw, index) => {
    const mapped: MappedFields = {
      studentNumber: getMappedValue(raw, mapping, 'student_number'),
      firstName: getMappedValue(raw, mapping, 'first_name'),
      lastName: getMappedValue(raw, mapping, 'last_name'),
      email: normalizeEmail(getMappedValue(raw, mapping, 'email')),
      faculty: getMappedValue(raw, mapping, 'faculty'),
      program: getMappedValue(raw, mapping, 'program'),
      level: getMappedValue(raw, mapping, 'program_level'),
      year: getMappedValue(raw, mapping, 'year'),
      status: getMappedValue(raw, mapping, 'status'),
    }

    const errors: string[] = []
    if (!mapped.firstName) errors.push('Missing first name')
    if (!mapped.lastName) errors.push('Missing last name')
    if (!mapped.email) errors.push('Missing email')
    else if (!EMAIL_REGEX.test(mapped.email)) errors.push('Invalid email format')

    if (mapped.studentNumber && !STUDENT_ID_PATTERN.test(mapped.studentNumber)) {
      errors.push('Student ID must be 9 digits')
    }
    if (mapped.level && !LEVELS.some((l) => l.toLowerCase() === mapped.level.toLowerCase())) {
      errors.push(`Program level must be ${LEVELS.join(' or ')}`)
    }
    if (mapped.status && !STATUS_OPTIONS.some((s) => s.toLowerCase() === mapped.status.toLowerCase())) {
      errors.push(`Status must be one of ${STATUS_OPTIONS.join(', ')}`)
    }

    return { rowNumber: index + 2, raw, mapped, outcome: 'error', errors } satisfies ImportRow
  })

  // Duplicate emails within the file itself — flag every row in the group, don't import any of them.
  const emailGroups = new Map<string, ImportRow[]>()
  for (const row of rows) {
    if (!row.mapped.email) continue
    const group = emailGroups.get(row.mapped.email) ?? []
    group.push(row)
    emailGroups.set(row.mapped.email, group)
  }
  for (const group of emailGroups.values()) {
    if (group.length < 2) continue
    for (const row of group) {
      const others = group.filter((r) => r !== row).map((r) => r.rowNumber)
      row.errors.push(`Duplicate email in this file (also row${others.length > 1 ? 's' : ''} ${others.join(', ')})`)
    }
  }

  for (const row of rows) {
    if (row.errors.length > 0) continue // already an error from structural or duplicate checks

    const existingMatch = existingByEmail.get(row.mapped.email)
    if (existingMatch) {
      row.outcome = 'update'
      row.existingStudent = existingMatch
      const changes: Partial<Omit<Student, 'id' | 'fullName'>> = {}
      const changedFields: ChangedField[] = []

      function diff(key: keyof typeof changes, label: string, newRaw: string, current: string, options?: readonly string[]) {
        if (!newRaw) return // blank CSV cell -> never touch the existing value
        const normalized = options ? toCanonical(newRaw, options) : newRaw
        if (normalized !== current) {
          ;(changes as Record<string, string>)[key] = normalized
          changedFields.push({ label, from: current, to: normalized })
        }
      }

      diff('firstName', 'First name', row.mapped.firstName, existingMatch.firstName)
      diff('lastName', 'Last name', row.mapped.lastName, existingMatch.lastName)
      diff('faculty', 'Faculty', row.mapped.faculty, existingMatch.faculty)
      diff('program', 'Program', row.mapped.program, existingMatch.program)
      diff('level', 'Program level', row.mapped.level, existingMatch.level, LEVELS)
      diff('year', 'Year', row.mapped.year, existingMatch.year)
      diff('status', 'Status', row.mapped.status, existingMatch.status, STATUS_OPTIONS)

      row.changes = changes
      row.changedFields = changedFields
    } else {
      const missing: string[] = []
      if (!row.mapped.studentNumber) missing.push('student_number')
      if (!row.mapped.faculty) missing.push('faculty')
      if (!row.mapped.program) missing.push('program')
      if (!row.mapped.year) missing.push('year')

      if (missing.length > 0) {
        row.outcome = 'error'
        row.errors.push(`Missing required field${missing.length > 1 ? 's' : ''} for a new student: ${missing.join(', ')}`)
        continue
      }

      const collision = existingByStudentNumber.get(row.mapped.studentNumber)
      if (collision) {
        row.outcome = 'error'
        row.errors.push(`Student ID ${row.mapped.studentNumber} already belongs to a different student (${collision.email})`)
        continue
      }

      row.outcome = 'new'
    }
  }

  return rows
}

export interface WriteResult {
  ok: boolean
  error?: string
  warning?: string
}

// Mirrors AddStudentForm.tsx's own insert flow exactly (student row + its paired passes row) so a
// CSV-imported student ends up in the same state as one added manually.
export async function insertImportedStudent(row: ImportRow): Promise<WriteResult> {
  const level = row.mapped.level ? (toCanonical(row.mapped.level, LEVELS) as StudentLevel) : 'Undergraduate'
  const status = row.mapped.status ? (toCanonical(row.mapped.status, STATUS_OPTIONS) as StudentStatus) : 'Active'

  const { data: student, error: studentError } = await supabase
    .from('students')
    .insert({
      student_number: row.mapped.studentNumber,
      first_name: row.mapped.firstName,
      last_name: row.mapped.lastName,
      email: row.mapped.email,
      faculty: row.mapped.faculty,
      program: row.mapped.program,
      level,
      year: row.mapped.year,
      status,
    })
    .select()
    .single()

  if (studentError || !student) {
    return {
      ok: false,
      error: studentError?.code === '23505' ? 'A student with that ID or email already exists.' : (studentError?.message ?? 'Failed to create student.'),
    }
  }

  const { error: passError } = await supabase.from('passes').insert({ student_id: student.id })
  if (passError) {
    return { ok: true, warning: 'Created, but their pass could not be generated — reissue it from Pass Tools.' }
  }

  return { ok: true }
}

// Thin wrapper around the existing updateStudent() (studentDirectoryData.ts) — reused as-is, not
// duplicated. Matched on student_number, same as every other caller of updateStudent.
export async function updateImportedStudent(studentNumber: string, changes: Partial<Omit<Student, 'id' | 'fullName'>>): Promise<WriteResult> {
  if (Object.keys(changes).length === 0) return { ok: true }
  try {
    await updateStudent(studentNumber, changes)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to update student.' }
  }
}

// Runs `task` over `items` with at most `limit` in flight at once — large CSVs (500+ rows) stay
// responsive instead of firing hundreds of requests at once, while still being far faster than
// fully serial. Deliberately per-row (not one bulk insert) so a single bad row can't fail an
// entire chunk atomically — every row gets its own real success/failure result.
export async function runWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    for (;;) {
      const current = nextIndex++
      if (current >= items.length) return
      results[current] = await task(items[current])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}
