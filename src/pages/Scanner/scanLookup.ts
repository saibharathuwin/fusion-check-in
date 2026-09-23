import { supabase } from '../../lib/supabaseClient'
import type { Student, StudentStatus, PassStatus } from '../StudentDirectory/studentDirectoryData'
import type { StudentLevel } from '../AddStudent/addStudentData'

// The QR now encodes nothing but the pass's raw token (see buildPassQr in qrPassUtils.ts) —
// deliberately not a URL, so a generic camera app or Google Lens has nothing clickable to show,
// only inert text. passes.token is `gen_random_uuid()` with the dashes stripped: exactly 32 hex
// characters. This pattern is just a cheap shape check before the real round trip; the only thing
// that actually decides whether a code is real is whether that exact token exists in `passes`.
const PASS_TOKEN_PATTERN = /^[a-f0-9]{32}$/i

export type ScanStatus = 'valid' | 'revoked' | 'reissued' | 'not-found' | 'invalid-code'

export interface ScanResult {
  status: ScanStatus
  student?: Student
}

interface StudentRow {
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
}

interface LookupPassByTokenRow {
  student_id: string
  pass_status: PassStatus
}

/**
 * Resolves a scanned QR payload to a real pass. The token match itself happens inside
 * lookup_pass_by_token() (schema-lock-pass-tokens.sql) rather than a direct `passes` query —
 * there is no direct SELECT on that table anymore, and deliberately no fallback to a
 * student-number lookup either, because that was exactly what let anyone forge a pass from a
 * guessed ID. A payload that doesn't match a stored token is reported as unrecognized, whatever
 * it looks like.
 */
export async function lookupScannedCode(raw: string): Promise<ScanResult> {
  const trimmed = raw.trim()
  if (!PASS_TOKEN_PATTERN.test(trimmed)) return { status: 'invalid-code' }
  const token = trimmed.toLowerCase()

  const { data: passRows, error: passError } = await supabase.rpc('lookup_pass_by_token', { p_token: token })
  const passRow = (Array.isArray(passRows) ? passRows[0] : passRows) as LookupPassByTokenRow | undefined

  // No such token: a forged code, or one from a pass that no longer exists.
  if (passError || !passRow) return { status: 'invalid-code' }

  const { data: s, error: studentError } = await supabase
    .from('students')
    .select('id, student_number, first_name, last_name, email, faculty, program, level, year, status, created_at')
    .eq('id', passRow.student_id)
    .maybeSingle<StudentRow>()

  if (studentError || !s) return { status: 'not-found' }

  const student: Student = {
    id: s.student_number,
    uuid: s.id,
    firstName: s.first_name,
    lastName: s.last_name,
    fullName: `${s.first_name} ${s.last_name}`.trim(),
    email: s.email,
    faculty: s.faculty,
    program: s.program,
    level: s.level,
    year: s.year,
    status: s.status,
    dateJoined: s.created_at,
    passStatus: passRow.pass_status,
    reissueCount: 0,
  }

  if (passRow.pass_status === 'Revoked') return { status: 'revoked', student }
  return { status: 'valid', student }
}
