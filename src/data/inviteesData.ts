import { supabase } from '../lib/supabaseClient'
import { mapStudentRow, type Student, type StudentRow } from '../pages/StudentDirectory/studentDirectoryData'
import type { DropReason, InviteePeriod } from './inviteePeriods'

// public.event_invitee_periods is a lookup list only — being on it does NOT create a pass or QR
// code. Students check in with their one existing Fusion pass; the list just decides who's allowed,
// and for which sessions.

const STUDENT_SELECT =
  'id, student_number, first_name, last_name, email, faculty, program, level, year, status, created_at, passes(status)'

interface PeriodRow {
  id: string
  event_id: string
  student_id: string
  joined_from_session_id: string | null
  dropped_from_session_id: string | null
  reason: DropReason | null
  note: string | null
  joined_by_name: string | null
  dropped_by_name: string | null
  dropped_at: string | null
  created_at: string
  students: StudentRow | StudentRow[] | null
}

export interface InviteRoster {
  // Every student who has ever been invited to this event, once each, with full profiles.
  students: Student[]
  periods: InviteePeriod[]
}

function toPeriod(row: PeriodRow): InviteePeriod {
  return {
    id: row.id,
    eventId: row.event_id,
    studentId: row.student_id,
    joinedFromSessionId: row.joined_from_session_id,
    droppedFromSessionId: row.dropped_from_session_id,
    reason: row.reason,
    note: row.note,
    joinedByName: row.joined_by_name,
    droppedByName: row.dropped_by_name,
    droppedAt: row.dropped_at,
    createdAt: row.created_at,
  }
}

export async function fetchRoster(eventId: string): Promise<InviteRoster> {
  const { data, error } = await supabase
    .from('event_invitee_periods')
    .select(
      `id, event_id, student_id, joined_from_session_id, dropped_from_session_id, reason, note, joined_by_name, dropped_by_name, dropped_at, created_at, students(${STUDENT_SELECT})`,
    )
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as unknown as PeriodRow[]
  const studentsById = new Map<string, Student>()
  for (const row of rows) {
    if (studentsById.has(row.student_id)) continue
    const s = Array.isArray(row.students) ? row.students[0] : row.students
    if (s) studentsById.set(row.student_id, mapStudentRow(s))
  }

  return { students: [...studentsById.values()], periods: rows.map(toPeriod) }
}

// Student uuids (Student.uuid, not the student number) invited right now — the list the Edit
// event form works from.
export async function fetchInviteeIds(eventId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('event_invitee_periods')
    .select('student_id')
    .eq('event_id', eventId)
    .is('dropped_from_session_id', null)
  if (error) throw error
  return (data ?? []).map((row) => row.student_id as string)
}

// The signed-in staff member's name, recorded on each change so the lists can say who did it.
async function currentStaffName(): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser()
  const email = userData.user?.email ?? null
  if (!email) return null
  const { data: staff } = await supabase.from('staff_users').select('full_name').eq('email', email).maybeSingle()
  return staff?.full_name ?? null
}

// Invites a student from the given session (or from the start, when null).
export async function addInvitee(params: { eventId: string; studentId: string; joinedFromSessionId: string | null }): Promise<void> {
  const joinedByName = await currentStaffName()
  const { error } = await supabase.from('event_invitee_periods').insert({
    event_id: params.eventId,
    student_id: params.studentId,
    joined_from_session_id: params.joinedFromSessionId,
    joined_by_name: joinedByName,
  })
  if (error) throw error
}

// Ends a student's current invite from the given session onward.
export async function dropInvitee(params: {
  eventId: string
  studentId: string
  fromSessionId: string
  reason: DropReason
  note: string | null
}): Promise<void> {
  const droppedByName = await currentStaffName()
  const { error } = await supabase
    .from('event_invitee_periods')
    .update({
      dropped_from_session_id: params.fromSessionId,
      reason: params.reason,
      note: params.note,
      dropped_by_name: droppedByName,
      dropped_at: new Date().toISOString(),
    })
    .eq('event_id', params.eventId)
    .eq('student_id', params.studentId)
    .is('dropped_from_session_id', null)
  if (error) throw error
}

// Invites a previously dropped student again, from the given session onward.
export async function rejoinInvitee(params: { eventId: string; studentId: string; joinedFromSessionId: string }): Promise<void> {
  await addInvitee(params)
}

// Commas and parentheses are PostgREST filter syntax, so they're stripped from the typed query
// rather than passed through — a name never contains them anyway.
export async function searchStudents(query: string): Promise<Student[]> {
  const term = query.trim().replace(/[,()]/g, '')
  if (term.length < 2) return []
  const { data, error } = await supabase
    .from('students')
    .select(STUDENT_SELECT)
    .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,student_number.ilike.%${term}%`)
    .order('last_name', { ascending: true })
    .limit(20)
  if (error) throw error
  return ((data ?? []) as StudentRow[]).map(mapStudentRow)
}

// The Edit event form's list: whoever it adds is invited from the start, and whoever it removes
// is taken off the list entirely (their earlier drop history, if any, stays).
export async function saveInvitees(eventId: string, selectedIds: string[], originalIds: string[]): Promise<void> {
  const original = new Set(originalIds)
  const selected = new Set(selectedIds)

  const added = selectedIds.filter((id) => !original.has(id))
  const removed = originalIds.filter((id) => !selected.has(id))

  if (added.length > 0) {
    const joinedByName = await currentStaffName()
    const { error } = await supabase.from('event_invitee_periods').insert(
      added.map((studentId) => ({ event_id: eventId, student_id: studentId, joined_by_name: joinedByName })),
    )
    if (error) throw error
  }

  if (removed.length > 0) {
    const { error } = await supabase
      .from('event_invitee_periods')
      .delete()
      .eq('event_id', eventId)
      .in('student_id', removed)
      .is('dropped_from_session_id', null)
    if (error) throw error
  }
}
