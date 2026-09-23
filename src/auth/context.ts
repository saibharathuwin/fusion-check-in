import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type StaffRole = 'Admin' | 'Staff'

export interface StaffUser {
  id: string
  email: string
  fullName: string
  role: StaffRole
}

export type SignInResult = { ok: true; staffUser: StaffUser } | { ok: false; error: string }

export interface AuthContextValue {
  session: Session | null
  staffUser: StaffUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<SignInResult>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
