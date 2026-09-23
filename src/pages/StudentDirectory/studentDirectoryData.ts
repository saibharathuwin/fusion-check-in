import { supabase } from '../../lib/supabaseClient'
import type { StudentLevel } from '../AddStudent/addStudentData'

export type StudentStatus = 'Active' | 'Alumni' | 'Withdrawn'
export type PassStatus = 'Active' | 'Revoked'

export interface Student {
  // The human-facing student number (students.student_number) — used everywhere in the app as
  // "the student's ID", not the table's own internal uuid primary key.
  id: string
  // The table's actual primary key. Only needed where a real foreign key is involved (e.g.
  // event_invitees.student_id, check_ins.student_id) — everything user-facing uses `id`.
  uuid: string
  firstName: string
  lastName: string
  // Computed as `${firstName} ${lastName}`.trim() — kept so every display-only call site
  // (Directory, profile modal, Pass Tools' pass panel, PDF/QR generation, Scanner, activity log)
  // can keep reading a single name without change; only the edit form and inserts/updates need
  // to touch firstName/lastName directly.
  fullName: string
  email: string
  faculty: string
  program: string
  level: StudentLevel
  year: string
  status: StudentStatus
  dateJoined: string
  passStatus: PassStatus
  // Superseded by real pass-token rotation once Reissue is wired to the `passes` table directly;
  // kept at 0 for now so existing callers (QR preview, PDF) still have a value to read.
  reissueCount: number
}

export const STATUS_OPTIONS: StudentStatus[] = ['Active', 'Alumni', 'Withdrawn']

export const STATUS_COLORS: Record<StudentStatus, { bg: string; text: string }> = {
  Active: { bg: '#e1f8ec', text: '#159a56' },
  Alumni: { bg: '#e3edff', text: '#2f6fed' },
  Withdrawn: { bg: '#fde8e8', text: '#d1453d' },
}

const AVATAR_THEMES = ['blue', 'green', 'teal', 'purple', 'amber', 'pink'] as const
export type AvatarTheme = (typeof AVATAR_THEMES)[number]

export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

export function getAvatarTheme(seed: string): AvatarTheme {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_THEMES[h % AVATAR_THEMES.length]
}

// Shape of a row as it comes back from Supabase, joined to its one pass row.
export interface StudentRow {
  id: string
  student_number: string
  first_name: string
  last_name: string
  email: string
  faculty: string
  program: string
  level: StudentLevel
  year: string
  status: StudentStatus
  created_at: string
  passes: { status: PassStatus }[] | { status: PassStatus } | null
}

const SELECT_WITH_PASS = '*, passes(status)'

export function mapStudentRow(row: StudentRow): Student {
  const pass = Array.isArray(row.passes) ? row.passes[0] : row.passes
  return {
    id: row.student_number,
    uuid: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: `${row.first_name} ${row.last_name}`.trim(),
    email: row.email,
    faculty: row.faculty,
    program: row.program,
    level: row.level,
    year: row.year,
    status: row.status,
    dateJoined: row.created_at,
    passStatus: pass?.status ?? 'Active',
    reissueCount: 0,
  }
}

export interface StudentQueryParams {
  page: number
  pageSize: number
  studentIdQuery?: string
  nameQuery?: string
  faculty?: string
  year?: string
  status?: StudentStatus | 'All'
  level?: StudentLevel | 'All'
}

export interface StudentQueryResult {
  students: Student[]
  totalCount: number
}

// Real, paginated Supabase query against the `students` table (joined to its one `passes` row).
export async function fetchStudents(params: StudentQueryParams): Promise<StudentQueryResult> {
  const { page, pageSize, studentIdQuery, nameQuery, faculty, year, status, level } = params

  let query = supabase.from('students').select(SELECT_WITH_PASS, { count: 'exact' })

  const idQuery = studentIdQuery?.trim()
  if (idQuery) query = query.ilike('student_number', `%${idQuery}%`)
  const trimmedNameQuery = nameQuery?.trim()
  if (trimmedNameQuery) query = query.or(`first_name.ilike.%${trimmedNameQuery}%,last_name.ilike.%${trimmedNameQuery}%`)
  if (faculty && faculty !== 'All') query = query.eq('faculty', faculty)
  if (year && year !== 'All') query = query.eq('year', year)
  if (status && status !== 'All') query = query.eq('status', status)
  if (level && level !== 'All') query = query.eq('level', level)

  const start = (page - 1) * pageSize
  const { data, error, count } = await query.order('first_name', { ascending: true }).range(start, start + pageSize - 1)
  if (error) throw error

  return { students: (data ?? []).map((row) => mapStudentRow(row as unknown as StudentRow)), totalCount: count ?? 0 }
}

