import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import jsQR from 'jsqr'
import { FusionLogo } from '../../components/FusionLogo/FusionLogo'
import { useAuth } from '../../auth/useAuth'
import {
  CalendarIcon,
  ClockIcon,
  ChevronLeftIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  CameraFlipIcon,
  FlipHorizontalIcon,
  SunriseIcon,
  SunIcon,
  MoonIcon,
} from '../../components/icons/NavIcons'
import { lookupScannedCode, type ScanResult, type ScanStatus } from './scanLookup'
import { getScannableEvents, type ScannableEvent } from './sessionPicker'
import { recordCheckIn, countStudentCheckIns, type CheckInOutcome, type CheckInStatus } from '../../data/attendanceData'
import { pickOpenSession, sessionWindowStatus, type EventSession } from '../../data/sessionsData'
import { SessionSheet } from './SessionSheet'
import { isKioskDevice } from './kioskDevice'

// Throttles jsQR decode attempts — camera frames arrive far faster than this, so this is purely
// "how often do we bother checking", not a hardware limit. 100ms (10/sec) rather than the original
// 200ms (5/sec): safe to check twice as often now that skipping the inverted-color decode attempt
// (see the jsQR call below) already cut the cost of each individual check roughly in half. Shared
// by both the kiosk and the staff scanner — they run the exact same decode loop.
const SCAN_INTERVAL_MS = 100
// Caps the longer side of the frame actually handed to jsQR for decoding — the camera itself still
// captures and displays at full resolution (1280x720-ish), but searching that whole picture for
// the QR code's finder squares is real, non-trivial CPU work on a weak/old device, even once the
// picture is perfectly clear and in focus. A 640px-wide copy has roughly a quarter the pixels to
// search through, which is still comfortably enough detail to read a QR code held at a normal
// scanning distance — this is a standard balance point, not an unusually aggressive shrink.
const DECODE_MAX_DIMENSION = 640
const RESULT_AUTO_DISMISS_MS = 4000
const SESSION_STORAGE_KEY = 'fusion-scanner-session-v1'
const CAMERA_FACING_STORAGE_KEY = 'fusion-scanner-camera-facing-v1'
type CameraState = 'starting' | 'ready' | 'denied' | 'unavailable'
// 'blue' is sky blue on the kiosk card (KIOSK_THEME_CLASSES) and a plainer royal blue on the staff
// card (STAFF_THEME_CLASSES) — two different color sets share this one key/type since the two
// cards are otherwise built from the same result data, just rendered completely differently.
type ResultTheme = 'blue' | 'green' | 'amber' | 'indigo' | 'red' | 'gray'
// 'environment' is the rear camera (staff holding the device, scanning outward) and 'user' is the
// front camera (a kiosk device propped up facing the student, e.g. an iPad on a stand).
type CameraFacing = 'environment' | 'user'

function loadCameraFacing(): CameraFacing {
  try {
    const saved = localStorage.getItem(CAMERA_FACING_STORAGE_KEY)
    return saved === 'user' ? 'user' : 'environment'
  } catch {
    return 'environment'
  }
}

// Whether the preview should be mirrored (scaleX(-1)), kept separately per physical camera and
// persisted per device — not something this app can reliably figure out on its own. Different
// devices/browsers hand back a front camera feed in different native orientations (confirmed in
// real testing: the exact same "mirror when it's the front camera" logic looked correct on one
// phone and backwards on an iPad), so instead of guessing, whoever sets up a given device gets a
// manual flip button (see toggleMirrorFlip below) that corrects it once and is then remembered —
// the same pattern this file already uses for the front/back camera choice itself.
const MIRROR_FLIP_STORAGE_KEY = 'fusion-scanner-mirror-flip-v1'

// Defaults match this app's prior behavior (front camera mirrored, back camera not) so a device
// that's never had the toggle touched looks the same as it did before this existed.
const DEFAULT_MIRROR_FLIP: Record<CameraFacing, boolean> = { user: true, environment: false }

function loadMirrorFlipPrefs(): Record<CameraFacing, boolean> {
  try {
    const saved = localStorage.getItem(MIRROR_FLIP_STORAGE_KEY)
    if (!saved) return DEFAULT_MIRROR_FLIP
    const parsed = JSON.parse(saved) as Partial<Record<CameraFacing, boolean>>
    return {
      user: typeof parsed.user === 'boolean' ? parsed.user : DEFAULT_MIRROR_FLIP.user,
      environment: typeof parsed.environment === 'boolean' ? parsed.environment : DEFAULT_MIRROR_FLIP.environment,
    }
  } catch {
    return DEFAULT_MIRROR_FLIP
  }
}

// The picker shows one card per EVENT (ScannableEvent already groups an event with all of its
// sessions) — which specific session to scan into is resolved automatically from the current time
// once an event is picked, not chosen up front. See pickActiveSession below.
type ScanTarget = ScannableEvent

// The session running right now, among an event's sessions — or null if none is open.
function pickActiveSession(sessions: EventSession[], now: Date): EventSession | null {
  return pickOpenSession(sessions, now)
}

// Either a rejected pass (ScanStatus, e.g. revoked/unrecognized) or — once the pass itself checks
// out — the event-policy outcome from the atomic record_check_in() call (checked in, already
// checked in, not invited, at capacity). Kept as one discriminated shape so the result card only
// ever has one thing to render. `isFirstCheckIn` is only meaningful for a fresh 'checked_in'
// outcome — set once a follow-up count query resolves, so the card can tell "Welcome to" (their
// first session of this event ever) apart from "Welcome back" (a later one); null while that
// lookup is still in flight, treated the same as "later session" so the card never claims a first
// visit it hasn't actually confirmed.
type DisplayResult =
  | { kind: 'pass'; status: ScanStatus; student?: ScanResult['student'] }
  | {
      kind: 'checkin'
      outcome: CheckInOutcome
      checkedInAt: string | null
      status: CheckInStatus | null
      student: NonNullable<ScanResult['student']>
      isFirstCheckIn: boolean | null
    }

const RECENT_SCANS_LIMIT = 3

// Staff-only — the kiosk screen never shows this (public-facing, other students' activity isn't
// staff's to broadcast there), but the staff scanner keeps its own "who did I just check in" list.
interface RecentScan {
  studentId: string | null
  fullName: string
  program: string
  outcome: CheckInOutcome
  time: string
}

// Labels for every "problem" outcome — shown as the card's headline when nothing more specific
// applies (not_invited gets its own exact wording below, per spec; these are the rest).
const PASS_PROBLEM_LABEL: Record<Exclude<ScanStatus, 'valid'>, string> = {
  revoked: 'This pass has been revoked',
  reissued: 'This pass is out of date',
  'not-found': "We couldn't find a student for this pass",
  'invalid-code': "That's not a recognized Fusion pass",
}

