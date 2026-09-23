import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import jsQR from 'jsqr'
import { FusionLogo } from '../../components/FusionLogo/FusionLogo'
import { useAuth } from '../../auth/useAuth'
import { supabase } from '../../lib/supabaseClient'
import {
  CalendarIcon,
  ClockIcon,
  ChevronLeftIcon,
  CheckCircleIcon,
  CameraFlipIcon,
  ExpandIcon,
  LockIcon,
} from '../../components/icons/NavIcons'
import { lookupScannedCode, type ScanResult, type ScanStatus } from './scanLookup'
import { getScannableEvents, type ScannableEvent } from './sessionPicker'
import { recordCheckIn, type CheckInOutcome } from '../../data/attendanceData'
import { sessionWindowStatus, type EventSession } from '../../data/sessionsData'

const SCAN_INTERVAL_MS = 200 // throttle jsQR decode attempts; camera frames arrive far faster than we need
const RESULT_AUTO_DISMISS_MS = 4000
const SESSION_STORAGE_KEY = 'fusion-scanner-session-v1'
const CAMERA_FACING_STORAGE_KEY = 'fusion-scanner-camera-facing-v1'
const KIOSK_STORAGE_KEY = 'fusion-scanner-kiosk-v1'
const RECENT_SCANS_LIMIT = 3
// How long a long-press on the discreet corner dot must be held before the kiosk-exit prompt
// appears — long enough that a student brushing or tapping it by accident won't trigger it.
const KIOSK_EXIT_HOLD_MS = 1800

type CameraState = 'starting' | 'ready' | 'denied' | 'unavailable'
type ResultTheme = 'green' | 'amber' | 'red' | 'gray'
// 'environment' is the rear camera (staff holding the device, scanning outward) and 'user' is the
// front camera (a kiosk device propped up facing the student, e.g. an iPad on a stand).
type CameraFacing = 'environment' | 'user'

interface KioskConfig {
  eventId: string
  sessionId: string | null // the manually-picked session at activation time, if any — null means "auto"
}

function loadCameraFacing(): CameraFacing {
  try {
    const saved = localStorage.getItem(CAMERA_FACING_STORAGE_KEY)
    return saved === 'user' ? 'user' : 'environment'
  } catch {
    return 'environment'
  }
}

