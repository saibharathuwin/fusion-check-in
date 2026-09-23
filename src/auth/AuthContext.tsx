import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import { AuthContext, type SignInResult, type StaffRole, type StaffUser } from './context'
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js'

// Looks up the authenticated user's staff_users row by email — the source of truth for whether
// a Supabase-authenticated account is actually authorized Fusion staff, and what role they hold.
// Returns null only when the row genuinely doesn't exist (maybeSingle's normal "no match" case);
// a real query failure (network drop, timeout — common on a flaky mobile connection) is re-thrown
// instead of silently collapsing into "not authorized", which is what it used to do.
async function fetchStaffUser(email: string): Promise<StaffUser | null> {
  const { data, error } = await supabase
    .from('staff_users')
    .select('id, email, full_name, role')
    .eq('email', email)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return { id: data.id, email: data.email, fullName: data.full_name, role: data.role as StaffRole }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function bootstrap() {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession()
      if (!active) return

      if (initialSession?.user.email) {
        try {
          const staff = await fetchStaffUser(initialSession.user.email)
          if (!active) return
          if (!staff) {
            await supabase.auth.signOut()
            setSession(null)
            setStaffUser(null)
          } else {
            setSession(initialSession)
            setStaffUser(staff)
          }
        } catch {
          // Couldn't verify staff status on load — most likely a transient network hiccup, not
          // proof the account isn't real staff. Leave the real Supabase session alone (don't sign
          // out) so a refresh once the network's back can pick it up correctly; this render just
          // treats them as not-yet-signed-in rather than actively logging them out.
        }
      }
      setLoading(false)
    }

    bootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) setStaffUser(null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string): Promise<SignInResult> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // A dropped connection or timeout (common on a flaky mobile network) surfaces here as the
      // same shape as a wrong password unless it's checked for specifically — without this, staff
      // on a spotty connection see "Invalid email or password" for what's actually a network
      // problem, and have no way to tell the difference.
      if (isAuthRetryableFetchError(error)) {
        return { ok: false, error: "Couldn't reach the server. Check your connection and try again." }
      }
      return { ok: false, error: 'Invalid email or password.' }
    }
    if (!data.user?.email) {
      return { ok: false, error: 'Invalid email or password.' }
    }

    let staff: StaffUser | null
    try {
      staff = await fetchStaffUser(data.user.email)
    } catch {
      await supabase.auth.signOut()
      return { ok: false, error: "Couldn't verify your account. Check your connection and try again." }
    }
    if (!staff) {
      await supabase.auth.signOut()
      return { ok: false, error: "This account isn't authorized as Fusion staff." }
    }

    setSession(data.session)
    setStaffUser(staff)
    return { ok: true, staffUser: staff }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setStaffUser(null)
  }

  return <AuthContext value={{ session, staffUser, loading, signIn, signOut }}>{children}</AuthContext>
}
