import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FusionLogo } from '../../components/FusionLogo/FusionLogo'
import { MailIcon, LockIcon, EyeIcon, EyeOffIcon, CheckIcon } from '../../components/icons/NavIcons'
import { useAuth } from '../../auth/useAuth'
import { setAuthPersistPreference } from '../../lib/supabaseClient'

const FIELD_LABEL_CLASSES = 'text-[13px] font-bold tracking-[0.2px] text-white/60'

const INPUT_CLASSES =
  'w-full box-border rounded-[12px] border border-white/10 bg-white/[0.06] py-3.5 pr-4 pl-11 text-[15px] text-white placeholder:text-white/35 [transition:border-color_150ms_ease,background-color_150ms_ease,box-shadow_150ms_ease] focus:border-[#f4b400]/70 focus:bg-white/[0.09] focus:shadow-[0_0_0_3px_rgba(244,180,0,0.15)] focus:outline-none'

// A viewfinder-style corner bracket, reused four times (rotated per corner) around the logo —
// matches StaffLoginPage's own nod to what this login gates access to: the QR scanner.
function CornerBracket({ className }: { className: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#f4b400" strokeWidth="2.5" strokeLinecap="round" className={className}>
      <path d="M1 8V3a2 2 0 0 1 2-2h5" />
    </svg>
  )
}

// A separate entry point from StaffLoginPage, deliberately — this one is for a shared DEVICE
// credential (a "kiosk" staff_users account set up once by an admin, not tied to any individual
// person), not a staff member's own personal email/password. Signing in here is otherwise
// identical: same signIn() call, same session, same /scanner destination — Kiosk Mode itself
// (locking the device to one event/session on a simplified self-service screen) is a separate step
// already built into ScannerPage, entered explicitly once an event is picked there.
export function KioskLoginPage() {
  // Deliberately does NOT auto-redirect to /scanner just because a session already exists —
  // this page's whole purpose is letting whoever's setting up the device switch it to the shared
  // kiosk account, even when it's currently signed in as a real staff member. signIn() below
  // (supabase.auth.signInWithPassword) replaces whatever session is active regardless.
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [staySignedIn, setStaySignedIn] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    setAuthPersistPreference(staySignedIn)
    const result = await signIn(email.trim(), password)
    setSubmitting(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    navigate('/scanner', { replace: true })
  }

  return (
    <div className="relative box-border flex min-h-screen items-center justify-center overflow-hidden bg-[#0a1730] px-5 py-10">
      <div className="pointer-events-none absolute top-[-120px] left-[-100px] h-[340px] w-[340px] rounded-full bg-[#f4b400]/[0.08] blur-[90px]" />
      <div className="pointer-events-none absolute right-[-120px] bottom-[-120px] h-[380px] w-[380px] rounded-full bg-[#2f6fed]/[0.1] blur-[100px]" />

      <div className="relative flex w-full max-w-[420px] flex-col items-center gap-7">
        <div
          className="relative flex h-[92px] w-[92px] items-center justify-center [animation:fade-in-up_500ms_ease_both]"
          style={{ animationDelay: '0ms' }}
        >
          <CornerBracket className="absolute top-0 left-0" />
          <CornerBracket className="absolute top-0 right-0 rotate-90" />
          <CornerBracket className="absolute right-0 bottom-0 rotate-180" />
          <CornerBracket className="absolute bottom-0 left-0 -rotate-90" />
          <FusionLogo variant="light" width={56} />
        </div>

        <div
          className="flex flex-col items-center gap-1.5 text-center [animation:fade-in-up_500ms_ease_both]"
          style={{ animationDelay: '60ms' }}
        >
          <h1 className="m-0 text-[26px] font-extrabold text-white">Kiosk sign-in</h1>
          <p className="m-0 max-w-[320px] text-[14px] text-white/55">
            Set this device up as a dedicated check-in kiosk — sign in once with the shared kiosk credential, not your own.
          </p>
        </div>

        <div
          className="box-border flex w-full flex-col gap-5 rounded-[20px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-sm [animation:fade-in-up_500ms_ease_both] max-[420px]:p-5"
          style={{ animationDelay: '120ms' }}
        >
          {error && (
            <div className="rounded-[10px] border border-[#f8c9c9]/30 bg-[#f8c9c9]/10 px-3.5 py-3 text-[13px] font-semibold text-[#ff9d9d]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label className={FIELD_LABEL_CLASSES} htmlFor="kiosk-login-email">
                Kiosk email
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-white/35">
                  <MailIcon size={16} />
                </span>
                <input
                  id="kiosk-login-email"
                  type="email"
                  inputMode="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="kiosk@uwindsor.ca"
                  className={INPUT_CLASSES}
                />
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <label className={FIELD_LABEL_CLASSES} htmlFor="kiosk-login-password">
                Kiosk password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-white/35">
                  <LockIcon size={16} />
                </span>
                <input
                  id="kiosk-login-password"
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
                  className="absolute top-1/2 right-3.5 -translate-y-1/2 cursor-pointer border-none bg-transparent p-1 text-white/40 [transition:color_150ms_ease] hover:text-white/80"
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
                className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border [transition:background-color_150ms_ease,border-color_150ms_ease] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#f4b400] ${
                  staySignedIn ? 'border-[#f4b400] bg-[#f4b400]' : 'border-white/25 bg-transparent'
                }`}
              >
                {staySignedIn && <CheckIcon size={12} />}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[13.5px] font-semibold text-white/85">Stay signed in on this device</span>
                <span className="text-[12px] text-white/45">Keep this on — a kiosk tablet should stay signed in indefinitely.</span>
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 w-full rounded-[14px] border-none bg-[#f4b400] px-6 py-[16px] text-[15.5px] font-extrabold text-[#12284a] cursor-pointer [transition:transform_150ms_ease,box-shadow_150ms_ease] shadow-[0_10px_24px_rgba(244,180,0,0.25)] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(244,180,0,0.32)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Set up this kiosk'}
            </button>
          </form>
        </div>

        <p className="m-0 text-[13px] text-white/45 [animation:fade-in-up_500ms_ease_both]" style={{ animationDelay: '180ms' }}>
          Signing in as yourself instead?{' '}
          <Link to="/scanner/login" className="font-bold text-[#f4b400] no-underline hover:underline">
            Go to staff sign-in
          </Link>
        </p>
      </div>
    </div>
  )
}
