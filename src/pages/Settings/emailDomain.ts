import type { StaffRole } from '../../auth/context'

// Admin and Staff are personal logins tied to a real university staff/volunteer member, so their
// email must be a real @uwindsor.ca address. Kiosk is the one shared, non-personal device login
// (see KioskLoginPage) and is deliberately exempt — it was never meant to represent one person's
// university identity in the first place.
export const REQUIRED_EMAIL_DOMAIN = '@uwindsor.ca'

export function roleRequiresUwindsorEmail(role: StaffRole): boolean {
  return role === 'Admin' || role === 'Staff'
}

export function isUwindsorEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(REQUIRED_EMAIL_DOMAIN)
}
