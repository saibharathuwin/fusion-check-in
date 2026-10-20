import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/useAuth'
import { SettingsCard } from './SettingsCard'
import { updateOwnName, requestEmailChange } from './accountSettingsData'
import { REQUIRED_EMAIL_DOMAIN, isUwindsorEmail } from './emailDomain'
import { handleEnterToAdvance } from '../../lib/formEnterNavigation'

const FIELD_LABEL_CLASSES = 'text-[13px] font-bold text-[#33415c]'

const INPUT_CLASSES =
  'w-full box-border rounded-[10px] border border-[#e2e6ee] bg-[#f7f9fc] px-3.5 py-3 text-sm text-[#12284a] placeholder:text-[#b7c0d1] [transition:border-color_150ms_ease,background-color_150ms_ease,box-shadow_150ms_ease] focus:border-[#0d9488] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,148,136,0.12)] focus:outline-none'

const READONLY_INPUT_CLASSES =
  'w-full box-border rounded-[10px] border border-[#eef1f6] bg-[#f7f9fc] px-3.5 py-3 text-sm text-[#7c8aa0]'

const SAVE_BTN_CLASSES =
  'inline-flex items-center rounded-[10px] border-none bg-[#0d9488] px-4 py-2.5 text-[13.5px] font-bold text-white cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] hover:not-disabled:bg-[#0b7d73] disabled:cursor-not-allowed disabled:opacity-50'

const ROLE_PILL_CLASSES: Record<string, string> = {
  Admin: 'bg-[#d6e7fc] text-[#2f6fed]',
  Staff: 'bg-[#d3f1e2] text-[#12a35c]',
  Kiosk: 'bg-[#fff3d6] text-[#b3790a]',
}

// One-time fallback only, for a row saved before first_name/last_name existed (see
// schema-staff-first-last-name.sql) — guesses first word = first name, rest = last name. Wrong
// for a multi-word first name, which is exactly why the real columns exist now; this only runs
// until that account's next save, after which staffUser.firstName/lastName are always used instead.
function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/)
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') }
}

