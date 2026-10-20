import { supabase } from '../../lib/supabaseClient'
import type { StudentLevel } from '../AddStudent/addStudentData'

export type StudentStatus = 'Active' | 'Alumni' | 'Withdrawn'
export type PassStatus = 'Active' | 'Revoked'

export interface Student {
  // The human-facing student number (students.student_number) — used everywhere in the app as
  // "the student's ID", not the table's own internal uuid primary key. Null for a student
  // imported before their real number was known — see assignStudentNumber below.
  id: string | null
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
  student_number: string | null
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

// Splits a search phrase into individual words — "Noah Kelly" becomes ["Noah", "Kelly"]. Each word
// gets its own chained .or(...) call below, which PostgREST ANDs together with everything else on
// the query. Without this, a two-word name search fails outright: first_name and last_name are
// separate columns, so no single column ever literally contains "Noah Kelly" as one string — only
// matching each word against *some* column (not necessarily the same one) finds the student.
function splitSearchWords(term: string): string[] {
  return term.trim().split(/\s+/).filter(Boolean)
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
  if (trimmedNameQuery) {
    for (const word of splitSearchWords(trimmedNameQuery)) {
      query = query.or(`first_name.ilike.%${word}%,last_name.ilike.%${word}%`)
    }
  }
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
  // Not `head: true` — Supabase's HEAD responses carry a bogus Content-Encoding header on an
  // empty body, which Chromium's network stack aborts client-side (net::ERR_ABORTED) before this
  // ever gets a response. `.limit(1)` keeps the transferred row data to a single id while still
  // getting the real total via the exact count.
  const { count, error } = await supabase.from('students').select('id', { count: 'exact' }).limit(1)
  if (error) throw error
  return count ?? 0
}

// A short query is nearly useless here and actively misleading — every student's email ends in
// "@uwindsor.ca" (so a 1-2 letter search can match almost everyone via email alone), and every
// seeded student_number shares the same "110301..." prefix (so a short numeric search matches
// almost everyone via ID alone too). Numeric-looking queries need a longer minimum than name/email
// text for exactly that reason — a 2-3 digit ID prefix is nowhere near unique, the way 2-3 letters
// of a name usually already are.
const MIN_TEXT_SEARCH_LENGTH = 2
const MIN_NUMERIC_SEARCH_LENGTH = 4

// Matches on name, student number, or email against the real `students` table. A multi-word query
// (e.g. "Noah Kelly") requires each word to match some column, not the whole phrase to match one —
// see splitSearchWords above for why that distinction matters.
export async function searchStudents(queryText: string, limit = 8): Promise<Student[]> {
  const words = splitSearchWords(queryText).filter((w) => w.length >= (/^\d+$/.test(w) ? MIN_NUMERIC_SEARCH_LENGTH : MIN_TEXT_SEARCH_LENGTH))
  if (words.length === 0) return []

  let query = supabase.from('students').select(SELECT_WITH_PASS)
  for (const word of words) {
    query = query.or(`first_name.ilike.%${word}%,last_name.ilike.%${word}%,student_number.ilike.%${word}%,email.ilike.%${word}%`)
  }

  const { data, error } = await query.limit(limit)
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

// Writes to the real `students` table (table: public.students), matched on the table's own uuid
// primary key — not student_number, which can be null for a student whose real number isn't known
// yet (see assignStudentNumber below) and so can't reliably identify a row on its own. Only the
// fields present in `changes` are sent, so callers should pass a diff, not the whole record.
// `changes.id` (student_number) is only meant to go from null to a real value — a caller filling
// in a pending student's number once it's known. It's on the caller to never pass a value here for
// a student who already has a real one; this function enforces no such rule itself.
export async function updateStudent(uuid: string, changes: Partial<Omit<Student, 'uuid' | 'fullName'>>): Promise<Student> {
  const patch: Record<string, unknown> = {}
  if (changes.id !== undefined) patch.student_number = changes.id
  if (changes.firstName !== undefined) patch.first_name = changes.firstName
  if (changes.lastName !== undefined) patch.last_name = changes.lastName
  if (changes.email !== undefined) patch.email = changes.email
  if (changes.faculty !== undefined) patch.faculty = changes.faculty
  if (changes.program !== undefined) patch.program = changes.program
  if (changes.level !== undefined) patch.level = changes.level
  if (changes.year !== undefined) patch.year = changes.year
  if (changes.status !== undefined) patch.status = changes.status

  if (Object.keys(patch).length === 0) {
    const { data, error } = await supabase.from('students').select(SELECT_WITH_PASS).eq('id', uuid).single()
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
    .eq('id', uuid)
    .select(SELECT_WITH_PASS)
    .single()

  if (error) throw error
  const row = data as unknown as StudentRow
  const mapped = mapStudentRow(row)

  // Keep the pass status in sync with student status: Withdrawn revokes it, Active restores it.
  // Best-effort — the student status change itself is what actually matters here, so a hiccup
  // syncing the pass shouldn't undo it or block the caller.
  //
  // row.passes above was fetched in the same request as the student update, i.e. before this
  // sync — mapped.passStatus would still read the stale pre-update value otherwise, so it's
  // overridden directly here rather than trusting it, letting Pass Tools show the true status
  // immediately instead of only after the next reload.
  if (changes.status === 'Withdrawn' || changes.status === 'Active') {
    const nextPassStatus: PassStatus = changes.status === 'Withdrawn' ? 'Revoked' : 'Active'
    const { error: passError } = await supabase
      .from('passes')
      .update({ status: nextPassStatus })
      .eq('student_id', row.id)
    if (!passError) mapped.passStatus = nextPassStatus
  }

  return mapped
}
