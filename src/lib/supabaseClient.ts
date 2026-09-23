import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Add them to your .env file (see .env.example).',
  )
}

// "Stay signed in on this device" (both login pages) — whether the auth session should survive
// closing the browser (localStorage) or only last until the tab/window closes (sessionStorage).
// Read fresh on every storage call rather than baked into the client at creation, so flipping the
// checkbox before a sign-in takes effect without needing a new Supabase client instance.
const PERSIST_PREFERENCE_KEY = 'fusion-auth-persist-v1'

export function getAuthPersistPreference(): boolean {
  try {
    const saved = localStorage.getItem(PERSIST_PREFERENCE_KEY)
    return saved === null ? true : saved === 'true' // default true — matches supabase-js's own default
  } catch {
    return true
  }
}

export function setAuthPersistPreference(persist: boolean): void {
  try {
    localStorage.setItem(PERSIST_PREFERENCE_KEY, String(persist))
  } catch {
    // Preference just won't stick across reloads — the sign-in itself still works either way.
  }
}

// Routes each auth storage read/write to localStorage or sessionStorage based on the live
// preference above, and clears any copy left in the other store so switching the checkbox between
// sign-ins can never leave a stale, still-valid session sitting in the store the person didn't ask
// for.
const dynamicAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return (getAuthPersistPreference() ? localStorage : sessionStorage).getItem(key)
    } catch {
      return null
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      const persist = getAuthPersistPreference()
      ;(persist ? localStorage : sessionStorage).setItem(key, value)
      ;(persist ? sessionStorage : localStorage).removeItem(key)
    } catch {
      // Session just won't persist correctly — not worth throwing over.
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    } catch {
      // ignore
    }
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storage: dynamicAuthStorage, persistSession: true, autoRefreshToken: true },
})
