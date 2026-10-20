import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type StaffRole = 'Admin' | 'Staff' | 'Kiosk'

export interface StaffUser {
  id: string
  email: string
  fullName: string
  // Real first/last name columns (see schema-staff-first-last-name.sql) — undefined only for a
  // row that predates that migration and hasn't been saved through the Account tab since. The
  // Account tab falls back to splitting fullName for that one-time case; everywhere else in the
  // app should keep reading fullName, which stays in sync on every save either way.
  firstName?: string
  lastName?: string
  role: StaffRole
}

export type SignInResult = { ok: true; staffUser: StaffUser } | { ok: false; error: string }

export interface AuthContextValue {
  session: Session | null
  staffUser: StaffUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<SignInResult>
  signOut: () => Promise<void>
  // Re-fetches the current staff_users row and updates it in place — used after a Settings edit
  // (e.g. changing your display name) so the name shown in the nav updates immediately instead of
  // going stale until the next login.
  refreshStaffUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
