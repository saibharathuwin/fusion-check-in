import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal/Modal'
import { MailIcon, LockIcon, EyeIcon, EyeOffIcon, CheckCircleIcon } from '../../components/icons/NavIcons'
import type { StaffRole } from '../../auth/context'
import { supabase } from '../../lib/supabaseClient'
import { REQUIRED_EMAIL_DOMAIN, roleRequiresUwindsorEmail, isUwindsorEmail } from './emailDomain'
import { handleEnterToAdvance } from '../../lib/formEnterNavigation'

interface AddStaffDialogProps {
  open: boolean
  onClose: () => void
}

const ROLES: StaffRole[] = ['Admin', 'Staff', 'Kiosk']

const FIELD_LABEL_CLASSES = 'text-[13px] font-bold text-[#33415c]'

const INPUT_CLASSES =
  'w-full box-border rounded-[10px] border border-[#e2e6ee] bg-[#f7f9fc] py-3 pr-3.5 pl-10 text-sm text-[#12284a] placeholder:text-[#b7c0d1] [transition:border-color_150ms_ease,background-color_150ms_ease,box-shadow_150ms_ease] focus:border-[#0d9488] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,148,136,0.12)] focus:outline-none'

const SELECT_CLASSES =
  'w-full box-border rounded-[10px] border border-[#e2e6ee] bg-[#f7f9fc] px-3.5 py-3 text-sm font-semibold text-[#12284a] cursor-pointer [transition:border-color_150ms_ease] hover:border-[#c7d0e0] focus:border-[#0d9488] focus:bg-white focus:outline-none'

// Calls the Cloudflare Pages Function at functions/api/add-staff-account.ts — the only place in
// this app allowed to hold Supabase's service-role key, which is what actually creates the login.
// The caller's own access token goes along so that function can independently verify (via RLS,
// same as every other staff_users read) that whoever's clicking this button is really an Admin,
// not just trust the client to have hidden the button correctly.
async function createStaffAccount(
  firstName: string,
  lastName: string,
  email: string,
  password: string,
  role: StaffRole,
): Promise<{ error?: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return { error: 'Your session expired. Please sign in again.' }

  const res = await fetch('/api/add-staff-account', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ firstName, lastName, email, password, role }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) return { error: data.error ?? 'Something went wrong. Please try again.' }
  return {}
}

function AddStaffDialogContent({ onClose }: { onClose: () => void }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState<StaffRole>('Staff')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [created, setCreated] = useState(false)

  const emailRequired = roleRequiresUwindsorEmail(role)
  const emailValid = !emailRequired || isUwindsorEmail(email)
  const emailTouched = email.trim().length > 0
  const ready =
    (firstName.trim().length > 0 || lastName.trim().length > 0) && email.trim().length > 0 && password.length >= 6 && emailValid

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    setCreating(true)
    setCreateError('')
    const result = await createStaffAccount(firstName.trim(), lastName.trim(), email.trim(), password, role)
    setCreating(false)
    if (result.error) {
      setCreateError(result.error)
      return
    }
    setCreated(true)
  }

  if (created) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e5faf7] text-[#0d9488]">
          <CheckCircleIcon size={26} />
        </span>
        <div>
          <h2 className="m-0 text-lg font-extrabold text-[#1d1d1f]">Account created</h2>
          <p className="m-0 mt-1 text-[13px] text-[#6b7a94]">
            {`${firstName} ${lastName}`.trim()} can now sign in with the email and password you set.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[10px] border-none bg-[#0d9488] px-5 py-2.5 text-[13.5px] font-bold text-white cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#0b7d73]"
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="m-0 text-lg font-extrabold text-[#1d1d1f]">Add a staff account</h2>
        <p className="m-0 mt-1 text-[13px] text-[#6b7a94]">Fill this in and the account is created immediately, no extra steps.</p>
      </div>

      <form onSubmit={handleSubmit} onKeyDown={handleEnterToAdvance} className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-3.5 min-[421px]:flex-row">
          <div className="flex flex-1 flex-col gap-1.5">
            <label className={FIELD_LABEL_CLASSES} htmlFor="add-staff-first-name">
              First name
            </label>
            <input
              id="add-staff-first-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="e.g. Front Desk"
              className="w-full box-border rounded-[10px] border border-[#e2e6ee] bg-[#f7f9fc] px-3.5 py-3 text-sm text-[#12284a] placeholder:text-[#b7c0d1] [transition:border-color_150ms_ease,background-color_150ms_ease,box-shadow_150ms_ease] focus:border-[#0d9488] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,148,136,0.12)] focus:outline-none"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <label className={FIELD_LABEL_CLASSES} htmlFor="add-staff-last-name">
              Last name
            </label>
            <input
              id="add-staff-last-name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="e.g. Kiosk"
              className="w-full box-border rounded-[10px] border border-[#e2e6ee] bg-[#f7f9fc] px-3.5 py-3 text-sm text-[#12284a] placeholder:text-[#b7c0d1] [transition:border-color_150ms_ease,background-color_150ms_ease,box-shadow_150ms_ease] focus:border-[#0d9488] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,148,136,0.12)] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={FIELD_LABEL_CLASSES} htmlFor="add-staff-email">
            Email
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[#9aa6ba]">
              <MailIcon size={15} />
            </span>
            <input
              id="add-staff-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={emailRequired ? `name${REQUIRED_EMAIL_DOMAIN}` : 'name@example.com'}
              aria-invalid={emailTouched && !emailValid}
              aria-describedby={emailTouched && !emailValid ? 'add-staff-email-error' : undefined}
              className={INPUT_CLASSES}
            />
          </div>
          {emailRequired && (
            <p className="m-0 text-[12px] text-[#9aa6ba]">Admin and Staff accounts must use a {REQUIRED_EMAIL_DOMAIN} email.</p>
          )}
          {emailTouched && !emailValid && (
            <p id="add-staff-email-error" role="alert" className="m-0 text-[12px] font-semibold text-[#d1453d]">
              This role requires an email ending in {REQUIRED_EMAIL_DOMAIN}.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={FIELD_LABEL_CLASSES} htmlFor="add-staff-password">
            Password
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[#9aa6ba]">
              <LockIcon size={15} />
            </span>
            <input
              id="add-staff-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className={`${INPUT_CLASSES} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer border-none bg-transparent p-1 text-[#9aa6ba] [transition:color_150ms_ease] hover:text-[#56617a]"
            >
              {showPassword ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={FIELD_LABEL_CLASSES} htmlFor="add-staff-role">
            Role
          </label>
          <select id="add-staff-role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className={SELECT_CLASSES}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {createError && (
          <p role="alert" className="m-0 rounded-[10px] border border-[#f8c9c9] bg-[#fde8e8] px-3.5 py-3 text-[13px] font-semibold text-[#d1453d]">
            {createError}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border-none bg-transparent px-[18px] py-2.5 text-[13.5px] font-bold text-[#7c8aa0] cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] hover:bg-[#f2f5fa] hover:text-[#56617a]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!ready || creating}
            className="rounded-[10px] border-none bg-[#0d9488] px-5 py-2.5 text-[13.5px] font-bold text-white cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] hover:not-disabled:bg-[#0b7d73] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function AddStaffDialog({ open, onClose }: AddStaffDialogProps) {
  return (
    <Modal open={open} onClose={onClose} size="lg">
      {open && <AddStaffDialogContent onClose={onClose} />}
    </Modal>
  )
}
