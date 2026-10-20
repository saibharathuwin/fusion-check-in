import { supabase } from '../../lib/supabaseClient'
import type { StaffRole } from '../../auth/context'

export interface StaffRosterRow {
  id: string
  email: string
  fullName: string
  role: StaffRole
}

interface StaffUserRow {
  id: string
  email: string
  full_name: string
  role: StaffRole
}

export async function fetchStaffRoster(): Promise<StaffRosterRow[]> {
  const { data, error } = await supabase.from('staff_users').select('id, email, full_name, role').order('full_name')

  if (error) throw error
  return (data as StaffUserRow[]).map((row) => ({ id: row.id, email: row.email, fullName: row.full_name, role: row.role }))
}

export async function updateStaffRole(id: string, role: StaffRole): Promise<void> {
  const { error } = await supabase.from('staff_users').update({ role }).eq('id', id)
  if (error) throw error
}

// Only revokes this app's access (deletes the staff_users row) — the underlying Supabase Auth
// login isn't touched, since removing that needs the service-role key this app deliberately
// doesn't hold. See CLAUDE.md / this table's RLS policies for why.
export async function removeStaffUser(id: string): Promise<void> {
  const { error } = await supabase.from('staff_users').delete().eq('id', id)
  if (error) throw error
}
