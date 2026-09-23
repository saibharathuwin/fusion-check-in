import { supabase } from '../lib/supabaseClient'
import { mapStudentRow, type Student, type StudentRow } from '../pages/StudentDirectory/studentDirectoryData'

// public.event_invitees is a lookup list only — being on it does NOT create a pass or QR code.
// Students check in with their one existing Fusion pass; the list just decides who's allowed.

// Student uuids (students.id, i.e. Student.uuid — not the student number) invited to this event.
export async function fetchInviteeIds(eventId: string): Promise<string[]> {
  const { data, error } = await supabase.from('event_invitees').select('student_id').eq('event_id', eventId)
  if (error) throw error
  return (data ?? []).map((row) => row.student_id as string)
}

// How many students are invited — a lightweight count for the Overview tab, without pulling full
// profiles just to measure the list.
export async function countInvitees(eventId: string): Promise<number> {
  const { count, error } = await supabase
    .from('event_invitees')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
  if (error) throw error
  return count ?? 0
}

interface InviteeJoinRow {
  student_id: string
  students: StudentRow | StudentRow[] | null
}

const STUDENT_SELECT =
  'id, student_number, first_name, last_name, email, faculty, program, level, year, status, created_at, passes(status)'

// Full student profiles for the invite list, so it can show name/email/faculty/program/level/
// year/status (and, via mapStudentRow, the same dateJoined/passStatus the Directory's own profile
// card shows) rather than a bare id.
export async function fetchInvitees(eventId: string): Promise<Student[]> {
  const { data, error } = await supabase.from('event_invitees').select(`student_id, students(${STUDENT_SELECT})`).eq('event_id', eventId)
  if (error) throw error

  return (data ?? [])
    .map((raw): Student | null => {
      const row = raw as unknown as InviteeJoinRow
      const s = Array.isArray(row.students) ? row.students[0] : row.students
      return s ? mapStudentRow(s) : null
    })
    .filter((s): s is Student => s !== null)
}

// Diffs the picked list against what's already stored: inserts only the newly added, deletes only
// the removed. Never touches rows that didn't change, and never deletes the whole list first.
export async function saveInvitees(eventId: string, selectedIds: string[], originalIds: string[]): Promise<void> {
  const original = new Set(originalIds)
  const selected = new Set(selectedIds)

  const added = selectedIds.filter((id) => !original.has(id))
  const removed = originalIds.filter((id) => !selected.has(id))

  if (added.length > 0) {
    const { error } = await supabase.from('event_invitees').insert(added.map((studentId) => ({ event_id: eventId, student_id: studentId })))
    if (error) throw error
  }

  if (removed.length > 0) {
    const { error } = await supabase.from('event_invitees').delete().eq('event_id', eventId).in('student_id', removed)
    if (error) throw error
  }
}