// One unfiltered fetch of every student, for screens that filter client-side rather than
// paginating (the event invite picker) — same approach studentAnalyticsData.ts and
// csvImportData.ts already take, and fine at this app's scale.
export async function fetchAllStudents(): Promise<Student[]> {
  const { data, error } = await supabase.from('students').select(SELECT_WITH_PASS).order('first_name', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => mapStudentRow(row as unknown as StudentRow))
}

// The live total number of students in the database — used as the effective "capacity" for an
// Open-registration event (any student can check in, so the ceiling is the whole student body),
// in place of a hardcoded or infinite denominator. A lightweight count, same pattern as
// inviteesData.ts's countInvitees, without pulling every row just to measure the table.
export async function countAllStudents(): Promise<number> {
  const { count, error } = await supabase.from('students').select('id', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

// Matches on name, student number, or email against the real `students` table.
export async function searchStudents(queryText: string, limit = 8): Promise<Student[]> {
  const q = queryText.trim()
  if (!q) return []

  const { data, error } = await supabase
    .from('students')
    .select(SELECT_WITH_PASS)
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,student_number.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(limit)
  if (error) throw error

  return (data ?? []).map((row) => mapStudentRow(row as unknown as StudentRow))
}

// Real distinct program values already in use for this faculty+level — merged with the static
// curated catalog in addStudentData.ts's getLiveProgramSuggestions so the autocomplete surfaces
// whatever staff have actually typed before (combined programs, certificates, diplomas, etc.),
// not just the preset list.
export async function fetchDistinctPrograms(faculty: string, level: StudentLevel): Promise<string[]> {
  if (!faculty) return []
  const { data, error } = await supabase.from('students').select('program').eq('faculty', faculty).eq('level', level)
  if (error) throw error
  return Array.from(new Set((data ?? []).map((row) => row.program as string).filter(Boolean)))
}

// Exact-match lookup by student number — used by the Scanner to resolve a scanned pass to a
// real student.
export async function fetchStudentById(id: string): Promise<Student | null> {
  const { data, error } = await supabase.from('students').select(SELECT_WITH_PASS).eq('student_number', id).maybeSingle()
  if (error || !data) return null
  return mapStudentRow(data as unknown as StudentRow)
}

// Writes to the real `students` table (table: public.students), matched on student_number (the
// id every caller already uses — not the table's own internal uuid primary key). Only the fields
// present in `changes` are sent, so callers should pass a diff, not the whole record.
// passStatus/reissueCount are `passes`-table concerns handled by the Reissue flow directly against
// that table, not through here — if `changes` contains only those, this is a no-op read-back.
export async function updateStudent(id: string, changes: Partial<Omit<Student, 'id' | 'fullName'>>): Promise<Student> {
  const patch: Record<string, unknown> = {}
  if (changes.firstName !== undefined) patch.first_name = changes.firstName
  if (changes.lastName !== undefined) patch.last_name = changes.lastName
  if (changes.email !== undefined) patch.email = changes.email
  if (changes.faculty !== undefined) patch.faculty = changes.faculty
  if (changes.program !== undefined) patch.program = changes.program
  if (changes.level !== undefined) patch.level = changes.level
  if (changes.year !== undefined) patch.year = changes.year
  if (changes.status !== undefined) patch.status = changes.status

  if (Object.keys(patch).length === 0) {
    const { data, error } = await supabase.from('students').select(SELECT_WITH_PASS).eq('student_number', id).single()
    if (error) throw error
    return mapStudentRow(data as unknown as StudentRow)
  }

  // Update and re-select in one request: if the WHERE match hits 0 rows (bad id, RLS denying the
  // write, etc.), Supabase's UPDATE itself reports no error — it's `.select().single()` here that
  // turns a no-op update into a real, catchable error instead of silently returning stale data
  // from a separate, unconditional re-fetch.
  const { data, error } = await supabase
    .from('students')
    .update(patch)
    .eq('student_number', id)
    .select(SELECT_WITH_PASS)
    .single()

  if (error) throw error
  return mapStudentRow(data as unknown as StudentRow)
}
