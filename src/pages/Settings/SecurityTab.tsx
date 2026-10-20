import { useState, type FormEvent } from 'react'
import { SettingsCard } from './SettingsCard'
import { updateOwnPassword } from './accountSettingsData'
import { handleEnterToAdvance } from '../../lib/formEnterNavigation'

const FIELD_LABEL_CLASSES = 'text-[13px] font-bold text-[#33415c]'

const INPUT_CLASSES =
  'w-full box-border rounded-[10px] border border-[#e2e6ee] bg-[#f7f9fc] px-3.5 py-3 text-sm text-[#12284a] placeholder:text-[#b7c0d1] [transition:border-color_150ms_ease,background-color_150ms_ease,box-shadow_150ms_ease] focus:border-[#0d9488] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,148,136,0.12)] focus:outline-none'

const SAVE_BTN_CLASSES =
  'inline-flex items-center rounded-[10px] border-none bg-[#0d9488] px-4 py-2.5 text-[13.5px] font-bold text-white cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] hover:not-disabled:bg-[#0b7d73] disabled:cursor-not-allowed disabled:opacity-50'

const MIN_PASSWORD_LENGTH = 6

export function SecurityTab() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setMessage({ kind: 'error', text: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` })
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage({ kind: 'error', text: 'Passwords do not match.' })
      return
    }

    setSaving(true)
    try {
      await updateOwnPassword(newPassword)
      setNewPassword('')
      setConfirmPassword('')
      setMessage({ kind: 'success', text: 'Password updated successfully.' })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setMessage({ kind: 'error', text: raw || 'Unable to update your password. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <SettingsCard title="Password & security" description="Change your password to keep your account secure.">
        <form onSubmit={handleSubmit} onKeyDown={handleEnterToAdvance} className="flex flex-col gap-4 px-[22px] py-5">
          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL_CLASSES} htmlFor="security-new-password">
              New password
            </label>
            <input
              id="security-new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              className={INPUT_CLASSES}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL_CLASSES} htmlFor="security-confirm-password">
              Confirm new password
            </label>
            <input
              id="security-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
              className={INPUT_CLASSES}
            />
          </div>

          {message && (
            <div
              className={`rounded-[10px] border px-3.5 py-3 text-[13px] font-semibold ${
                message.kind === 'success' ? 'border-[#b7ebd2] bg-[#e8f8f1] text-[#0f8a54]' : 'border-[#f8c9c9] bg-[#fde8e8] text-[#d1453d]'
              }`}
            >
              {message.text}
            </div>
          )}

          <div>
            <button type="submit" disabled={saving || !newPassword || !confirmPassword} className={SAVE_BTN_CLASSES}>
              {saving ? 'Updating…' : 'Change password'}
            </button>
          </div>
        </form>
      </SettingsCard>
    </div>
  )
}
