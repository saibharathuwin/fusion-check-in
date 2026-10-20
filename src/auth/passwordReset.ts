import { supabase } from '../lib/supabaseClient'

// Goes through a server function (functions/api/request-password-reset.ts) rather than calling
// supabase.auth.resetPasswordForEmail directly, so that — in addition to Supabase's own "no-op for
// an unregistered email" behavior — an email that IS registered but doesn't have the right role
// for this particular sign-in page (e.g. a Staff-only account used on the Admin sign-in's forgot-
// password box) also doesn't actually receive a reset link. Either way this always resolves
// successfully and the UI always shows the same generic message — never reveals which case it was,
// same reasoning as the "no-op for an unregistered email" behavior it's layered on top of.
export async function requestPasswordReset(email: string, surface: 'admin' | 'staff'): Promise<void> {
  const res = await fetch('/api/request-password-reset', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, surface, redirectTo: `${window.location.origin}/reset-password` }),
  })
  if (!res.ok) throw new Error('Could not request a password reset.')
}

// Only works within the short-lived recovery session Supabase's client establishes automatically
// from the token in the reset-link URL (see supabaseClient.ts's detectSessionInUrl) — there is no
// separate "current password" to check against, same trust model as the Settings password change.
export async function updatePasswordAfterReset(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}