const CHECKIN_PROBLEM_LABEL: Record<Exclude<CheckInOutcome, 'checked_in' | 'already_checked_in' | 'not_invited'>, string> = {
  dropped: 'Dropped from this session',
  at_capacity: 'This event is at capacity',
  // Reachable if the window closes/hasn't opened between when the Scanner's own pre-camera check
  // ran and the moment this scan actually completes — the database is the real enforcement, this
  // copy just keeps the message clear on the rare occasion the client-side gate is stale.
  session_not_started: "This session hasn't opened yet",
  session_closed: 'Check-in window closed for this session',
  session_not_found: 'Session no longer available',
  event_not_found: 'Event no longer available',
}

// Staff scanner card copy — unchanged by the kiosk redesign, same plain labels/colors it always had.
const STAFF_PASS_STATUS_COPY: Record<ScanStatus, { label: string; theme: ResultTheme }> = {
  valid: { label: 'Pass valid', theme: 'green' },
  revoked: { label: 'Pass revoked', theme: 'red' },
  reissued: { label: 'Old pass, reissued since', theme: 'amber' },
  'not-found': { label: 'Student not found', theme: 'gray' },
  'invalid-code': { label: 'Not a recognized Fusion pass', theme: 'gray' },
}

const STAFF_CHECKIN_OUTCOME_COPY: Record<CheckInOutcome, { label: string; theme: ResultTheme }> = {
  checked_in: { label: 'Checked In', theme: 'green' },
  already_checked_in: { label: 'Already Checked In', theme: 'gray' },
  not_invited: { label: 'Not invited to this event', theme: 'red' },
  dropped: { label: 'Dropped from this session', theme: 'red' },
  at_capacity: { label: 'Event at capacity', theme: 'red' },
  session_not_started: { label: "This session hasn't opened yet", theme: 'red' },
  session_closed: { label: 'Check-in window closed for this session', theme: 'red' },
  session_not_found: { label: 'Session no longer available', theme: 'red' },
  event_not_found: { label: 'Event no longer available', theme: 'red' },
}

// Kiosk result card — large, student-facing, colors per the redesign spec (sky blue/indigo).
const KIOSK_THEME_CLASSES: Record<ResultTheme, string> = {
  blue: 'border-[#bae6fd] bg-[#e0f6fe]', // sky blue — Early
  green: 'border-[#b7ebd2] bg-[#e8f8f1]', // On-time
  amber: 'border-[#fbedc0] bg-[#fff8e1]', // Late
  indigo: 'border-[#c7d2fe] bg-[#eef2ff]', // Already checked in
  red: 'border-[#f8c9c9] bg-[#fde8e8]', // Not registered / any problem
  gray: 'border-[#e2e6ee] bg-[#f2f5fa]', // unused on this card
}

// Icon color follows the card's own theme rather than a fixed navy — each status's check (or "!")
// icon is tinted to match its card, not just the text.
const KIOSK_THEME_ICON_CLASSES: Record<ResultTheme, string> = {
  blue: 'text-[#0ea5e9]',
  green: 'text-[#159a56]',
  amber: 'text-[#c9930f]',
  indigo: 'text-[#4f46e5]',
  red: 'text-[#d1453d]',
  gray: 'text-[#56617a]',
}

// Soft tinted ring the icon circle sits inside, matching the card's own theme a shade stronger
// than its background.
const KIOSK_THEME_BADGE_CLASSES: Record<ResultTheme, string> = {
  blue: 'bg-[#0ea5e9]/15',
  green: 'bg-[#159a56]/15',
  amber: 'bg-[#c9930f]/18',
  indigo: 'bg-[#4f46e5]/15',
  red: 'bg-[#d1453d]/15',
  gray: 'bg-[#56617a]/12',
}

// Solid fill for the kiosk card's auto-dismiss countdown bar — same hue as the icon/badge.
const KIOSK_THEME_BAR_CLASSES: Record<ResultTheme, string> = {
  blue: 'bg-[#0ea5e9]',
  green: 'bg-[#159a56]',
  amber: 'bg-[#c9930f]',
  indigo: 'bg-[#4f46e5]',
  red: 'bg-[#d1453d]',
  gray: 'bg-[#56617a]',
}

// A fresh check-in's early/on-time/late status decides the kiosk card's color — purely a display
// mapping on top of the status the database already computed.
const KIOSK_STATUS_THEME: Record<CheckInStatus, ResultTheme> = {
  early: 'blue',
  'on-time': 'green',
  late: 'amber',
}

// Staff scanner result card — the original small, compact card, unchanged by the kiosk redesign.
const STAFF_THEME_CLASSES: Record<ResultTheme, string> = {
  blue: 'border-[#bcd6f8] bg-[#e9f2fe]',
  green: 'border-[#b7ebd2] bg-[#e8f8f1]',
  amber: 'border-[#fbedc0] bg-[#fff8e1]',
  indigo: 'border-[#c7d2fe] bg-[#eef2ff]', // unused on this card
  red: 'border-[#f8c9c9] bg-[#fde8e8]',
  gray: 'border-[#e2e6ee] bg-[#f2f5fa]',
}

const STAFF_THEME_ICON_CLASSES: Record<ResultTheme, string> = {
  blue: 'text-[#2f6fed]',
  green: 'text-[#159a56]',
  amber: 'text-[#c9930f]',
  indigo: 'text-[#4f46e5]',
  red: 'text-[#d1453d]',
  gray: 'text-[#56617a]',
}

const STAFF_THEME_BADGE_CLASSES: Record<ResultTheme, string> = {
  blue: 'bg-[#2f6fed]/15',
  green: 'bg-[#159a56]/15',
  amber: 'bg-[#c9930f]/18',
  indigo: 'bg-[#4f46e5]/15',
  red: 'bg-[#d1453d]/15',
  gray: 'bg-[#56617a]/12',
}

const STAFF_STATUS_THEME: Record<CheckInStatus, ResultTheme> = {
  early: 'blue',
  'on-time': 'green',
  late: 'amber',
}

// The greeting line's wording/icon follows the actual moment of the scan (not the session's
// scheduled start time) — a student scanning in at 7:50am for an 8am session still gets "Good
// morning", and someone arriving fashionably late at 6pm gets "Good evening" regardless of when
// the session itself opened.
type GreetingPeriod = 'morning' | 'afternoon' | 'evening'

