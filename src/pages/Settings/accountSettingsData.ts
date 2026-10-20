import { supabase } from '../../lib/supabaseClient'

// Updates the display name — staff_users.email is deliberately never written here. Syncing it
// optimistically (before the Supabase Auth email change is actually confirmed) risks the next
// staff_users lookup-by-email finding nothing and treating a real admin as unauthorized. See
// requestEmailChange below for the actual email-change flow and why it stays split from this.
//
// Writes first_name/last_name directly (see schema-staff-first-last-name.sql) rather than storing
// only a combined string and re-splitting it on every load — that guess (first word = first name,
// rest = last name) breaks for a multi-word first name. full_name is still written alongside them,
// kept in sync here, since it's what every other read site in the app (nav, topbar, staff roster)
// displays.
export async function updateOwnName(id: string, firstName: string, lastName: string): Promise<void> {
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
  const { error } = await supabase
    .from('staff_users')
    .update({ first_name: firstName.trim(), last_name: lastName.trim(), full_name: fullName })
    .eq('id', id)
  if (error) throw error
}

// Starts Supabase Auth's own email-change flow — a confirmation link goes out, and the login email
// itself doesn't actually change until that link is clicked (Supabase's own behavior, not something
// this app controls). staff_users.email is intentionally NOT updated here; see the header note in
// SecurityTab/AccountTab for why an automatic sync isn't safe to do yet, and what to do instead once
// the new email is confirmed.
export async function requestEmailChange(newEmail: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email: newEmail })
  if (error) throw error
}

// Supabase Auth's own password update — trusts the current session as sufficient proof of identity
// (its default behavior), so no "current password" field is collected; inventing one would just be
// a client-side check with nothing real behind it.
export async function updateOwnPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}