function loadKioskConfig(): KioskConfig | null {
  try {
    const raw = localStorage.getItem(KIOSK_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<KioskConfig>
    return typeof parsed.eventId === 'string' ? { eventId: parsed.eventId, sessionId: parsed.sessionId ?? null } : null
  } catch {
    return null
  }
}

// The picker shows one card per EVENT (ScannableEvent already groups an event with all of its
// sessions) — which specific session to scan into is resolved automatically from the current time
// once an event is picked, not chosen up front. See pickActiveSession below.
type ScanTarget = ScannableEvent

// The session whose window is open right now, among an event's sessions — or null if none is
// (the gap between yesterday's close_time and tomorrow's open_time, say). Sessions are already
// sorted ascending by date/open_time (getSessionsForEvent), so the first open match is the right
// one even on the rare day two windows overlap.
function pickActiveSession(sessions: EventSession[], now: Date): EventSession | null {
  return sessions.find((s) => sessionWindowStatus(s, now) === 'open') ?? null
}

// Either a rejected pass (ScanStatus, e.g. revoked/unrecognized) or — once the pass itself checks
// out — the event-policy outcome from the atomic record_check_in() call (checked in, already
// checked in, not invited, at capacity). Kept as one discriminated shape so the result card only
// ever has one thing to render.
type DisplayResult =
  | { kind: 'pass'; status: ScanStatus; student?: ScanResult['student'] }
  | { kind: 'checkin'; outcome: CheckInOutcome; checkedInAt: string | null; student: NonNullable<ScanResult['student']> }

interface RecentScan {
  studentId: string
  fullName: string
  program: string
  outcome: CheckInOutcome
  time: string
}

const PASS_STATUS_COPY: Record<ScanStatus, { label: string; theme: ResultTheme }> = {
  valid: { label: 'Pass valid', theme: 'green' },
  revoked: { label: 'Pass revoked', theme: 'red' },
  reissued: { label: 'Old pass — reissued since', theme: 'amber' },
  'not-found': { label: 'Student not found', theme: 'gray' },
  'invalid-code': { label: 'Not a recognized Fusion pass', theme: 'gray' },
}

const CHECKIN_OUTCOME_COPY: Record<CheckInOutcome, { label: string; theme: ResultTheme }> = {
  checked_in: { label: 'Checked In', theme: 'green' },
  already_checked_in: { label: 'Already Checked In', theme: 'amber' },
  not_invited: { label: 'Not invited to this event', theme: 'red' },
  at_capacity: { label: 'Event at capacity', theme: 'red' },
  // Reachable if the window closes/hasn't opened between when the Scanner's own pre-camera check
  // ran and the moment this scan actually completes — the database is the real enforcement, this
  // copy just keeps the message clear on the rare occasion the client-side gate is stale.
  session_not_started: { label: "This session hasn't opened yet", theme: 'red' },
  session_closed: { label: 'Check-in window closed for this session', theme: 'red' },
  session_not_found: { label: 'Session no longer available', theme: 'red' },
  event_not_found: { label: 'Event no longer available', theme: 'red' },
}

const THEME_CLASSES: Record<ResultTheme, string> = {
  green: 'border-[#b7ebd2] bg-[#e8f8f1]',
  amber: 'border-[#fbedc0] bg-[#fff8e1]',
  red: 'border-[#f8c9c9] bg-[#fde8e8]',
  gray: 'border-[#e2e6ee] bg-[#f2f5fa]',
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function ScannerPage() {
  const { staffUser, signOut } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanningRef = useRef(true) // paused while a result card is showing
  const lastCodeRef = useRef<string | null>(null)

  const [cameraState, setCameraState] = useState<CameraState>('starting')
  const [result, setResult] = useState<DisplayResult | null>(null)
  const [recentScans, setRecentScans] = useState<RecentScan[]>([])
  // Which physical camera to request — persisted per device so a kiosk iPad remembers "front
  // camera" across reloads instead of defaulting back to the rear camera every time.
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>(loadCameraFacing)

  const [scannableEvents, setScannableEvents] = useState<ScannableEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  // The event currently being scanned into (with all of its sessions) — null while the card list
  // is showing and nothing's picked yet.
  const [target, setTarget] = useState<ScanTarget | null>(null)
  // Set only when staff explicitly pick a session below the auto-detected one (e.g. to check
  // someone into tomorrow's session early) — null means "use whichever session is open right now".
  const [manualSessionId, setManualSessionId] = useState<string | null>(null)

  // Kiosk Mode: once active, the device stays locked to this one event/session on a simplified
  // self-service screen — no staff picker, no Log out, no recent-scans list (which would otherwise
  // leak other students' names to whoever's standing at a public-facing device). Persisted so the
  // lock survives a reload (a student triggering a refresh lands back in kiosk, not the staff UI) —
  // the exit path below is the only way out.
  const [kioskConfig, setKioskConfig] = useState<KioskConfig | null>(loadKioskConfig)
  const kioskMode = kioskConfig !== null
  // The discreet exit flow: a long-press on a small corner dot reveals a password prompt.
  const [kioskExitPromptOpen, setKioskExitPromptOpen] = useState(false)
  const [kioskExitPassword, setKioskExitPassword] = useState('')
  const [kioskExitError, setKioskExitError] = useState('')
  const [kioskExitVerifying, setKioskExitVerifying] = useState(false)
  // Drives a visible fill/progress ring on the dot while held — without this, holding it gives no
  // feedback at all, so there's no way to tell "my press is registering, keep holding" apart from
  // "nothing is happening".
  const [kioskExitHolding, setKioskExitHolding] = useState(false)
  const kioskExitHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A second, independent way to trigger the same prompt — 5 plain taps within 2 seconds. A
  // full press-and-release cycle is a much simpler gesture for a touchscreen to get right than
  // "hold for exactly this long without the browser deciding it's a scroll", so this stays
  // reliable even if the long-press above runs into a touch-handling quirk on some device.
  const kioskExitTapCount = useRef(0)
  const kioskExitTapResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (kioskExitHoldTimer.current) clearTimeout(kioskExitHoldTimer.current)
      if (kioskExitTapResetTimer.current) clearTimeout(kioskExitTapResetTimer.current)
    }
  }, [])

  // Ticks every 30s (matching the periodic-refresh interval already used elsewhere in this app,
  // e.g. EventAnalysisPage) so a session that was "not open yet" automatically becomes scannable
  // once its open time arrives, without staff needing to back out and re-select the card.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(interval)
  }, [])

  const autoSession = target ? pickActiveSession(target.sessions, now) : null
  const activeSession = target ? (target.sessions.find((s) => s.id === manualSessionId) ?? autoSession) : null
  // null activeSession with a target picked means the gap case: no session's window is open right
  // now and nothing was manually chosen either — handled as its own message below, distinct from
  // "this one session is closed" (which only happens once a specific session IS selected).
  const windowStatus = activeSession ? sessionWindowStatus(activeSession, now) : null

  // The decode loop below deliberately subscribes only on cameraState, so the function it captured
  // would otherwise keep reading whichever event/session was selected at that moment. Tapping a
  // different card doesn't restart the camera, so without these refs a scan would be judged (and
  // recorded) against a stale event or session.
  const targetRef = useRef(target)
  useEffect(() => {
    targetRef.current = target
  }, [target])
  const activeSessionRef = useRef(activeSession)
  useEffect(() => {
    activeSessionRef.current = activeSession
  }, [activeSession])

  // Load the real scannable events once on mount, then pick which event to start on. Kiosk Mode
  // (if it was active before a reload) takes absolute priority — a device locked into kiosk stays
  // locked to that event/session regardless of any `?event=` link, so navigating the URL directly
  // can't be used to bypass it. Otherwise a `?event=` URL (from the Analysis page's "Scanner"
  // button) wins — its `?session=`, if present, becomes a manual override; failing that, fall back
  // to the last-used event for this device (a shared check-in phone/tablet shouldn't need
  // re-picking every time it's reopened), if it's still available.
  useEffect(() => {
    let cancelled = false
    getScannableEvents().then((entries) => {
      if (cancelled) return
      setScannableEvents(entries)
      setLoadingEvents(false)

      if (entries.length === 0) return

      if (kioskConfig) {
        const kioskEntry = entries.find((e) => e.event.id === kioskConfig.eventId)
        if (kioskEntry) {
          setTarget(kioskEntry)
          if (kioskConfig.sessionId && kioskEntry.sessions.some((s) => s.id === kioskConfig.sessionId)) {
            setManualSessionId(kioskConfig.sessionId)
          }
        } else {
          // The kiosk-configured event is no longer scannable (deleted, completed, etc.) — nothing
          // left to lock to, so fall back to the normal picker rather than stranding the device.
          clearKioskConfig()
        }
        return
      }

      const linkedEventId = searchParams.get('event')
      const linkedSessionId = searchParams.get('session')
      if (linkedEventId) {
        const linkedEntry = entries.find((e) => e.event.id === linkedEventId)
        if (linkedEntry) {
          selectTarget(linkedEntry)
          if (linkedSessionId && linkedEntry.sessions.some((s) => s.id === linkedSessionId)) {
            setManualSessionId(linkedSessionId)
          }
          return
        }
      }

      let saved: { eventId?: string } = {}
      try {
        saved = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}')
      } catch {
        saved = {}
      }
      const entry = entries.find((e) => e.event.id === saved.eventId)
      if (entry) setTarget(entry)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectTarget(next: ScanTarget) {
    setTarget(next)
    setManualSessionId(null)
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ eventId: next.event.id }))
  }

  function changeEvent() {
    setTarget(null)
    setManualSessionId(null)
    setResult(null)
  }

  function clearKioskConfig() {
    setKioskConfig(null)
    try {
      localStorage.removeItem(KIOSK_STORAGE_KEY)
    } catch {
      // ignore — worst case kiosk mode re-activates from stale storage on next load, which is
      // no worse than not persisting at all
    }
  }

  // Locks the device into Kiosk Mode for whatever event/session is currently selected. Requires a
  // real, currently-open session (there's no point kiosking a device with nothing to scan into).
  function enterKioskMode() {
    if (!target || !activeSession) return
    const config: KioskConfig = { eventId: target.event.id, sessionId: manualSessionId }
    setKioskConfig(config)
    try {
      localStorage.setItem(KIOSK_STORAGE_KEY, JSON.stringify(config))
    } catch {
      // Persistence failing just means it won't survive a reload — kiosk mode itself still works
      // for this session, so this isn't worth blocking on.
    }
  }

  function startKioskExitHold() {
    // Clear any timer already running first — a real touch fires both `touchstart` and a
    // synthetic, slightly-delayed `mousedown` on most mobile browsers, which would otherwise
    // leave two timers racing each other.
    if (kioskExitHoldTimer.current) clearTimeout(kioskExitHoldTimer.current)
    setKioskExitHolding(true)
    kioskExitHoldTimer.current = setTimeout(() => {
      setKioskExitHolding(false)
      setKioskExitPromptOpen(true)
      setKioskExitPassword('')
      setKioskExitError('')
    }, KIOSK_EXIT_HOLD_MS)
  }

  function cancelKioskExitHold() {
    setKioskExitHolding(false)
    if (kioskExitHoldTimer.current) {
      clearTimeout(kioskExitHoldTimer.current)
      kioskExitHoldTimer.current = null
    }
  }

  // 5 taps within 2 seconds also opens the exit prompt — see the note by kioskExitTapCount above
  // for why this exists alongside the long-press.
  function handleKioskExitTap() {
    kioskExitTapCount.current += 1
    if (kioskExitTapResetTimer.current) clearTimeout(kioskExitTapResetTimer.current)

    if (kioskExitTapCount.current >= 5) {
      kioskExitTapCount.current = 0
      setKioskExitPromptOpen(true)
      setKioskExitPassword('')
      setKioskExitError('')
      return
    }

    kioskExitTapResetTimer.current = setTimeout(() => {
      kioskExitTapCount.current = 0
    }, 2000)
  }

  // Re-verifies the CURRENTLY signed-in staff member's own password before letting kiosk mode be
  // exited — a real password check via Supabase, not a client-side string compare that anyone
  // could bypass by reading the page source. The underlying sign-in session is untouched either
  // way (kiosk mode never signs anyone out), this only gates whether the locked-down UI drops away.
  async function confirmKioskExit(e: FormEvent) {
    e.preventDefault()
    if (!staffUser) return
    setKioskExitVerifying(true)
    setKioskExitError('')
    const { error } = await supabase.auth.signInWithPassword({ email: staffUser.email, password: kioskExitPassword })
    setKioskExitVerifying(false)
    if (error) {
      setKioskExitError('Incorrect password.')
      return
    }
    clearKioskConfig()
    setKioskExitPromptOpen(false)
    setKioskExitPassword('')
  }

  async function handleLogout() {
    await signOut()
    navigate('/scanner/login', { replace: true })
  }

  // True once any camera stream has successfully started — used below to tell "the very first
  // start" apart from "restarting after switching cameras", since only the latter needs the
  // release delay (see startCamera).
  const hadStreamRef = useRef(false)

  // Start the camera once a session is picked, stop it on unmount (never leave a live camera
  // stream running once the staff member navigates away or switches sessions) — and restart it
  // whenever cameraFacing changes (the front/back switch below).
  useEffect(() => {
    if (!target || windowStatus !== 'open') return
    let cancelled = false
    // Captured once, up front — the video element itself never remounts while this effect is
    // live (only its srcObject changes), so this stays valid for the cleanup below even though
    // videoRef.current could in principle point elsewhere by the time an unrelated render happens.
    const videoEl = videoRef.current
    // Growing pause between retries — see the catch block below for why more than one is needed.
    const RETRY_DELAYS_MS = [500, 900, 1400]

    async function startCamera(attempt = 0) {
      setCameraState('starting')
      // On real phone hardware (unlike the fake camera this was originally tested against),
      // requesting a *different physical camera* right after stopping the previous stream often
      // fails — the OS hasn't finished releasing it yet. A brief pause before asking for the new
      // one gives that teardown time to finish. Only needed when there's actually a previous
      // camera to hand back, not on the very first start.
      if (hadStreamRef.current && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 400))
        if (cancelled) return
      }
      try {
        // `ideal` (not an exact/hard constraint) so a device with only one camera — an older iPad
        // without a front camera, say — still gets *a* working camera instead of throwing
        // OverconstrainedError just because its exact preference isn't available.
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: cameraFacing } } })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        hadStreamRef.current = true
        if (videoEl) {
          videoEl.srcObject = stream
          await videoEl.play()
        }
        setCameraState('ready')
      } catch (err) {
        if (cancelled) return
        // Permission denial won't fix itself on a retry — anything else (the camera still
        // mid-teardown from the last stream, a momentary hardware busy state, etc.) might, so
        // retry a few times with a growing pause before finally giving up. Real Android devices
        // have shown up needing more than one retry here, unlike this app's earlier fake-camera
        // testing, which can't reproduce hardware release delays at all.
        const deniedOutright = err instanceof DOMException && err.name === 'NotAllowedError'
        if (!deniedOutright && attempt < RETRY_DELAYS_MS.length) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
          if (!cancelled) startCamera(attempt + 1)
          return
        }
        setCameraState(deniedOutright ? 'denied' : 'unavailable')
      }
    }

    startCamera()

    return () => {
      cancelled = true
      // Detach the stream from the <video> element before stopping its tracks, not after — on
      // some Android browsers, a stopped stream still referenced by srcObject can keep the camera
      // hardware marked "in use", which is exactly what makes the *next* getUserMedia call fail.
      if (videoEl) {
        videoEl.pause()
        videoEl.srcObject = null
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    // windowStatus flips at most once every 30s (the `now` tick above) — re-running this effect
    // only when it actually changes value (not on every tick) avoids needlessly restarting an
    // already-live camera stream.
  }, [target, windowStatus, cameraFacing])

  function switchCamera() {
    setCameraFacing((prev) => {
      const next: CameraFacing = prev === 'environment' ? 'user' : 'environment'
      try {
        localStorage.setItem(CAMERA_FACING_STORAGE_KEY, next)
      } catch {
        // fine — the switch still works for this session, it just won't be remembered on reload
      }
      return next
    })
  }

  const resumeScanning = useCallback(() => {
    setResult(null)
    lastCodeRef.current = null
    scanningRef.current = true
  }, [])

  async function handleDecoded(raw: string) {
    const current = targetRef.current
    const currentSession = activeSessionRef.current
    const scanResult = await lookupScannedCode(raw)

    if (scanResult.status !== 'valid' || !scanResult.student || !current || !currentSession) {
      setResult({ kind: 'pass', status: scanResult.status, student: scanResult.student })
      return
    }

    const student = scanResult.student

    // One atomic database call decides everything about whether this scan is allowed — already
    // checked in, invite-only gate, capacity gate — and records it if so, against the specific
    // session that was open (auto-detected or manually chosen) at the moment of the scan. See
    // supabase/schema-atomic-checkin.sql: the whole decision happens inside one Postgres
    // transaction, so two staff scanning at nearly the same moment can never both succeed where
    // only one should (e.g. the last capacity slot, or the same student twice).
    const attempt = await recordCheckIn({ eventId: current.event.id, sessionId: currentSession.id, studentUuid: student.uuid })

    setResult({ kind: 'checkin', outcome: attempt.outcome, checkedInAt: attempt.checkedInAt, student })

    if (attempt.outcome === 'checked_in') {
      setRecentScans((prev) =>
        [
          {
            studentId: student.id,
            fullName: student.fullName,
            program: student.program,
            outcome: attempt.outcome,
            time: attempt.checkedInAt ?? new Date().toISOString(),
          },
          ...prev,
        ].slice(0, RECENT_SCANS_LIMIT),
      )
    }
  }

  // Decode loop: grab the current video frame onto an offscreen canvas and hand the pixels to
  // jsQR. Throttled to a fixed interval rather than every animation frame — a QR scan doesn't
  // need 60fps decode attempts, just enough to feel instant.
  useEffect(() => {
    if (cameraState !== 'ready') return
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    let raf = 0
    let lastAttempt = 0

    function tick(timestamp: number) {
      raf = requestAnimationFrame(tick)
      if (!scanningRef.current) return
      if (timestamp - lastAttempt < SCAN_INTERVAL_MS) return
      lastAttempt = timestamp
      if (!canvas || !ctx || !video || video.videoWidth === 0 || video.videoHeight === 0) return

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)

      if (code && code.data && code.data !== lastCodeRef.current) {
        lastCodeRef.current = code.data
        scanningRef.current = false
        handleDecoded(code.data)
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // Intentionally keyed only to cameraState so the loop isn't torn down and rebuilt on every
    // scan — handleDecoded reads the live event/session through selectionRef, not this closure.
  }, [cameraState])

  useEffect(() => {
    if (!result) return
    const timer = setTimeout(resumeScanning, RESULT_AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [result, resumeScanning])

  // One place that turns a DisplayResult into what the result card actually renders — keeps the
  // JSX below from re-deriving this per branch.
  const resultDisplay = (() => {
    if (!result) return null
    if (result.kind === 'pass') {
      const copy = PASS_STATUS_COPY[result.status]
      return { theme: copy.theme, header: copy.label, student: result.student, checkedInAt: null as string | null, fresh: false, already: false }
    }
    const copy = CHECKIN_OUTCOME_COPY[result.outcome]
    return {
      theme: copy.theme,
      header: copy.label,
      student: result.student as ScanResult['student'],
      checkedInAt: result.checkedInAt,
      fresh: result.outcome === 'checked_in',
      already: result.outcome === 'already_checked_in',
    }
  })()

  return (
    <div className="relative box-border flex min-h-screen flex-col bg-[#0d1f39] text-white">
      {/* Discreet Kiosk-exit affordance — present at all times (not just in kiosk mode) so its
          position never changes, but styled to nearly disappear against the header background.
          Two independent ways to trigger it, neither of which a random student is likely to
          stumble into: a long-press (the ring fills in over the hold so it's clear a press is
          registering — `touch-action: none` stops mobile browsers from treating the hold as an
          attempted scroll/zoom and cancelling it partway through), or 5 plain taps within 2
          seconds, which stays reliable even on a device where the long-press runs into some
          touch-handling quirk. */}
      <button
        type="button"
        aria-label="Kiosk settings"
        onMouseDown={startKioskExitHold}
        onMouseUp={cancelKioskExitHold}
        onMouseLeave={cancelKioskExitHold}
        onTouchStart={startKioskExitHold}
        onTouchEnd={cancelKioskExitHold}
        onTouchCancel={cancelKioskExitHold}
        onClick={handleKioskExitTap}
        className="absolute top-2 right-2 z-10 flex h-11 w-11 cursor-default items-center justify-center rounded-full border-none bg-transparent [-webkit-tap-highlight-color:transparent] [touch-action:none]"
      >
        <svg width="30" height="30" viewBox="0 0 30 30" className="pointer-events-none">
          <circle cx="15" cy="15" r="12" fill="rgba(255,255,255,0.05)" />
          <circle
            cx="15"
            cy="15"
            r="12"
            fill="none"
            stroke="#f4b400"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 12}
            strokeDashoffset={kioskExitHolding ? 0 : 2 * Math.PI * 12}
            style={{
              transition: kioskExitHolding ? `stroke-dashoffset ${KIOSK_EXIT_HOLD_MS}ms linear` : 'none',
              transform: 'rotate(-90deg)',
              transformOrigin: '50% 50%',
            }}
          />
        </svg>
      </button>

      {!kioskMode && (
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <FusionLogo variant="light" width={100} />
            <span className="inline-flex items-center rounded-full bg-[#f4b400] px-2.5 py-[3px] text-[10px] font-extrabold tracking-[0.6px] text-[#12284a] uppercase">
              Staff
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-[10px] border border-white/20 bg-white/10 px-3.5 py-2 text-[13px] font-bold text-white cursor-pointer [transition:background-color_150ms_ease] hover:bg-white/20"
          >
            Log out
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-col items-center gap-4 px-5 pb-8">
        {loadingEvents ? (
          <div className="mt-10 flex max-w-[320px] flex-col items-center gap-2 text-center">
            <span className="text-[13.5px] font-semibold text-white/70">Loading events&hellip;</span>
          </div>
        ) : scannableEvents.length === 0 ? (
          <div className="mt-10 flex max-w-[320px] flex-col items-center gap-2 text-center">
            <span className="text-[15px] font-bold text-white">No events ready for check-in</span>
            <p className="m-0 text-[13px] text-white/60">
              Once an admin creates an upcoming or active event with a check-in session, it&apos;ll show up here.
            </p>
          </div>
        ) : !target ? (
          <div className="flex w-full max-w-[420px] flex-col gap-2.5">
            <h2 className="m-0 mb-1 text-[11px] font-bold tracking-[0.6px] text-white/50 uppercase">Select an event to check in</h2>
            {scannableEvents.map((entry, index) => (
              <button
                key={entry.event.id}
                type="button"
                onClick={() => selectTarget(entry)}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-left cursor-pointer [animation:fade-in-up_400ms_ease_both] [transition:background-color_150ms_ease,border-color_150ms_ease,transform_150ms_ease] hover:-translate-y-0.5 hover:border-[#f4b400]/50 hover:bg-white/10"
                style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-[14.5px] font-extrabold text-white">{entry.event.program}</span>
                  <span className="flex items-center gap-1.5 text-[12.5px] text-white/60">
                    <CalendarIcon size={13} />
                    {entry.event.dateLabel}
                  </span>
                  <span className="flex items-center gap-1.5 text-[12.5px] text-white/60">
                    <ClockIcon size={13} />
                    {entry.event.timeLabel}
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-[#f4b400]/15 px-2.5 py-1 text-center text-[11.5px] font-bold text-[#f4b400]">
                  {entry.sessions.length > 1 ? `${entry.sessions.length} sessions` : entry.sessions[0].label}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {target && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            {!kioskMode && (
              <>
                <div className="flex w-full max-w-[360px] items-center gap-2.5">
                  <button
                    type="button"
                    onClick={changeEvent}
                    className="inline-flex shrink-0 items-center gap-1 rounded-[9px] border border-white/15 bg-white/5 px-2.5 py-1.5 text-[12px] font-bold text-white/70 cursor-pointer [transition:background-color_150ms_ease] hover:bg-white/10 hover:text-white"
                  >
                    <ChevronLeftIcon size={14} />
                    Change
                  </button>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-white/80">
                    {target.event.program} &middot; {activeSession ? activeSession.label : 'No active session'}
                  </span>
                </div>

                {target.sessions.length > 1 && (
                  <div className="flex w-full max-w-[360px] flex-wrap items-center gap-1.5">
                    <span className="text-[10.5px] font-bold tracking-[0.5px] text-white/40 uppercase">Session:</span>
                    <button
                      type="button"
                      onClick={() => setManualSessionId(null)}
                      className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] ${
                        manualSessionId === null ? 'bg-[#f4b400] text-[#12284a]' : 'bg-white/10 text-white/70 hover:bg-white/15'
                      }`}
                    >
                      Auto{autoSession ? ` · ${autoSession.label}` : ''}
                    </button>
                    {target.sessions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setManualSessionId(s.id)}
                        className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] ${
                          manualSessionId === s.id ? 'bg-[#f4b400] text-[#12284a]' : 'bg-white/10 text-white/70 hover:bg-white/15'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {kioskMode && (
              <h1 className="m-0 max-w-[420px] px-4 text-center text-[26px] leading-tight font-extrabold text-white">
                Scan your Fusion Pass to check in
              </h1>
            )}

            {/* The scan area scales with the actual device rather than a couple of fixed
                breakpoints — `min()` of viewport width AND height means a big iPad or a desktop
                browser genuinely gets a larger camera view, while a short landscape phone still
                fits without the square overflowing the screen. Kiosk mode goes larger still,
                since it's meant for a stand-mounted device viewed from a few feet away. */}
            <div
              className="relative aspect-square overflow-hidden rounded-[24px] bg-black shadow-[0_20px_50px_rgba(0,0,0,0.4)]"
              style={{ width: kioskMode ? 'min(90vw, 64vh, 720px)' : 'min(85vw, 58vh, 520px)' }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                className={`h-full w-full object-cover ${cameraFacing === 'user' ? '-scale-x-100' : ''}`}
              />
              <canvas ref={canvasRef} className="hidden" />

              {!kioskMode && windowStatus === 'open' && (
                <button
                  type="button"
                  onClick={switchCamera}
                  aria-label="Switch camera"
                  className="absolute top-3 right-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white cursor-pointer backdrop-blur-sm [transition:background-color_150ms_ease] hover:bg-black/65"
                >
                  <CameraFlipIcon size={18} />
                </button>
              )}

              {!activeSession && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                  <span className="text-[14px] font-bold text-white">No session currently active for this event</span>
                  <p className="m-0 text-[13px] text-white/70">
                    {target.sessions.length > 1
                      ? 'Pick a specific session above to check someone in early or late, or wait for the next one to open.'
                      : "This screen updates automatically once the event's check-in window opens."}
                  </p>
                </div>
              )}

              {activeSession && windowStatus !== 'open' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                  <span className="text-[14px] font-bold text-white">
                    {windowStatus === 'not-started' ? "This session hasn't opened yet" : 'Check-in window closed for this session'}
                  </span>
                  <p className="m-0 text-[13px] text-white/70">
                    {windowStatus === 'not-started'
                      ? `Opens at ${formatTime(`${activeSession.date}T${activeSession.openTime}`)}. This screen updates automatically.`
                      : `Closed at ${formatTime(`${activeSession.date}T${activeSession.closeTime}`)}.`}
                  </p>
                </div>
              )}

              {windowStatus === 'open' && cameraState === 'ready' && !result && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-10">
                  <div className="relative h-full w-full overflow-hidden rounded-2xl border-[3px] border-[#f4b400]/90 [animation:scan-pulse_2.4s_ease-in-out_infinite] [box-shadow:0_0_0_9999px_rgba(0,0,0,0.35)]">
                    <div className="absolute inset-x-0 top-0 h-[2px] bg-[linear-gradient(90deg,transparent,#f4b400,transparent)] [animation:scan-sweep_2.2s_ease-in-out_infinite] [box-shadow:0_0_12px_3px_rgba(244,180,0,0.6)]" />
                  </div>
                </div>
              )}

              {windowStatus === 'open' && cameraState === 'starting' && (
                <div className="absolute inset-0 flex items-center justify-center text-[13.5px] font-semibold text-white/80">
                  Starting camera&hellip;
                </div>
              )}

              {windowStatus === 'open' && (cameraState === 'denied' || cameraState === 'unavailable') && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                  <span className="text-[14px] font-bold text-white">
                    {cameraState === 'denied' ? 'Camera access denied' : 'Camera unavailable'}
                  </span>
                  <p className="m-0 text-[13px] text-white/70">
                    {cameraState === 'denied'
                      ? 'Allow camera access in your browser settings, then reload this page.'
                      : "Couldn't start this camera. Tap the camera icon above to try the other one, or reload the page."}
                  </p>
                </div>
              )}

              {result && resultDisplay && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-5">
                  <div
                    className={`flex w-full flex-col gap-3 rounded-2xl border-2 p-5 text-left [animation:result-pop-in_260ms_cubic-bezier(0.34,1.56,0.64,1)_both] ${THEME_CLASSES[resultDisplay.theme]}`}
                  >
                    <div className="flex items-center gap-2 text-[#12284a]">
                      {resultDisplay.fresh && <CheckCircleIcon size={19} />}
                      {resultDisplay.already && <ClockIcon size={19} />}
                      <span className="text-[13px] font-extrabold tracking-[0.4px] uppercase">{resultDisplay.header}</span>
                    </div>

                    {resultDisplay.student ? (
                      <div className="flex flex-col gap-1 text-[#12284a]">
                        <span className="text-[22px] leading-tight font-extrabold">{resultDisplay.student.fullName}</span>
                        <span className="text-[16px] leading-snug font-bold opacity-90">{resultDisplay.student.program}</span>
                        <span className="text-[13px] opacity-70">
                          {resultDisplay.student.faculty} &middot; {resultDisplay.student.year}
                        </span>
                        {resultDisplay.already && resultDisplay.checkedInAt && (
                          <span className="mt-1 text-[12.5px] font-semibold opacity-80">
                            Originally checked in at {formatTime(resultDisplay.checkedInAt)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="m-0 text-[13.5px] text-[#12284a] opacity-80">This code doesn&apos;t match a known Fusion pass.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <p className="m-0 max-w-[320px] text-center text-[13.5px] text-white/70">
              {windowStatus === 'open' && !result
                ? kioskMode
                  ? 'Hold your pass up to the camera.'
                  : "Point the camera at a student's Fusion Pass QR code."
                : ''}
            </p>

            {!kioskMode && activeSession && windowStatus === 'open' && (
              <button
                type="button"
                onClick={enterKioskMode}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-white/15 bg-white/5 px-3.5 py-2 text-[12.5px] font-bold text-white/80 cursor-pointer [transition:background-color_150ms_ease] hover:bg-white/10 hover:text-white"
              >
                <ExpandIcon size={14} />
                Start Kiosk Mode
              </button>
            )}
          </div>
        )}

        {!kioskMode && target && (
          <div className="w-full max-w-[360px]">
            <h2 className="m-0 mb-2 text-[11px] font-bold tracking-[0.6px] text-white/50 uppercase">Recent scans</h2>
            {recentScans.length === 0 ? (
              <p className="m-0 text-[13px] text-white/40">No scans yet.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {recentScans.map((scan, index) => (
                  <li
                    key={`${scan.studentId}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-[10px] bg-white/5 px-3.5 py-2.5"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[13.5px] font-bold text-white">{scan.fullName}</span>
                      <span className="truncate text-[12px] text-white/50">{scan.program}</span>
                    </div>
                    <span className="shrink-0 text-[12px] font-semibold text-white/60">{formatTime(scan.time)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!kioskMode && staffUser && <p className="m-0 mt-2 text-[12px] text-white/40">Signed in as {staffUser.fullName}</p>}
      </div>

      {kioskExitPromptOpen && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-5">
          <form
            onSubmit={confirmKioskExit}
            className="flex w-full max-w-[340px] flex-col gap-4 rounded-2xl border border-white/10 bg-[#12284a] p-6 text-white"
          >
            <div className="flex items-center gap-2">
              <LockIcon size={18} />
              <h2 className="m-0 text-[16px] font-extrabold">Exit Kiosk Mode</h2>
            </div>
            <p className="m-0 text-[13px] text-white/70">
              Enter your password to confirm — this is signed in as {staffUser?.fullName}.
            </p>
            <input
              type="password"
              autoFocus
              value={kioskExitPassword}
              onChange={(e) => setKioskExitPassword(e.target.value)}
              placeholder="Password"
              className="w-full box-border rounded-[10px] border border-white/15 bg-white/10 px-3.5 py-3 text-sm text-white placeholder:text-white/40 [transition:border-color_150ms_ease] focus:border-[#f4b400] focus:outline-none"
            />
            {kioskExitError && <p className="m-0 text-[12.5px] font-semibold text-[#f8a8a8]">{kioskExitError}</p>}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setKioskExitPromptOpen(false)}
                className="flex-1 rounded-[10px] border border-white/15 bg-transparent px-4 py-2.5 text-[13.5px] font-bold text-white/80 cursor-pointer [transition:background-color_150ms_ease] hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={kioskExitVerifying || !kioskExitPassword}
                className="flex-1 rounded-[10px] border-none bg-[#f4b400] px-4 py-2.5 text-[13.5px] font-bold text-[#12284a] cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] hover:not-disabled:bg-[#e0a500] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {kioskExitVerifying ? 'Checking…' : 'Exit'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
