import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { FusionLogo } from '../../components/FusionLogo/FusionLogo'
import { LockIcon, EyeIcon, EyeOffIcon } from '../../components/icons/NavIcons'
import { supabase } from '../../lib/supabaseClient'
import { updatePasswordAfterReset } from '../../auth/passwordReset'
import { handleEnterToAdvance } from '../../lib/formEnterNavigation'

const FIELD_LABEL_CLASSES = 'text-[13px] font-bold text-[#33415c]'

const INPUT_CLASSES =
  'w-full box-border rounded-[12px] border border-[#e2e6ee] bg-[#f7f9fc] py-3.5 pr-4 pl-11 text-[15px] text-[#12284a] placeholder:text-[#b7c0d1] [transition:border-color_150ms_ease,background-color_150ms_ease,box-shadow_150ms_ease] focus:border-[#0d9488] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,148,136,0.12)] focus:outline-none'

const MIN_PASSWORD_LENGTH = 6

// How long to wait for Supabase to finish parsing the recovery token out of the URL (its client
// does this automatically on load — detectSessionInUrl, default on) before concluding the link
// itself must be invalid or expired, rather than that it just hasn't finished processing yet.
const RECOVERY_CHECK_TIMEOUT_MS = 4000

type Status = 'checking' | 'ready' | 'invalid'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('checking')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // A recovery link's token becomes a real (if short-lived) session once Supabase's client parses
  // it from the URL — PASSWORD_RECOVERY is the event that confirms that specifically happened,
  // rather than the person just already having an ordinary signed-in session from something else.
  // The getSession() check covers the (rare) case where that parsing finished before this listener
  // was attached; the timeout is what actually reports an invalid/expired link, since Supabase's
  // client doesn't itself surface a "this token was bad" error anywhere else.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setStatus('ready')
    })

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStatus('ready')
    })

    const timeout = setTimeout(() => {
      setStatus((current) => (current === 'checking' ? 'invalid' : current))
    }, RECOVERY_CHECK_TIMEOUT_MS)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await updatePasswordAfterReset(newPassword)
      // Signs out the short-lived recovery session deliberately — forces a real sign-in with the
      // new password next, rather than leaving them silently signed in from the recovery link.
      await supabase.auth.signOut()
      navigate('/login?reset=success', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update your password. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="relative box-border flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f4fdfc_0%,#f7f9fc_100%)] px-6 py-14">
      <div className="pointer-events-none absolute top-[-100px] left-[-90px] h-[300px] w-[300px] rounded-full bg-[#0d9488]/[0.07] blur-[90px]" />
      <div className="pointer-events-none absolute right-[-110px] bottom-[-110px] h-[320px] w-[320px] rounded-full bg-[#2f6fed]/[0.06] blur-[100px]" />

      <div className="relative flex w-full max-w-[400px] flex-col items-center gap-7">
        <FusionLogo variant="dark" width={140} />

        <div className="box-border flex w-full flex-col gap-5 rounded-2xl border border-[#eef6f5] bg-white p-7 shadow-[0_20px_50px_rgba(13,148,136,0.1)] max-[480px]:p-5">
          {status === 'checking' && (
            <div className="flex flex-col gap-1 py-4 text-center">
              <p className="m-0 text-[14px] text-[#7c8aa0]">Verifying your reset link&hellip;</p>
            </div>
          )}

          {status === 'invalid' && (
            <div className="flex flex-col gap-4 text-center">
              <div className="flex flex-col gap-1">
                <h1 className="m-0 text-[20px] font-extrabold text-[#1d1d1f]">Link expired</h1>
                <p className="m-0 text-[13.5px] text-[#7c8aa0]">
                  This password reset link is invalid or has expired. Request a new one from the sign-in page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="w-full rounded-[14px] border-none bg-[linear-gradient(120deg,#0d9488,#14b8a6)] px-6 py-4 text-[15.5px] font-extrabold text-white cursor-pointer [transition:transform_150ms_ease,box-shadow_150ms_ease] shadow-[0_10px_24px_rgba(13,148,136,0.25)] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(13,148,136,0.32)] active:translate-y-0"
              >
                Back to sign in
              </button>
            </div>
          )}

          {status === 'ready' && (
            <>
              <div className="flex flex-col gap-1">
                <h1 className="m-0 text-[22px] font-extrabold text-[#1d1d1f]">Set a new password</h1>
                <p className="m-0 text-[13.5px] text-[#7c8aa0]">Choose a new password for your account.</p>
              </div>

              {error && (
                <div className="rounded-[10px] border border-[#f8c9c9] bg-[#fde8e8] px-3.5 py-3 text-[13px] font-semibold text-[#d1453d]" role="alert">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} onKeyDown={handleEnterToAdvance} noValidate className="flex flex-col gap-4">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLASSES} htmlFor="reset-new-password">
                    New password
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[#9aa6ba]">
                      <LockIcon size={16} />
                    </span>
                    <input
                      id="reset-new-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className={`${INPUT_CLASSES} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute top-1/2 right-3.5 -translate-y-1/2 cursor-pointer border-none bg-transparent p-1 text-[#9aa6ba] [transition:color_150ms_ease] hover:text-[#56617a]"
                    >
                      {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLASSES} htmlFor="reset-confirm-password">
                    Confirm new password
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[#9aa6ba]">
                      <LockIcon size={16} />
                    </span>
                    <input
                      id="reset-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your new password"
                      className={INPUT_CLASSES}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-1 w-full rounded-[14px] border-none bg-[linear-gradient(120deg,#0d9488,#14b8a6)] px-6 py-4 text-[15.5px] font-extrabold text-white cursor-pointer [transition:transform_150ms_ease,box-shadow_150ms_ease] shadow-[0_10px_24px_rgba(13,148,136,0.25)] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(13,148,136,0.32)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Updating…' : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