function greetingPeriodFromDate(date: Date): GreetingPeriod {
  const hour = date.getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

const GREETING_ICON: Record<GreetingPeriod, React.ComponentType<{ size?: number }>> = {
  morning: SunriseIcon,
  afternoon: SunIcon,
  evening: MoonIcon,
}

const GREETING_LABEL: Record<GreetingPeriod, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// Session labels are free-typed by staff and sometimes already include their own "Day N" prefix
// (e.g. "Day 2 – Morning") — the kiosk pill below prepends its own "Day N" from the event's actual
// day index, so without this a session on day 2 would read "Day 2 · Day 2 – Morning". Strips a
// leading "Day <number>" plus whatever dash/colon separates it from the rest, case-insensitively.
const DAY_PREFIX_PATTERN = /^day\s*\d+\s*[–—:-]\s*/i

function stripDayPrefix(label: string): string {
  return label.replace(DAY_PREFIX_PATTERN, '').trim()
}

export function ScannerPage() {
  const { staffUser, signOut } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // What the user actually sees — drawn from the video, frame by frame, in the same loop that
  // feeds jsQR (see the decode-loop effect below). Not a <video> element directly: on some old
  // Android devices, the live camera frame is composited by a hardware fast path that silently
  // ignores ordinary CSS (confirmed on a kiosk tablet — forcing the mirror on vs off via the
  // ?mirror= URL param produced no visible change either way). Drawing to a canvas ourselves,
  // flipping the pixels directly when needed, bypasses that path entirely.
  const displayCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanningRef = useRef(true) // paused while a result card is showing
  const lastCodeRef = useRef<string | null>(null)
  const lastMirrorToggleRef = useRef(0) // guards toggleMirrorFlip against a double-fired tap

  const [cameraState, setCameraState] = useState<CameraState>('starting')
  const [result, setResult] = useState<DisplayResult | null>(null)
  const [recentScans, setRecentScans] = useState<RecentScan[]>([])
  // Which physical camera to request — persisted per device so a kiosk iPad remembers "front
  // camera" across reloads instead of defaulting back to the rear camera every time.
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>(loadCameraFacing)
  // Per-device, per-camera "should this be mirrored" preference — see loadMirrorFlipPrefs above.
  // One toggle button (below), one plain link, same on the kiosk and the staff scanner.
  const [mirrorFlipPrefs, setMirrorFlipPrefs] = useState<Record<CameraFacing, boolean>>(loadMirrorFlipPrefs)
  // The flip value the display draw-loop actually uses, in a ref rather than read directly from
  // state — so tapping the flip button doesn't tear down and rebuild the decode/draw loop below
  // (which stays keyed only to cameraState), it just changes what the very next frame draws.
  const mirrorFlipRef = useRef(mirrorFlipPrefs[cameraFacing])
  useEffect(() => {
    mirrorFlipRef.current = mirrorFlipPrefs[cameraFacing]
  }, [mirrorFlipPrefs, cameraFacing])

  const [scannableEvents, setScannableEvents] = useState<ScannableEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  // The event currently being scanned into (with all of its sessions) — null while the card list
  // is showing and nothing's picked yet.
  const [target, setTarget] = useState<ScanTarget | null>(null)
  // Set only when staff explicitly pick a session below the auto-detected one (e.g. to check
  // someone into tomorrow's session early) — null means "use whichever session is open right now".
  const [manualSessionId, setManualSessionId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  // Bumped each time the sheet opens so it starts from the current selection, not a stale draft.
  const [sheetKey, setSheetKey] = useState(0)

  // Whether this browser is currently signed in through the dedicated /kiosk login rather than a
  // staff member's own account — read once on mount; only changes by signing in again elsewhere.
  // Drives just the check-in result message below, nothing else about this page's behavior.
  const [kioskDevice] = useState(isKioskDevice)
  // "Kiosk mode" only needs to hide/replace things once the camera's actually up and scanning —
  // the event-picker screen before that is still a staff-facing setup step, not the public-facing
  // view, so it keeps its normal header (logo, role pill, Log out) regardless of device type.
  const kioskScanning = kioskDevice && Boolean(target)

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

  // Whatever's being scanned against is about to change (a different event, or a different
  // session within the same event via the manual Session pills below) — every place that does
  // that has to reset the scan-cooldown state itself (same reset resumeScanning already does
  // after a result auto-dismisses), not just rely on that 4s auto-dismiss timer to eventually do
  // it. That timer is cancelled the moment `result` is cleared (its effect is keyed to `result`),
  // which switching events/sessions already does — so without this, lastCodeRef stays pointed at
  // whatever was scanned right before the switch and scanningRef stays paused. The next scan
  // attempt (even of a different student, on the new session) would then be silently ignored — no
  // error, camera still visibly running, nothing to explain why it "stopped reading". Reproduced
  // concretely: scan succeeds on event A, switch to event B before the result card auto-dismisses,
  // re-scan the same pass — nothing happens. Declared here (not down by the rest of the decode
  // logic) so selectTarget/changeEvent/the session pills below can all reuse the same function.
  const resumeScanning = useCallback(() => {
    setResult(null)
    lastCodeRef.current = null
    scanningRef.current = true
  }, [])

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
    resumeScanning()
    // "Recent scans" is meant to answer "who did I just check in for THIS event/session", not
    // carry over from whatever was selected before.
    setRecentScans([])
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ eventId: next.event.id }))
  }

  function applySessionChoice(sessionId: string | null) {
    setSheetOpen(false)
    if (sessionId === manualSessionId) return
    setManualSessionId(sessionId)
    resumeScanning()
    setRecentScans([])
  }

  function changeEvent() {
    setTarget(null)
    setManualSessionId(null)
    resumeScanning()
    setRecentScans([])
  }

  async function handleLogout() {
    await signOut()
    // A device signed in through the dedicated /kiosk login goes back there, never to the staff
    // login — sending a kiosk iPad to /scanner/login would show it a personal-account sign-in
    // screen instead of the shared kiosk one, and this flag is exactly how the rest of this page
    // already tells a kiosk device apart from a staff member's own (see kioskDevice above).
    navigate(kioskDevice ? '/kiosk' : '/scanner/login', { replace: true })
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
        // `ideal` everywhere (never an exact/hard constraint) so a device that can't hit these —
        // only one camera, a camera that maxes out well below 1280x720, or one that can't sustain
        // 30fps — is *supposed* to still get a working camera instead of an OverconstrainedError,
        // the browser just handing back its closest match. In practice, some older/buggy camera
        // drivers don't honor that spec-correct "ideal never fails" behavior and throw anyway the
        // moment any constraint is specified at all — so this tries the fuller request first (both
        // resolution and frame rate are real, worthwhile asks when they work: more pixels per frame
        // gives jsQR a sharper image to decode, and a higher frame rate means fresh frames arrive
        // more often for the scan loop to actually check — checking 10x/second, as this app now
        // does, is wasted if the camera itself is only producing, say, 15 frames a second to begin
        // with), but immediately falls back to the plain, unconstrained request this app originally
        // used if that throws — never letting either preference be the reason the camera fails to
        // start at all.
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: cameraFacing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          })
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: cameraFacing } } })
        }
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        hadStreamRef.current = true
        // Best-effort — explicitly ask the camera to keep refocusing continuously rather than
        // locking focus once and leaving it there. Without this, some devices focus on whatever's
        // in frame the instant the camera starts, then never re-adjust as a QR pass is moved into
        // position — a pass held close enough to fill the frame with just the code (no surrounding
        // white margin/context) can end up outside that locked focus distance and read as blurry
        // to jsQR even though the QR itself is fine. Not every browser/camera supports this
        // (notably Safari/iOS, which is already always continuous) — applyConstraints throwing
        // just means there's nothing more to do here, not a real failure.
        const [videoTrack] = stream.getVideoTracks()
        try {
          await videoTrack?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet] })
        } catch {
          // Unsupported on this device — the camera still works, just without this tweak.
        }
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

  // Flips only the currently-active camera's own setting — switching to the other camera later
  // still uses whatever that one was last set to, not whatever was just chosen here.
  //
  // Guarded against a single physical tap somehow firing this twice in quick succession (some
  // older touchscreens/browsers are known to "double-fire" a tap as two separate click events) —
  // without this, two rapid calls would flip the setting on and immediately back off again,
  // looking exactly like the button does nothing at all even though it genuinely ran.
  function toggleMirrorFlip() {
    const now = Date.now()
    if (now - lastMirrorToggleRef.current < 400) return
    lastMirrorToggleRef.current = now
    setMirrorFlipPrefs((prev) => {
      const next = { ...prev, [cameraFacing]: !prev[cameraFacing] }
      try {
        localStorage.setItem(MIRROR_FLIP_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // fine — the flip still works for this session, it just won't be remembered on reload
      }
      return next
    })
  }

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

    setResult({
      kind: 'checkin',
      outcome: attempt.outcome,
      checkedInAt: attempt.checkedInAt,
      status: attempt.status,
      student,
      isFirstCheckIn: null, // resolved just below, once the count comes back
    })

    // "Welcome to [event]" (their first session ever) vs "Welcome back to [event]" (a later one) —
    // only worth asking for a genuinely fresh check-in; already-checked-in/rejected outcomes don't
    // use this. A count of 1 (including the row just recorded) means this was their first.
    if (attempt.outcome === 'checked_in') {
      try {
        const count = await countStudentCheckIns(current.event.id, student.uuid)
        setResult((prev) =>
          prev && prev.kind === 'checkin' && prev.student.uuid === student.uuid ? { ...prev, isFirstCheckIn: count <= 1 } : prev,
        )
      } catch {
        // Falls back to "Welcome back" wording (isFirstCheckIn stays null) rather than blocking
        // the result card on this — the check-in itself already succeeded and is recorded.
      }
    }

    // Staff-only "Recent scans" list — kiosk mode doesn't show this (see RecentScan above).
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
  // need 60fps decode attempts, just enough to feel instant. The same loop also redraws the
  // visible display canvas every single frame (unthrottled), since that's what the user is
  // actually looking at live.
  useEffect(() => {
    if (cameraState !== 'ready') return
    const canvas = canvasRef.current
    const video = videoRef.current
    const displayCanvas = displayCanvasRef.current
    if (!canvas || !video || !displayCanvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const displayCtx = displayCanvas.getContext('2d')
    if (!ctx || !displayCtx) return

    let raf = 0
    let lastAttempt = 0

    function tick(timestamp: number) {
      raf = requestAnimationFrame(tick)
      if (!video || !displayCanvas || !displayCtx || video.videoWidth === 0 || video.videoHeight === 0) return

      if (displayCanvas.width !== video.videoWidth || displayCanvas.height !== video.videoHeight) {
        displayCanvas.width = video.videoWidth
        displayCanvas.height = video.videoHeight
      }
      displayCtx.save()
      if (mirrorFlipRef.current) {
        displayCtx.translate(displayCanvas.width, 0)
        displayCtx.scale(-1, 1)
      }
      displayCtx.drawImage(video, 0, 0, displayCanvas.width, displayCanvas.height)
      displayCtx.restore()

      if (!scanningRef.current) return
      if (timestamp - lastAttempt < SCAN_INTERVAL_MS) return
      lastAttempt = timestamp
      if (!canvas || !ctx) return

      // Downscaled onto the offscreen canvas — jsQR never sees the full camera resolution, only
      // this smaller copy (see DECODE_MAX_DIMENSION above). Math.min(1, …) means a camera already
      // at or below that size (e.g. the plain-request fallback on a weak device) is never upscaled,
      // which would add blur without adding real detail.
      const scale = Math.min(1, DECODE_MAX_DIMENSION / Math.max(video.videoWidth, video.videoHeight))
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      // dontInvert — jsQR's default also tries an inverted-color (white-on-dark) decode on every
      // single frame, on top of the normal one. Every Fusion pass QR is always generated the
      // normal (dark-on-light) way, with no exceptions, so that second attempt can never find
      // anything real here; skipping it roughly halves the decode work per frame.
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })

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
  // JSX below from re-deriving this per branch. Three kinds only: 'fresh' (a brand-new check-in,
  // colored by its Early/On-time/Late status), 'already' (indigo, nothing new happened), or
  // 'problem' (red — not registered, dropped, at capacity, a rejected pass, anything that isn't a
  // success). No more status pills/labels on the card itself; 'header' below is only read as a
  // fallback headline for the handful of 'problem' outcomes the spec didn't give bespoke wording to.
  const resultDisplay = (() => {
    if (!result) return null
    if (result.kind === 'pass') {
      return {
        theme: 'red' as ResultTheme,
        kind: 'problem' as const,
        header: PASS_PROBLEM_LABEL[result.status as Exclude<ScanStatus, 'valid'>] ?? "Couldn't complete the check-in. Please try again.",
        student: result.student,
        checkedInAt: null as string | null,
        status: null as CheckInStatus | null,
        isFirstCheckIn: null as boolean | null,
        notOnList: false,
      }
    }
    if (result.outcome === 'checked_in') {
      return {
        theme: result.status ? KIOSK_STATUS_THEME[result.status] : ('green' as ResultTheme),
        kind: 'fresh' as const,
        header: '',
        student: result.student as ScanResult['student'],
        checkedInAt: result.checkedInAt,
        status: result.status,
        isFirstCheckIn: result.isFirstCheckIn,
        notOnList: false,
      }
    }
    if (result.outcome === 'already_checked_in') {
      return {
        theme: 'indigo' as ResultTheme,
        kind: 'already' as const,
        header: '',
        student: result.student as ScanResult['student'],
        checkedInAt: result.checkedInAt,
        status: result.status,
        isFirstCheckIn: null as boolean | null,
        notOnList: false,
      }
    }
    const notOnList = result.outcome === 'not_invited'
    return {
      theme: 'red' as ResultTheme,
      kind: 'problem' as const,
      header: notOnList
        ? ''
        : CHECKIN_PROBLEM_LABEL[result.outcome as Exclude<CheckInOutcome, 'checked_in' | 'already_checked_in' | 'not_invited'>],
      student: result.student as ScanResult['student'],
      checkedInAt: result.checkedInAt,
      status: result.status,
      isFirstCheckIn: null as boolean | null,
      notOnList,
    }
  })()

  // The staff card's own version of the above — unchanged by the kiosk redesign, same simple
  // label+theme+fresh/already/notOnList shape it always had.
  const staffResultDisplay = (() => {
    if (!result) return null
    if (result.kind === 'pass') {
      const copy = STAFF_PASS_STATUS_COPY[result.status]
      return {
        theme: copy.theme,
        header: copy.label,
        student: result.student,
        checkedInAt: null as string | null,
        fresh: false,
        already: false,
        notOnList: false,
      }
    }
    const copy = STAFF_CHECKIN_OUTCOME_COPY[result.outcome]
    const fresh = result.outcome === 'checked_in'
    return {
      theme: fresh && result.status ? STAFF_STATUS_THEME[result.status] : copy.theme,
      header: copy.label,
      student: result.student as ScanResult['student'],
      checkedInAt: result.checkedInAt,
      fresh,
      already: result.outcome === 'already_checked_in',
      notOnList: result.outcome === 'not_invited',
    }
  })()

  // "Day N" only makes sense once an event actually spans more than one day — a single-day event
  // never mentions it, matching how the plain session label elsewhere in this app already works.
  const eventDayDates = target ? Array.from(new Set(target.sessions.map((s) => s.date))).sort() : []
  const activeDayIndex = activeSession ? eventDayDates.indexOf(activeSession.date) + 1 : 0
  const dayLabel = eventDayDates.length > 1 && activeDayIndex > 0 ? `Day ${activeDayIndex}` : null

  // The kiosk session pill's own text — strips a redundant "Day N" the session's own label might
  // already carry, so a day-2 session reads "Day 2 · Morning", never "Day 2 · Day 2 – Morning".
  const kioskSessionLabel = activeSession
    ? dayLabel
      ? `${dayLabel} · ${stripDayPrefix(activeSession.label)}`
      : stripDayPrefix(activeSession.label)
    : 'No active session'

  // This day's own sessions, in order — drives the "Session N of M today" closing line. Position
  // and count are both real, derived from the event's actual sessions, never hardcoded.
  const sessionsToday = activeSession
    ? (target?.sessions.filter((s) => s.date === activeSession.date).sort((a, b) => a.openTime.localeCompare(b.openTime)) ?? [])
    : []
  const sessionIndexToday = activeSession ? sessionsToday.findIndex((s) => s.id === activeSession.id) + 1 : 0
  const sessionCountToday = sessionsToday.length
  const isLastSessionToday = sessionIndexToday > 0 && sessionIndexToday === sessionCountToday

  const eventName = target?.event.program ?? 'the event'

  // The session row (clock icon, inside the card) and the "Day N" pill both only make sense once
  // there's more than one session to distinguish — a single-day, single-session event never shows
  // either. Suppressed entirely for a 'problem' result (revoked pass, not on the list, etc.) too —
  // there's no meaningful session context to show alongside "please see a staff member".
  const totalSessionsInEvent = target?.sessions.length ?? 0
  const showSessionRow = Boolean(activeSession) && resultDisplay?.kind !== 'problem' && (eventDayDates.length > 1 || sessionCountToday > 1)

  // Greeting (first name only — see CLAUDE.md-adjacent spec: no last name/initial on a public
  // screen) shows for a genuinely fresh check-in, and also for "matches a student but not on the
  // list" — specifically NOT for "matches nobody" (no student to greet) or "already checked in"
  // (goes straight to its headline, per spec). Follows the actual scan moment, not the session's
  // scheduled time — see greetingPeriodFromDate.
  const showGreeting =
    resultDisplay?.kind === 'fresh' || (resultDisplay?.kind === 'problem' && resultDisplay.notOnList && Boolean(resultDisplay.student))
  const greeting =
    showGreeting && resultDisplay?.student
      ? (() => {
          const basis = resultDisplay.kind === 'fresh' && resultDisplay.checkedInAt ? new Date(resultDisplay.checkedInAt) : new Date()
          const period = greetingPeriodFromDate(basis)
          return { text: `${GREETING_LABEL[period]}, ${resultDisplay.student.firstName}!`, Icon: GREETING_ICON[period] }
        })()
      : null

  const headline = !resultDisplay
    ? ''
    : resultDisplay.kind === 'fresh'
      ? resultDisplay.isFirstCheckIn
        ? `Welcome to ${eventName}`
        : `Welcome back to ${eventName}`
      : resultDisplay.kind === 'already'
        ? `You're already checked in to ${eventName}`
        : resultDisplay.notOnList
          ? `We can't find you on the list for ${eventName}`
          : resultDisplay.header

  // Only a fresh (early/on-time/late) outcome gets this line — status itself is communicated by
  // the card's color alone, never by words like "You're late"/"You're early".
  //   - Early: always "Starts at H:MM AM/PM.", the event's own scheduled start — regardless of how
  //     many sessions today, so a student arriving ahead of the only session still sees when it
  //     actually starts.
  //   - On time/late, only session in the whole event: nothing — there's nothing to count against.
  //   - On time/late, this is the last session today (today had more than one): "Last session of
  //     the day." — even when arriving late to it, per spec.
  //   - On time/late, today has more than one session (and this isn't the last of them): "Session
  //     N of M today."
  //   - On time/late, today has only this one session (but the event spans other days): nothing.
  const closingLine =
    resultDisplay?.kind === 'fresh' && resultDisplay.status && activeSession
      ? resultDisplay.status === 'early'
        ? `Starts at ${formatTime(`${activeSession.date}T${activeSession.eventStartTime}`)}.`
        : totalSessionsInEvent <= 1
          ? null
          : sessionCountToday > 1
            ? isLastSessionToday
              ? 'Last session of the day.'
              : `Session ${sessionIndexToday} of ${sessionCountToday} today.`
            : null
      : null

  return (
    <div className="relative box-border flex min-h-screen flex-col bg-[#0d1f39] text-white">
      <div className="flex items-center justify-between gap-3 px-5 py-4 lg:px-8 lg:py-6">
        <div className="flex items-center gap-2.5">
          {/* Nothing on the left for the kiosk's active scanning screen — no logo, no exit
              gesture. Staff exit from here via the faded Change button (top-right below), which
              goes back to the event picker — that screen already shows a normal Log out button. */}
          {!kioskScanning && (
            <>
              <FusionLogo variant="light" width={100} />
              <span className="inline-flex items-center rounded-full bg-[#f4b400] px-2.5 py-[3px] text-[10px] font-extrabold tracking-[0.6px] text-[#12284a] uppercase lg:px-3 lg:py-1 lg:text-[12px]">
                {staffUser?.role === 'Kiosk' ? 'Kiosk' : staffUser?.role === 'Admin' ? 'Admin' : 'Staff'}
              </span>
            </>
          )}
        </div>
        {kioskScanning ? (
          <button
            type="button"
            onClick={changeEvent}
            aria-label="Change event"
            // Deliberately faded (~40% opacity) and small — present for staff, unremarkable to a
            // student glancing at the screen.
            className="inline-flex items-center gap-1 rounded-[8px] border border-white/40 bg-transparent px-2.5 py-1.5 text-[11px] font-bold text-white/40 cursor-pointer [transition:opacity_150ms_ease] hover:opacity-70"
          >
            <ChevronLeftIcon size={12} />
            Change
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-[10px] border border-white/20 bg-white/10 px-3.5 py-2 text-[13px] font-bold text-white cursor-pointer [transition:background-color_150ms_ease] hover:bg-white/20 lg:px-5 lg:py-2.5 lg:text-[14.5px]"
          >
            Log out
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center gap-4 px-5 pb-8 lg:gap-6 lg:pb-12">
        {loadingEvents ? (
          <div className="mt-10 flex max-w-[320px] flex-col items-center gap-2 text-center lg:max-w-[440px]">
            <span className="text-[13.5px] font-semibold text-white/70 lg:text-[16px]">Loading events&hellip;</span>
          </div>
        ) : scannableEvents.length === 0 ? (
          <div className="mt-10 flex max-w-[320px] flex-col items-center gap-2 text-center lg:max-w-[440px]">
            <span className="text-[15px] font-bold text-white lg:text-[19px]">No events ready for check-in</span>
            <p className="m-0 text-[13px] text-white/60 lg:text-[15.5px]">
              Once an admin creates an upcoming or active event with a check-in session, it&apos;ll show up here.
            </p>
          </div>
        ) : !target ? (
          <div className="flex w-full max-w-[420px] flex-col gap-2.5 lg:max-w-[600px] xl:max-w-[720px]">
            <h2 className="m-0 mb-1 text-[11px] font-bold tracking-[0.6px] text-white/50 uppercase lg:text-[13px]">Select an event to check in</h2>
            {scannableEvents.map((entry, index) => (
              <button
                key={entry.event.id}
                type="button"
                onClick={() => selectTarget(entry)}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-left cursor-pointer [animation:fade-in-up_400ms_ease_both] [transition:background-color_150ms_ease,border-color_150ms_ease,transform_150ms_ease] hover:-translate-y-0.5 hover:border-[#f4b400]/50 hover:bg-white/10 lg:px-6 lg:py-5"
                style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-[14.5px] font-extrabold text-white lg:text-[18px]">{entry.event.program}</span>
                  <span className="flex items-center gap-1.5 text-[12.5px] text-white/60 lg:text-[14.5px]">
                    <CalendarIcon size={13} />
                    {entry.event.dateLabel}
                  </span>
                  <span className="flex items-center gap-1.5 text-[12.5px] text-white/60 lg:text-[14.5px]">
                    <ClockIcon size={13} />
                    {entry.event.timeLabel}
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-[#f4b400]/15 px-2.5 py-1 text-center text-[11.5px] font-bold text-[#f4b400] lg:px-3 lg:py-1.5 lg:text-[13.5px]">
                  {entry.sessions.length > 1 ? `${entry.sessions.length} sessions` : entry.sessions[0].label}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {target && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            {kioskScanning ? (
              <div className="flex w-full flex-col items-center gap-3 px-6 text-center md:gap-5">
                <h1
                  className="m-0 line-clamp-2 max-w-full font-bold text-white"
                  style={{ fontSize: 'clamp(26px, 4vw, 44px)' }}
                >
                  {target.event.program}
                </h1>
                {target.sessions.length > 1 ? (
                  <>
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      aria-expanded={sheetOpen}
                      onClick={() => {
                        setSheetKey((k) => k + 1)
                        setSheetOpen(true)
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[13px] font-bold text-white cursor-pointer [transition:background-color_150ms_ease] hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-[#f4b400] md:gap-3 md:px-6 md:py-3 md:text-[18px]"
                    >
                      {windowStatus === 'open' && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#22c55e] md:h-3 md:w-3" />}
                      {kioskSessionLabel}
                    </button>
                    <SessionSheet
                      key={sheetKey}
                      open={sheetOpen}
                      sessions={target.sessions}
                      autoSessionId={autoSession?.id ?? null}
                      appliedSessionId={manualSessionId}
                      now={now}
                      onConfirm={applySessionChoice}
                    />
                  </>
                ) : (
                  activeSession && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[13px] font-bold text-white md:gap-3 md:px-6 md:py-3 md:text-[18px]">
                      {windowStatus === 'open' && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#22c55e] md:h-3 md:w-3" />}
                      {kioskSessionLabel}
                    </span>
                  )
                )}

                {/* Always visible on this screen, regardless of camera/window state — the result
                    card (a full-screen overlay) naturally covers it when a scan is showing. */}
                <div className="mt-2 flex flex-col items-center gap-1 md:mt-4 md:gap-2">
                  <span className="font-bold text-[#eaa421]" style={{ fontSize: 'clamp(26px, 4vw, 40px)' }}>
                    Please scan your pass here
                  </span>
                  <span className="max-w-[420px] text-[15px] font-semibold text-[#9fb4d1] md:text-[18px]">
                    Turn your screen brightness up and hold your QR code 15 cm from the camera.
                  </span>
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#eaa421"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mt-1"
                    aria-hidden="true"
                  >
                    <path d="M12 4v15M6 13l6 6 6-6" />
                  </svg>
                </div>
              </div>
            ) : (
              <>
                <div className="flex w-full max-w-[360px] items-center gap-2.5 lg:max-w-[560px]">
                  <button
                    type="button"
                    onClick={changeEvent}
                    className="inline-flex shrink-0 items-center gap-1 rounded-[9px] border border-white/15 bg-white/5 px-2.5 py-1.5 text-[12px] font-bold text-white/70 cursor-pointer [transition:background-color_150ms_ease] hover:bg-white/10 hover:text-white lg:px-3.5 lg:py-2 lg:text-[14px]"
                  >
                    <ChevronLeftIcon size={14} />
                    Change
                  </button>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-white/80 lg:text-[15px]">
                    {target.event.program}
                  </span>
                </div>

                {target.sessions.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      aria-expanded={sheetOpen}
                      onClick={() => {
                        setSheetKey((k) => k + 1)
                        setSheetOpen(true)
                      }}
                      className="inline-flex items-center gap-2 self-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[12.5px] font-bold text-white cursor-pointer [transition:background-color_150ms_ease] hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-[#f4b400] lg:text-[14px]"
                    >
                      {windowStatus === 'open' && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#22c55e]" />}
                      <span>{activeSession ? activeSession.label : 'No active session'}</span>
                      <span className="text-white/50">{manualSessionId === null ? '· auto' : '· manual'}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    <SessionSheet
                      key={sheetKey}
                      open={sheetOpen}
                      sessions={target.sessions}
                      autoSessionId={autoSession?.id ?? null}
                      appliedSessionId={manualSessionId}
                      now={now}
                      onConfirm={applySessionChoice}
                    />
                  </>
                )}
              </>
            )}

            {/* The scan area scales with the actual device rather than a couple of fixed
                breakpoints — `min()` of viewport width AND height means a big iPad or a desktop
                browser genuinely gets a larger camera view, while a short landscape phone still
                fits without the square overflowing the screen. The 520px cap was sized for a
                phone/tablet in someone's hands — a kiosk mounted on a large monitor needs a much
                higher ceiling to actually use that screen instead of sitting tiny in the middle. */}
            <div
              className="relative aspect-square overflow-hidden rounded-[24px] bg-black shadow-[0_20px_50px_rgba(0,0,0,0.4)]"
              style={{ width: 'min(85vw, 62vh, 900px)' }}
            >
              {/* Mirror direction isn't something this app can reliably detect — confirmed in real
                  testing that the exact same camera's native orientation differs by device (looked
                  right on a phone, backwards on an iPad). So this is a manual, per-device,
                  per-camera preference (mirrorFlipPrefs) instead, defaulting to "front camera
                  mirrored, back camera not" and correctable with the flip button below — same one
                  link and button on the kiosk and the staff scanner. Not applied via CSS on the
                  <video> itself (see displayCanvasRef above) — what's actually on screen is the
                  canvas below it; the video stays in the DOM, sized down to 1px and invisible
                  rather than display:none, only as the live source the draw loop reads frames from. */}
              <video
                ref={videoRef}
                playsInline
                muted
                className="absolute h-px w-px opacity-0"
              />
              <canvas ref={displayCanvasRef} className="h-full w-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />

              {windowStatus === 'open' && (
                <div className="absolute top-3 right-3 z-10 flex flex-col gap-2 lg:top-5 lg:right-5 lg:gap-3">
                  <button
                    type="button"
                    onClick={switchCamera}
                    aria-label="Switch camera"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white cursor-pointer backdrop-blur-sm [transition:background-color_150ms_ease] hover:bg-black/65 lg:h-14 lg:w-14"
                  >
                    <CameraFlipIcon size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={toggleMirrorFlip}
                    aria-label="Fix mirrored picture"
                    aria-pressed={mirrorFlipPrefs[cameraFacing]}
                    title="Does the picture look backwards? Tap to flip it — this is remembered for this device."
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white cursor-pointer backdrop-blur-sm [transition:background-color_150ms_ease] hover:bg-black/65 focus-visible:outline-2 focus-visible:outline-white lg:h-14 lg:w-14"
                  >
                    <FlipHorizontalIcon size={18} />
                  </button>
                </div>
              )}

              {!activeSession && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center lg:gap-3 lg:px-12">
                  <span className="text-[14px] font-bold text-white lg:text-[22px]">No session currently active for this event</span>
                  <p className="m-0 text-[13px] text-white/70 lg:text-[16px]">
                    {target.sessions.length > 1
                      ? 'Pick a specific session above to check someone in early or late, or wait for the next one to open.'
                      : "This screen updates automatically once the event's check-in window opens."}
                  </p>
                </div>
              )}

              {activeSession && windowStatus !== 'open' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center lg:gap-3 lg:px-12">
                  <span className="text-[14px] font-bold text-white lg:text-[22px]">
                    {windowStatus === 'not-started' ? "This session hasn't opened yet" : 'Check-in window closed for this session'}
                  </span>
                  <p className="m-0 text-[13px] text-white/70 lg:text-[16px]">
                    {windowStatus === 'not-started'
                      ? `Opens at ${formatTime(`${activeSession.date}T${activeSession.openTime}`)}. This screen updates automatically.`
                      : `Closed at ${formatTime(`${activeSession.date}T${activeSession.closeTime}`)}.`}
                  </p>
                </div>
              )}

              {windowStatus === 'open' && cameraState === 'ready' && !result && kioskScanning && (
                // Fixed-size amber frame (~380px on iPad, per the kiosk redesign spec) rather than
                // the staff version's percentage inset below — a kiosk is always roughly the same
                // physical distance from a pass, so a fixed size reads more consistently than one
                // that scales with however big the camera box happens to render.
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="relative h-[220px] w-[220px] md:h-[380px] md:w-[380px]">
                    <div className="absolute top-0 left-0 h-10 w-10 rounded-tl-2xl border-t-4 border-l-4 border-[#f4b400] md:h-14 md:w-14" />
                    <div className="absolute top-0 right-0 h-10 w-10 rounded-tr-2xl border-t-4 border-r-4 border-[#f4b400] md:h-14 md:w-14" />
                    <div className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-2xl border-b-4 border-l-4 border-[#f4b400] md:h-14 md:w-14" />
                    <div className="absolute right-0 bottom-0 h-10 w-10 rounded-br-2xl border-r-4 border-b-4 border-[#f4b400] md:h-14 md:w-14" />
                  </div>
                </div>
              )}

              {windowStatus === 'open' && cameraState === 'ready' && !result && !kioskScanning && (
                // Four separate corner brackets instead of a full connecting border — reads as
                // "aim roughly here" rather than "fill this exact box edge-to-edge", which a solid
                // outline was inviting people to do (holding the pass too close to make it "fill
                // the box"). Sized generously (12% inset, bigger than the old box ever was) since
                // corner brackets don't carry that same "must fill it completely" pressure a solid
                // outline does — there's room to be generous with the area without reintroducing
                // the too-close problem.
                <div className="pointer-events-none absolute inset-0 p-[12%]">
                  <div className="relative h-full w-full">
                    <div className="absolute top-0 left-0 h-12 w-12 rounded-tl-2xl border-t-4 border-l-4 border-white" />
                    <div className="absolute top-0 right-0 h-12 w-12 rounded-tr-2xl border-t-4 border-r-4 border-white" />
                    <div className="absolute bottom-0 left-0 h-12 w-12 rounded-bl-2xl border-b-4 border-l-4 border-white" />
                    <div className="absolute right-0 bottom-0 h-12 w-12 rounded-br-2xl border-r-4 border-b-4 border-white" />
                  </div>
                </div>
              )}

              {windowStatus === 'open' && cameraState === 'starting' && (
                <div className="absolute inset-0 flex items-center justify-center text-[13.5px] font-semibold text-white/80 lg:text-[18px]">
                  Starting camera&hellip;
                </div>
              )}

              {windowStatus === 'open' && (cameraState === 'denied' || cameraState === 'unavailable') && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center lg:gap-3 lg:px-12">
                  <span className="text-[14px] font-bold text-white lg:text-[22px]">
                    {cameraState === 'denied' ? 'Camera access denied' : 'Camera unavailable'}
                  </span>
                  <p className="m-0 text-[13px] text-white/70 lg:text-[16px]">
                    {cameraState === 'denied'
                      ? 'Allow camera access in your browser settings, then reload this page.'
                      : "Couldn't start this camera. Tap the camera icon above to try the other one, or reload the page."}
                  </p>
                </div>
              )}

              {/* Staff scanner's own small result card — unchanged by the kiosk redesign. Lives
                  inside the camera square (not the full-screen kiosk overlay), since this is a
                  staff member looking at their own device, not a public-facing screen. */}
              {!kioskScanning && result && staffResultDisplay && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-5 lg:p-10">
                  <div
                    className={`relative flex w-full flex-col gap-3 overflow-hidden rounded-2xl border-2 p-5 text-left shadow-[0_20px_60px_rgba(0,0,0,0.45)] [animation:result-pop-in_260ms_cubic-bezier(0.34,1.56,0.64,1)_both] lg:gap-4 lg:rounded-[28px] lg:p-8 ${STAFF_THEME_CLASSES[staffResultDisplay.theme]}`}
                  >
                    <div className="flex items-center gap-2.5 text-[#12284a]">
                      {staffResultDisplay.fresh && (
                        <span
                          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${STAFF_THEME_BADGE_CLASSES[staffResultDisplay.theme]} ${STAFF_THEME_ICON_CLASSES[staffResultDisplay.theme]}`}
                        >
                          <CheckCircleIcon size={19} />
                        </span>
                      )}
                      {staffResultDisplay.already && (
                        <span
                          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${STAFF_THEME_BADGE_CLASSES[staffResultDisplay.theme]} ${STAFF_THEME_ICON_CLASSES[staffResultDisplay.theme]}`}
                        >
                          <ClockIcon size={19} />
                        </span>
                      )}
                      {staffResultDisplay.notOnList && (
                        <span
                          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${STAFF_THEME_BADGE_CLASSES[staffResultDisplay.theme]} ${STAFF_THEME_ICON_CLASSES[staffResultDisplay.theme]}`}
                        >
                          <AlertCircleIcon size={19} />
                        </span>
                      )}
                      <span className="text-[13px] font-extrabold tracking-[0.4px] uppercase lg:text-[16px]">
                        {staffResultDisplay.header}
                      </span>
                    </div>

                    {staffResultDisplay.student ? (
                      <div className="flex flex-col gap-1 text-[#12284a]">
                        <span className="text-[22px] leading-tight font-extrabold lg:text-[36px]">{staffResultDisplay.student.fullName}</span>
                        <span className="text-[16px] leading-snug font-bold opacity-90 lg:text-[22px]">{staffResultDisplay.student.program}</span>
                        <span className="text-[13px] opacity-70 lg:text-[18px]">{staffResultDisplay.student.faculty}</span>
                        {staffResultDisplay.already && staffResultDisplay.checkedInAt && (
                          <span className="mt-1 text-[12.5px] font-semibold opacity-80 lg:text-[16px]">
                            Originally checked in at {formatTime(staffResultDisplay.checkedInAt)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="m-0 text-[13.5px] text-[#12284a] opacity-80 lg:text-[18px]">
                        This code doesn&apos;t match a known Fusion pass.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {!kioskScanning && (
              <p className="m-0 max-w-[320px] text-center text-[13.5px] text-white/70 lg:max-w-[520px] lg:text-[16px]">
                {windowStatus === 'open' && !result ? 'Hold the pass at arm’s length from the camera, facing the lens.' : ''}
              </p>
            )}
          </div>
        )}

        {/* Hidden in kiosk mode — this is a public-facing device, and a list of who just scanned
            in (names included) is other students' check-in activity, not staff's to broadcast. */}
        {target && !kioskScanning && (
          <div className="w-full max-w-[360px] lg:max-w-[560px]">
            <h2 className="m-0 mb-2 text-[11px] font-bold tracking-[0.6px] text-white/50 uppercase lg:text-[13px]">Recent scans</h2>
            {recentScans.length === 0 ? (
              <p className="m-0 text-[13px] text-white/40 lg:text-[15px]">No scans yet.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {recentScans.map((scan, index) => (
                  <li
                    key={`${scan.studentId}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-[10px] bg-white/5 px-3.5 py-2.5 lg:px-5 lg:py-3.5"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[13.5px] font-bold text-white lg:text-[16px]">{scan.fullName}</span>
                      <span className="truncate text-[12px] text-white/50 lg:text-[14px]">{scan.program}</span>
                    </div>
                    <span className="shrink-0 text-[12px] font-semibold text-white/60 lg:text-[14px]">{formatTime(scan.time)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {staffUser && !kioskScanning && <p className="m-0 mt-2 text-[12px] text-white/40">Signed in as {staffUser.fullName}</p>}
      </div>

      {/* Kiosk only — the staff scanner keeps its own small card inside the camera square above.
          Fixed to the viewport (not nested inside the camera's own square box) — the square's
          aspect-ratio and overflow-hidden clipping were fighting the card's own fixed size on
          anything shorter than a big tablet, cutting its edges off. A full-screen overlay gives the
          card the whole screen to work with, matching "large, clear and readable on an iPad". */}
      {kioskScanning && result && resultDisplay && (
        <div
          role="button"
          tabIndex={-1}
          onClick={resumeScanning}
          className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/80 p-5"
        >
          <div
            role="status"
            aria-live="polite"
            // Same fixed size for every result kind (fresh/already/problem alike) so the screen
            // never jumps around between scans — content is centered inside it rather than the box
            // growing/shrinking to fit what's shown this time.
            className={`relative flex h-[460px] max-h-[90vh] w-full max-w-[380px] flex-col items-center justify-center gap-3 overflow-hidden rounded-[24px] border-2 p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.45)] [animation:result-pop-in_260ms_cubic-bezier(0.34,1.56,0.64,1)_both] md:h-[660px] md:max-w-[640px] md:gap-5 md:rounded-[32px] md:p-10 ${KIOSK_THEME_CLASSES[resultDisplay.theme]}`}
          >
            <span
              className={`inline-flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-full md:h-[170px] md:w-[170px] ${KIOSK_THEME_BADGE_CLASSES[resultDisplay.theme]} ${KIOSK_THEME_ICON_CLASSES[resultDisplay.theme]}`}
            >
              <span className="md:hidden">
                {resultDisplay.kind === 'problem' ? <AlertCircleIcon size={38} /> : <CheckCircleIcon size={38} />}
              </span>
              <span className="hidden md:block">
                {resultDisplay.kind === 'problem' ? <AlertCircleIcon size={78} /> : <CheckCircleIcon size={78} />}
              </span>
            </span>

            {greeting && (
              // items-start (not center) + a small icon nudge — with a long name, the greeting can
              // wrap to two lines, and items-center would otherwise float the icon in the middle of
              // the whole wrapped block instead of staying next to the first line.
              <span className="flex items-start justify-center gap-1.5 text-[15px] font-bold text-[#33415c] md:gap-2.5 md:text-[30px]">
                <greeting.Icon size={16} />
                <span className="mt-0.5 md:mt-1.5">{greeting.text}</span>
              </span>
            )}

            <h2 className="m-0 text-[22px] leading-tight font-extrabold text-[#12284a] md:text-[46px]">{headline}</h2>

            {resultDisplay.student && (showSessionRow || resultDisplay.kind === 'problem') ? (
              <div className="mt-1 flex flex-col items-center gap-1.5 border-t border-[#12284a]/10 pt-3 md:gap-3 md:pt-6">
                {showSessionRow && (
                  <span className="flex items-start justify-center gap-1.5 text-[16px] font-bold text-[#12284a] md:gap-2.5 md:text-[34px]">
                    <ClockIcon size={16} />
                    <span className="mt-0.5 md:mt-2">{kioskSessionLabel}</span>
                  </span>
                )}
                {resultDisplay.kind === 'problem' && (
                  <p className="m-0 mt-1 text-[13px] font-semibold text-[#33415c] md:text-[22px]">
                    Please see a staff member. They&rsquo;ll sort it out.
                  </p>
                )}
              </div>
            ) : !resultDisplay.student ? (
              <p className="m-0 text-[13.5px] text-[#12284a] opacity-80 md:text-[22px]">
                This code doesn&apos;t match a known Fusion pass. Please see a staff member.
              </p>
            ) : null}

            {closingLine && (
              <p className="m-0 border-t border-[#12284a]/10 pt-3 text-[13px] font-semibold text-[#33415c] md:pt-6 md:text-[22px]">
                {closingLine}
              </p>
            )}

            <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/10 md:h-2">
              <div
                className={`h-full origin-left ${KIOSK_THEME_BAR_CLASSES[resultDisplay.theme]} [animation:result-countdown_4000ms_linear_forwards]`}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
