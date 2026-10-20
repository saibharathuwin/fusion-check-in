// Cloudflare Pages Function — runs server-side, never shipped to the browser. This is the only
// place in the app allowed to hold the Supabase service-role key, which is what makes it possible
// to actually create a login with a chosen password: the anon/publishable key the rest of the app
// uses is deliberately blocked from that by Supabase itself (creating an arbitrary account is a
// privileged operation, and that key is public — anyone can read it out of the shipped JS bundle).
//
// Requires two things set in the Cloudflare Pages project's environment variables:
//   SUPABASE_URL              - same value as VITE_SUPABASE_URL (not secret)
//   SUPABASE_SERVICE_ROLE_KEY - the "secret key" from Supabase's dashboard (Project Settings ->
//                                API Keys) — must be added as a Secret, never a plain Variable.
//
// Mirrors src/pages/Settings/emailDomain.ts's rule (Admin/Staff need @uwindsor.ca, Kiosk is
// exempt) — duplicated here rather than imported since this file builds separately from the
// client bundle, and this check is the one that actually matters: the client-side copy only
// stops an honest mistake, this is what stops someone bypassing the form entirely.
const REQUIRED_EMAIL_DOMAIN = '@uwindsor.ca'
const VALID_ROLES = ['Admin', 'Staff', 'Kiosk'] as const
type StaffRole = (typeof VALID_ROLES)[number]

function roleRequiresUwindsorEmail(role: StaffRole): boolean {
  return role === 'Admin' || role === 'Staff'
}

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  SUPABASE_ANON_KEY: string
}

interface RequestBody {
  firstName?: string
  lastName?: string
  email?: string
  password?: string
  role?: string
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Every privileged action below is gated on this: the caller must present a real, currently
  // valid Supabase session belonging to an account whose OWN staff_users row already has
  // role = 'Admin'. This reuses the same staff_users_select RLS policy every other read in the
  // app already goes through (a user can always read their own row) — no separate auth system to
  // keep in sync, and no way to fake it without a real Admin's access token.
  const authHeader = request.headers.get('authorization') ?? ''
  const accessToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!accessToken) return jsonResponse({ error: 'Not authenticated.' }, 401)

  const callerClient = createSupabaseRestClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, accessToken)
  const callerRow = await callerClient.selectOwnStaffRow()
  if (!callerRow || callerRow.role !== 'Admin') {
    return jsonResponse({ error: 'Only an Admin can add accounts.' }, 403)
  }

  let body: RequestBody
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400)
  }

  const firstName = (body.firstName ?? '').trim()
  const lastName = (body.lastName ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  const role = body.role as StaffRole

  if (!firstName && !lastName) return jsonResponse({ error: 'Name is required.' }, 400)
  if (!email || !email.includes('@')) return jsonResponse({ error: 'A valid email is required.' }, 400)
  if (password.length < 6) return jsonResponse({ error: 'Password must be at least 6 characters.' }, 400)
  if (!VALID_ROLES.includes(role)) return jsonResponse({ error: 'Invalid role.' }, 400)
  if (roleRequiresUwindsorEmail(role) && !email.endsWith(REQUIRED_EMAIL_DOMAIN)) {
    return jsonResponse({ error: `Admin and Staff accounts must use a ${REQUIRED_EMAIL_DOMAIN} email.` }, 400)
  }

  const adminClient = createSupabaseAdminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const created = await adminClient.createUser(email, password)
  if ('error' in created) return jsonResponse({ error: created.error }, 400)

  const inserted = await adminClient.insertStaffUser(created.id, email, firstName, lastName, role)
  if ('error' in inserted) {
    // The login now exists without a matching staff_users row — same recoverable state as a
    // manual SQL run that stopped partway. Clean up rather than leaving an orphaned login behind.
    await adminClient.deleteUser(created.id)
    return jsonResponse({ error: inserted.error }, 400)
  }

  return jsonResponse({ ok: true }, 200)
}

// Minimal fetch-based Supabase REST/Auth clients — deliberately not the @supabase/supabase-js SDK,
// which pulls in browser-oriented bits (storage, realtime) this one-shot server function has no
// use for. Both talk to the same project; only which key (and therefore which privileges) differs.

function createSupabaseRestClient(url: string, anonKey: string, accessToken: string) {
  return {
    async selectOwnStaffRow(): Promise<{ role: string } | null> {
      const res = await fetch(`${url}/rest/v1/staff_users?select=role`, {
        headers: { apikey: anonKey, authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return null
      const rows = (await res.json()) as { role: string }[]
      return rows[0] ?? null
    },
  }
}

function createSupabaseAdminClient(url: string, serviceRoleKey: string) {
  const headers = { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, 'content-type': 'application/json' }

  return {
    async createUser(email: string, password: string): Promise<{ id: string } | { error: string }> {
      const res = await fetch(`${url}/auth/v1/admin/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, password, email_confirm: true }),
      })
      const data = (await res.json()) as { id?: string; msg?: string; error_description?: string; message?: string }
      if (!res.ok) return { error: data.msg ?? data.error_description ?? data.message ?? 'Could not create the account.' }
      return { id: data.id! }
    },

    async insertStaffUser(
      id: string,
      email: string,
      firstName: string,
      lastName: string,
      role: StaffRole,
    ): Promise<{ ok: true } | { error: string }> {
      const res = await fetch(`${url}/rest/v1/staff_users`, {
        method: 'POST',
        headers: { ...headers, prefer: 'return=minimal' },
        body: JSON.stringify({
          id,
          email,
          full_name: `${firstName} ${lastName}`.trim(),
          first_name: firstName,
          last_name: lastName,
          role,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        return { error: data.message ?? 'Could not save the staff record.' }
      }
      return { ok: true }
    },

    async deleteUser(id: string): Promise<void> {
      await fetch(`${url}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers })
    },
  }
}
