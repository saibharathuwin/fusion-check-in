// Cloudflare Pages Function — runs server-side, never shipped to the browser.
//
// The Forgot Password box on every sign-in page deliberately always shows the same generic
// message ("if an account exists, we've sent a link") regardless of whether the email is real —
// that's what stops the box being usable to probe which emails are registered. This endpoint adds
// one more thing that has to stay invisible the same way: each sign-in page (Admin, Staff) is only
// meant to recover accounts with a role that actually belongs there, but the check for that has to
// happen without ever telling the caller whether it passed — same response either way, and the
// real reset email only actually goes out when it does. That role lookup needs the service-role
// key (staff_users' own RLS only lets a signed-in user read their OWN row, and nobody's signed in
// yet at this point), which is exactly why this can't just be a client-side check.
//
// Requires the same two Cloudflare Pages environment variables as add-staff-account.ts:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Secret), SUPABASE_ANON_KEY

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  SUPABASE_ANON_KEY: string
}

interface RequestBody {
  email?: string
  redirectTo?: string
  // Which sign-in page the request came from — decides which roles are allowed to actually
  // receive the email. Kiosk has no forgot-password box today (it's a shared device credential,
  // not an individual one), so there's nothing to add here for it yet.
  surface?: 'admin' | 'staff'
}

const SURFACE_ALLOWED_ROLES: Record<'admin' | 'staff', string[]> = {
  admin: ['Admin'],
  staff: ['Admin', 'Staff'],
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: RequestBody
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400)
  }

  const email = (body.email ?? '').trim().toLowerCase()
  const redirectTo = body.redirectTo ?? ''
  const surface = body.surface

  // Never a 400 for "email not found" or "wrong role" — those get silently swallowed below,
  // exactly like Supabase's own recovery endpoint already does for an email that isn't registered
  // at all. Only a genuinely malformed request (missing fields) is rejected outright.
  if (!email || !email.includes('@') || !redirectTo || !surface || !(surface in SURFACE_ALLOWED_ROLES)) {
    return jsonResponse({ error: 'Invalid request.' }, 400)
  }

  const role = await lookupStaffRole(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, email)
  if (role && SURFACE_ALLOWED_ROLES[surface].includes(role)) {
    await triggerRecoveryEmail(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, email, redirectTo)
  }

  // Identical response on every path — role mismatch, unregistered email, and a genuine match all
  // look the same from here, same as the message the UI shows never changes either.
  return jsonResponse({ ok: true }, 200)
}

async function lookupStaffRole(url: string, serviceRoleKey: string, email: string): Promise<string | null> {
  const res = await fetch(`${url}/rest/v1/staff_users?select=role&email=eq.${encodeURIComponent(email)}`, {
    headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
  })
  if (!res.ok) return null
  const rows = (await res.json()) as { role: string }[]
  return rows[0]?.role ?? null
}

async function triggerRecoveryEmail(url: string, anonKey: string, email: string, redirectTo: string): Promise<void> {
  // The same request supabase-js's own resetPasswordForEmail(email, { redirectTo }) makes — this
  // function stands in front of it only to decide WHETHER to make it, never how.
  await fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}
