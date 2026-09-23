import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { FusionLogo } from '../../components/FusionLogo/FusionLogo'
import { MailIcon, LockIcon, EyeIcon, EyeOffIcon, CheckIcon } from '../../components/icons/NavIcons'
import { useAuth } from '../../auth/useAuth'
import { setAuthPersistPreference } from '../../lib/supabaseClient'

const FIELD_LABEL_CLASSES = 'text-[13px] font-bold text-[#33415c]'

const INPUT_CLASSES =
  'w-full box-border rounded-[12px] border border-[#e2e6ee] bg-[#f7f9fc] py-3.5 pr-4 pl-11 text-[15px] text-[#12284a] placeholder:text-[#b7c0d1] [transition:border-color_150ms_ease,background-color_150ms_ease,box-shadow_150ms_ease] focus:border-[#0d9488] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,148,136,0.12)] focus:outline-none'

export function LoginPage() {
  const { session, staffUser, loading, signIn, signOut } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [staySignedIn, setStaySignedIn] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Single source of truth for "what do we do once we're authenticated on this page" — covers
  // both an already-existing session on mount and one that lands mid-submit, so there's no race
  // between a render-time redirect and the submit handler's own follow-up logic.
  useEffect(() => {
    if (loading || !session || !staffUser) return
    if (staffUser.role === 'Admin') {
      navigate('/', { replace: true })
      return
    }
    signOut().then(() => {
      setError('This account only has scanner access. Use the staff sign-in page instead.')
    })
  }, [loading, session, staffUser, navigate, signOut])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    // Set before signing in — the auth client reads this preference live on every storage write,
    // so it has to be in place before signInWithPassword's own session gets persisted.
    setAuthPersistPreference(staySignedIn)
    const result = await signIn(email.trim(), password)
    setSubmitting(false)

    if (!result.ok) {
      setError(result.error)
    }
    // On success, the effect above takes over (redirect if Admin, sign back out otherwise).
  }

  return (
    <div className="relative box-border flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f4fdfc_0%,#f7f9fc_100%)] px-6 py-14">
      {/* Soft ambient glows — purely decorative depth behind the card. */}
      <div className="pointer-events-none absolute top-[-100px] left-[-90px] h-[300px] w-[300px] rounded-full bg-[#0d9488]/[0.07] blur-[90px]" />
      <div className="pointer-events-none absolute right-[-110px] bottom-[-110px] h-[320px] w-[320px] rounded-full bg-[#2f6fed]/[0.06] blur-[100px]" />

      <div className="relative flex w-full max-w-[400px] flex-col items-center gap-7">
        <div className="[animation:fade-in-up_500ms_ease_both]" style={{ animationDelay: '0ms' }}>
          <FusionLogo variant="dark" width={140} />
        </div>

        <div
          className="box-border flex w-full flex-col gap-5 rounded-2xl border border-[#eef6f5] bg-white p-7 shadow-[0_20px_50px_rgba(13,148,136,0.1)] [animation:fade-in-up_500ms_ease_both] max-[480px]:p-5"
          style={{ animationDelay: '80ms' }}
        >
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-[22px] font-extrabold text-[#12284a]">Sign in to Fusion Check-In</h1>
            <p className="m-0 text-[13.5px] text-[#7c8aa0]">Admin access only.</p>
          </div>

          {error && (
            <div className="rounded-[10px] border border-[#f8c9c9] bg-[#fde8e8] px-3.5 py-3 text-[13px] font-semibold text-[#d1453d]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label className={FIELD_LABEL_CLASSES} htmlFor="login-email">
                Email
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[#9aa6ba]">
                  <MailIcon size={16} />
                </span>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@uwindsor.ca"
                  className={INPUT_CLASSES}
                />
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <label className={FIELD_LABEL_CLASSES} htmlFor="login-password">
                Password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[#9aa6ba]">
                  <LockIcon size={16} />
                </span>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
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

            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={staySignedIn}
                onChange={(e) => setStaySignedIn(e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border [transition:background-color_150ms_ease,border-color_150ms_ease] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#0d9488] ${
                  staySignedIn ? 'border-[#0d9488] bg-[#0d9488]' : 'border-[#cfd6e3] bg-transparent'
                }`}
              >
                {staySignedIn && <CheckIcon size={12} />}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[13.5px] font-semibold text-[#33415c]">Stay signed in on this device</span>
                <span className="text-[12px] text-[#9aa6ba]">Turn off on a shared or public computer.</span>
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 w-full rounded-[14px] border-none bg-[linear-gradient(120deg,#0d9488,#14b8a6)] px-6 py-4 text-[15.5px] font-extrabold text-white cursor-pointer [transition:transform_150ms_ease,box-shadow_150ms_ease] shadow-[0_10px_24px_rgba(13,148,136,0.25)] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(13,148,136,0.32)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