export function AccountTab() {
  const { staffUser, refreshStaffUser } = useAuth()
  const [firstName, setFirstName] = useState(() => staffUser?.firstName ?? splitName(staffUser?.fullName ?? '').first)
  const [lastName, setLastName] = useState(() => staffUser?.lastName ?? splitName(staffUser?.fullName ?? '').last)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMessage, setProfileMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const [newEmail, setNewEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailMessage, setEmailMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  if (!staffUser) return null

  async function handleProfileSave(e: FormEvent) {
    e.preventDefault()
    setProfileMessage(null)
    if (!firstName.trim() && !lastName.trim()) {
      setProfileMessage({ kind: 'error', text: 'Name cannot be empty.' })
      return
    }
    setSavingProfile(true)
    try {
      await updateOwnName(staffUser!.id, firstName, lastName)
      await refreshStaffUser()
      setProfileMessage({ kind: 'success', text: 'Profile updated successfully.' })
    } catch {
      setProfileMessage({ kind: 'error', text: 'Unable to update your profile. Please try again.' })
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault()
    setEmailMessage(null)
    const trimmed = newEmail.trim()
    if (!trimmed || !trimmed.includes('@')) {
      setEmailMessage({ kind: 'error', text: 'Enter a valid email address.' })
      return
    }
    if (trimmed.toLowerCase() === staffUser!.email.toLowerCase()) {
      setEmailMessage({ kind: 'error', text: 'That’s already your current email.' })
      return
    }
    // Only Admin accounts reach this page today (Settings is Admin-gated), and Admin/Staff logins
    // are both required to be real university addresses — Kiosk is the one exempt, shared login.
    if (!isUwindsorEmail(trimmed)) {
      setEmailMessage({ kind: 'error', text: `Admin accounts must use an email ending in ${REQUIRED_EMAIL_DOMAIN}.` })
      return
    }
    setSavingEmail(true)
    try {
      await requestEmailChange(trimmed)
      setNewEmail('')
      setEmailMessage({
        kind: 'success',
        text: `Confirmation link sent to ${trimmed}. Click it to finish changing your email. Until then, keep signing in with your current email.`,
      })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      const friendly = /already|registered|exists/i.test(raw)
        ? 'That email is already in use by another account.'
        : raw || 'Unable to update your email. Please try again.'
      setEmailMessage({ kind: 'error', text: friendly })
    } finally {
      setSavingEmail(false)
    }
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <SettingsCard title="Profile information" description="Manage your Fusion Hub administrator account.">
        <form onSubmit={handleProfileSave} onKeyDown={handleEnterToAdvance} className="flex flex-col gap-4 px-[22px] py-5">
          <div className="grid grid-cols-2 gap-4 max-[561px]:grid-cols-1">
            <div className="flex flex-col gap-1.5">
              <label className={FIELD_LABEL_CLASSES} htmlFor="account-first-name">
                First name
              </label>
              <input
                id="account-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={INPUT_CLASSES}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={FIELD_LABEL_CLASSES} htmlFor="account-last-name">
                Last name
              </label>
              <input
                id="account-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={INPUT_CLASSES}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 max-[561px]:grid-cols-1">
            <div className="flex flex-col gap-1.5">
              <label className={FIELD_LABEL_CLASSES} htmlFor="account-email-readonly">
                Email
              </label>
              <input id="account-email-readonly" type="email" value={staffUser.email} readOnly className={READONLY_INPUT_CLASSES} />
              <p className="m-0 text-[12px] text-[#9aa6ba]">Use the Email Address section below to change this.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={FIELD_LABEL_CLASSES}>Role</span>
              <div>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-bold ${ROLE_PILL_CLASSES[staffUser.role] ?? ''}`}
                >
                  {staffUser.role}
                </span>
              </div>
              <p className="m-0 text-[12px] text-[#9aa6ba]">Only another admin can change your role, from Staff & Access.</p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL_CLASSES}>Account status</span>
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#d3f1e2] px-3 py-1.5 text-[13px] font-bold text-[#12a35c]">
                <span className="h-[7px] w-[7px] rounded-full bg-[#12a35c]" />
                Active
              </span>
            </div>
          </div>

          {profileMessage && (
            <div
              className={`rounded-[10px] border px-3.5 py-3 text-[13px] font-semibold ${
                profileMessage.kind === 'success' ? 'border-[#b7ebd2] bg-[#e8f8f1] text-[#0f8a54]' : 'border-[#f8c9c9] bg-[#fde8e8] text-[#d1453d]'
              }`}
            >
              {profileMessage.text}
            </div>
          )}

          <div>
            <button type="submit" disabled={savingProfile} className={SAVE_BTN_CLASSES}>
              {savingProfile ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </SettingsCard>

      <SettingsCard
        title="Email address"
        description="Changing your email requires confirming it via a link sent to the new address."
      >
        <form onSubmit={handleEmailSubmit} onKeyDown={handleEnterToAdvance} className="flex flex-col gap-4 px-[22px] py-5">
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL_CLASSES}>Current email</span>
            <input type="email" value={staffUser.email} readOnly className={READONLY_INPUT_CLASSES} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL_CLASSES} htmlFor="account-new-email">
              New email
            </label>
            <input
              id="account-new-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={`name${REQUIRED_EMAIL_DOMAIN}`}
              className={INPUT_CLASSES}
            />
            <p className="m-0 text-[12px] text-[#9aa6ba]">Must end in {REQUIRED_EMAIL_DOMAIN}.</p>
          </div>

          {emailMessage && (
            <div
              className={`rounded-[10px] border px-3.5 py-3 text-[13px] font-semibold ${
                emailMessage.kind === 'success' ? 'border-[#b7ebd2] bg-[#e8f8f1] text-[#0f8a54]' : 'border-[#f8c9c9] bg-[#fde8e8] text-[#d1453d]'
              }`}
            >
              {emailMessage.text}
            </div>
          )}

          <div>
            <button type="submit" disabled={savingEmail || !newEmail.trim()} className={SAVE_BTN_CLASSES}>
              {savingEmail ? 'Sending…' : 'Update email'}
            </button>
          </div>
        </form>
      </SettingsCard>
    </div>
  )
}
