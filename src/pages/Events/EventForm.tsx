import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { radioGroupKeyDown } from '../../lib/radioGroup'
import { TypeaheadInput } from '../../components/TypeaheadInput/TypeaheadInput'
import { TimePicker } from '../../components/TimePicker/TimePicker'
import { DatePicker } from '../../components/DatePicker/DatePicker'
import { WizardProgress } from '../../components/WizardProgress/WizardProgress'
import { PlusIcon, XIcon, ClockIcon, ChevronLeftIcon } from '../../components/icons/NavIcons'
import {
  REGISTRATION_TYPES,
  EMPTY_EVENT_FORM,
  eventToForm,
  sessionsToFormRows,
  getEventFormErrors,
  getProgramSuggestions,
  getEventTypeSuggestions,
  getLocationSuggestions,
  suggestSemester,
  suggestYear,
  createSessionRow,
  relabelSessions,
  getSessionFormErrors,
  sessionClosesNextDay,
  todayDateString,
  createSessionTypeDraft,
  getEventDayRange,
  generateSessionsFromTemplates,
  SESSION_TYPE_PRESETS,
  type NewEventForm,
  type SessionFormRow,
  type SessionTypeDraft,
  type EventFormErrors,
} from './addEventData'
import { addEvent, updateEvent, computeEventStatus, type EventItem, type EventStatus, type StatusMode } from './eventsData'
import { addSessions, updateSession, deleteSession, DEFAULT_CHECKPOINT_TYPE_ID, type EventSession } from '../../data/sessionsData'
import { formatLateAfterTime } from '../../data/checkInStatus'
import { fetchInviteeIds, saveInvitees } from '../../data/inviteesData'
import { fetchAllStudents, countAllStudents, type Student } from '../StudentDirectory/studentDirectoryData'
import { InviteeSelector } from './InviteeSelector'

const FIELD_LABEL_CLASSES = 'text-[13px] font-bold text-[#33415c]'
const FIELD_ERROR_CLASSES = 'text-[12.5px] font-semibold text-[#d1453d]'
const CARD_CLASSES =
  'box-border flex w-full flex-col gap-[18px] rounded-2xl border border-[#eef6f5] bg-white px-[30px] py-7 shadow-[0_10px_30px_rgba(13,148,136,0.07)] max-[601px]:px-5 max-[601px]:py-[22px]'
const SECTION_TITLE_CLASSES = 'm-0 mb-0.5 text-[13px] font-extrabold tracking-[0.6px] text-[#0d9488] uppercase'
const SECTION_HINT_CLASSES = 'm-0 -mt-2 text-[12.5px] text-[#9aa6ba]'

const STATUS_OPTIONS: EventStatus[] = ['Upcoming', 'Active', 'Completed']
const STATUS_MODES: StatusMode[] = ['Automatic', 'Manual']

// The 3-step guided flow for creating a new event (see EventForm below) — Editing an existing
// event skips the wizard chrome and shows every section on one page instead, since by then staff
// are making a targeted fix, not being walked through a first-time setup.
const WIZARD_STEP_LABELS = ['Event Details', 'Schedule & Sessions', 'Registration']

function inputClasses(hasError: boolean) {
  return `w-full box-border rounded-[10px] px-3.5 py-3 bg-[#f7f9fc] text-sm text-[#12284a] border [transition:border-color_150ms_ease,background-color_150ms_ease,box-shadow_150ms_ease] focus:bg-white focus:border-[#0d9488] focus:shadow-[0_0_0_3px_rgba(13,148,136,0.12)] focus:outline-none ${
    hasError ? 'border-[#e05252]!' : 'border-[#e2e6ee]'
  }`
}

// Which NewEventForm fields belong to which wizard step — used to decide whether "Next" can
// advance, and (on submit) which step to jump back to if something turns out invalid.
function fieldsForStep(step: number): (keyof NewEventForm)[] {
  if (step === 1) return ['program', 'eventType']
  if (step === 2) return ['year', 'semester', 'startDate', 'endDate', 'startTime', 'endTime', 'location']
  return ['registrationType', 'capacity']
}

function stepHasErrors(
  step: number,
  formErrors: EventFormErrors,
  sessionErrors: Record<string, unknown>,
): boolean {
  const hasFieldError = fieldsForStep(step).some((field) => !!formErrors[field])
  if (step === 2) return hasFieldError || Object.keys(sessionErrors).length > 0
  return hasFieldError
}

// The inverse of fieldsForStep — which step a given field's error belongs to, so the wizard can
// reveal only the errors for steps actually attempted (see attemptedSteps above).
function stepForField(field: keyof NewEventForm): number {
  if (fieldsForStep(1).includes(field)) return 1
  if (fieldsForStep(2).includes(field)) return 2
  return 3
}

// Keeps only the entries of `errors` whose field belongs to an attempted step.
function revealedErrors(errors: EventFormErrors, attemptedSteps: Set<number>): EventFormErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(([field]) => attemptedSteps.has(stepForField(field as keyof NewEventForm))),
  ) as EventFormErrors
}

interface EventFormProps {
  mode: 'create' | 'edit'
  initialEvent?: EventItem
  initialSessions?: EventSession[]
  onCancel: () => void
  onSaved: (event: EventItem) => void
}

export function EventForm({ mode, initialEvent, initialSessions, onCancel, onSaved }: EventFormProps) {
  // A Completed event describes something that already happened — its schedule, capacity,
  // registration type, and invite list are historical facts, not things to keep editing. Only
  // descriptive fields (name, event type, description, location typo fixes) stay open.
  const isLockedByCompletion = mode === 'edit' && initialEvent?.status === 'Completed'
  const lockedFieldTitle = 'This event has ended — this field is locked to protect its historical record.'

  const [form, setForm] = useState<NewEventForm>(() => (initialEvent ? eventToForm(initialEvent) : EMPTY_EVENT_FORM))
  const [yearTouched, setYearTouched] = useState(false)
  const [semesterTouched, setSemesterTouched] = useState(false)
  const [sessions, setSessions] = useState<SessionFormRow[]>(() =>
    initialSessions && initialSessions.length > 0 ? sessionsToFormRows(initialSessions) : [createSessionRow()],
  )
  const [sessionsTouched, setSessionsTouched] = useState(false)
  // Quick-fill: define a session TYPE once (Morning/Afternoon/...) and pick which days it applies
  // to, instead of hand-building every day's session individually. Create-mode only — an existing
  // event's sessions may already have real check-ins locking them, and regenerating from scratch
  // would be destructive there; editing stays on the plain per-row list below, as before.
  const [sessionTypes, setSessionTypes] = useState<SessionTypeDraft[]>([])
  const eventDayRange = useMemo(() => getEventDayRange(form.startDate, form.endDate), [form.startDate, form.endDate])
  // Edit mode is one page, so a single "did they try to save" flag is enough to reveal every
  // error at once. The wizard needs finer grain — which STEPS have actually been attempted — so
  // moving from a valid Step 1 to Step 2 doesn't immediately flash "required" on Step 2's fields
  // before the person has had a chance to look at them.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [attemptedSteps, setAttemptedSteps] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Only meaningful in create mode's wizard — edit mode always shows every section, ignoring these.
  const [step, setStep] = useState(1)
  const [maxStepReached, setMaxStepReached] = useState(1)

  const [programSuggestions, setProgramSuggestions] = useState<string[]>([])
  const [eventTypeSuggestions, setEventTypeSuggestions] = useState<string[]>([])
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([])

  const [allStudents, setAllStudents] = useState<Student[]>([])
  const [studentsLoaded, setStudentsLoaded] = useState(false)
  const [invitees, setInvitees] = useState<Set<string>>(new Set())
  // What's already stored for this event, so saving can diff instead of rewriting the whole list.
  const [originalInvitees, setOriginalInvitees] = useState<string[]>([])
  // The live student count, shown as the practical ceiling for Open registration (in place of a
  // hardcoded number or an "∞" placeholder) — fetched unconditionally, unlike allStudents above,
  // since the Registration type help text needs it the moment Open is selected, not lazily.
  const [totalStudents, setTotalStudents] = useState<number | null>(null)

  const isInviteOnly = form.registrationType === 'Invite-only'
  const isWizard = mode === 'create'

  useEffect(() => {
    getProgramSuggestions().then(setProgramSuggestions)
    getEventTypeSuggestions().then(setEventTypeSuggestions)
    getLocationSuggestions().then(setLocationSuggestions)
    countAllStudents().then(setTotalStudents)
  }, [])

  // The student list is only needed for the invite picker, so it's fetched the first time
  // Invite-only is actually selected rather than on every event form open.
  useEffect(() => {
    if (!isInviteOnly) return
    let cancelled = false
    fetchAllStudents().then((students) => {
      if (cancelled) return
      setAllStudents(students)
      setStudentsLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [isInviteOnly])

  // Prefill the picker with whoever is already invited when editing an existing event.
  useEffect(() => {
    if (mode !== 'edit' || !initialEvent) return
    let cancelled = false
    fetchInviteeIds(initialEvent.id).then((ids) => {
      if (cancelled) return
      setOriginalInvitees(ids)
      setInvitees(new Set(ids))
    })
    return () => {
      cancelled = true
    }
  }, [mode, initialEvent])

  const eventDates = { startDate: form.startDate, endDate: form.endDate }
  const errors = isWizard
    ? revealedErrors(getEventFormErrors(form, mode), attemptedSteps)
    : attemptedSubmit
      ? getEventFormErrors(form, mode)
      : {}
  const sessionErrors = isWizard
    ? attemptedSteps.has(2)
      ? getSessionFormErrors(sessions, mode, eventDates)
      : {}
    : attemptedSubmit
      ? getSessionFormErrors(sessions, mode, eventDates)
      : {}

  function update<K extends keyof NewEventForm>(key: K, value: NewEventForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // While there's still just one, untouched session, keep it mirroring the event's own
  // start date/time — that covers the common single-day-event case with zero extra typing.
  // eventStartTime mirrors alongside openTime (not just openTime alone) so the common zero-buffer
  // case — the event starts exactly when its check-in window opens — needs no extra typing
  // either; editing ANY session field by hand (updateSessionField) already flips sessionsTouched,
  // which stops every kind of auto-sync here at once, so there's no need for a second, separate
  // "has eventStartTime specifically been touched" flag.
  function syncDefaultSession(patch: Partial<Pick<SessionFormRow, 'date' | 'openTime' | 'closeTime' | 'eventStartTime'>>) {
    setSessions((prev) => (!sessionsTouched && prev.length === 1 && !prev[0].id ? [{ ...prev[0], ...patch }] : prev))
  }

  function handleStartDateChange(value: string) {
    setForm((prev) => ({
      ...prev,
      startDate: value,
      year: yearTouched ? prev.year : suggestYear(value),
      semester: semesterTouched ? prev.semester : suggestSemester(value),
      endDate: prev.endDate && prev.endDate < value ? value : prev.endDate,
    }))
    syncDefaultSession({ date: value })
  }

  function handleStartTimeChange(value: string) {
    update('startTime', value)
    syncDefaultSession({ openTime: value, eventStartTime: value })
  }

  function handleEndTimeChange(value: string) {
    update('endTime', value)
    syncDefaultSession({ closeTime: value })
  }

  function handleAddSession() {
    setSessionsTouched(true)
    setSessions((prev) => relabelSessions([...prev, createSessionRow()]))
  }

  function handleRemoveSession(key: string) {
    setSessionsTouched(true)
    setSessions((prev) => (prev.length <= 1 ? prev : relabelSessions(prev.filter((s) => s.key !== key))))
  }

  function updateSessionLabel(key: string, value: string) {
    setSessionsTouched(true)
    setSessions((prev) => prev.map((s) => (s.key === key ? { ...s, label: value, labelTouched: true } : s)))
  }

  function updateSessionField(key: string, field: 'date' | 'openTime' | 'closeTime' | 'eventStartTime', value: string) {
    setSessionsTouched(true)
    setSessions((prev) => prev.map((s) => (s.key === key ? { ...s, [field]: value } : s)))
  }

  function updateSessionGraceMinutes(key: string, value: number) {
    setSessionsTouched(true)
    setSessions((prev) => prev.map((s) => (s.key === key ? { ...s, lateGraceMinutes: value } : s)))
  }

  // --- Session-type quick-fill (create mode only) --------------------------------------------

  function addSessionType(preset?: { label: string; openTime: string; closeTime: string }) {
    setSessionTypes((prev) => [
      ...prev,
      createSessionTypeDraft(
        preset ? { label: preset.label, openTime: preset.openTime, closeTime: preset.closeTime, eventStartTime: preset.openTime } : {},
      ),
    ])
  }

  function removeSessionType(key: string) {
    setSessionTypes((prev) => prev.filter((t) => t.key !== key))
  }

  function updateSessionType<K extends keyof SessionTypeDraft>(key: string, field: K, value: SessionTypeDraft[K]) {
    setSessionTypes((prev) => prev.map((t) => (t.key === key ? { ...t, [field]: value } : t)))
  }

  function toggleSessionTypeDay(key: string, date: string) {
    setSessionTypes((prev) =>
      prev.map((t) => (t.key === key ? { ...t, days: t.days.includes(date) ? t.days.filter((d) => d !== date) : [...t.days, date] } : t)),
    )
  }

  function setSessionTypeAllDays(key: string, allSelected: boolean) {
    setSessionTypes((prev) => prev.map((t) => (t.key === key ? { ...t, days: allSelected ? [] : [...eventDayRange] } : t)))
  }

  // Expands the session types into real session rows. In create mode this REPLACES whatever's
  // currently in the flat list below — safe there, since nothing generated during setup has a
  // real database id or check-ins yet. In edit mode it only ever APPENDS instead: an existing
  // event's sessions may already have real check-ins recorded against them (or simply be exactly
  // what the admin wants kept), so generating here must never silently remove or overwrite a row
  // that isn't brand new. Either way, the generated rows are then just ordinary, individually
  // editable session rows — a one-off exception doesn't need anything special, just a direct edit.
  function handleGenerateSessions() {
    const generated = generateSessionsFromTemplates(sessionTypes, eventDayRange)
    if (generated.length === 0) return
    setSessionsTouched(true)
    setSessions((prev) => (mode === 'create' ? generated : [...prev, ...generated]))
  }

  const generatedSessionCount = useMemo(
    () => generateSessionsFromTemplates(sessionTypes, eventDayRange).length,
    [sessionTypes, eventDayRange],
  )

  // Advances to the next wizard step, but only once the current step's own fields check out —
  // this is what gives the wizard its guided feel (catch a mistake on Step 1 before it's possible
  // to even reach Step 3), rather than piling every error up for the final Create click.
  function handleNext() {
    setAttemptedSteps((prev) => new Set(prev).add(step))
    const currentErrors = getEventFormErrors(form, mode)
    const currentSessionErrors = getSessionFormErrors(sessions, mode, eventDates)
    if (stepHasErrors(step, currentErrors, currentSessionErrors)) return
    const next = Math.min(WIZARD_STEP_LABELS.length, step + 1)
    setStep(next)
    setMaxStepReached((m) => Math.max(m, next))
  }

  function handleBack() {
    setStep((s) => Math.max(1, s - 1))
  }

  // Steps 1 & 2 of the wizard have no submit-type button in the DOM (only the final step does),
  // so pressing Enter in a text field there would otherwise do nothing at all — the browser's
  // native "implicit submission" needs a submit button to fire. This makes Enter behave like
  // clicking Continue instead, mirroring what a multi-step form should do. Left alone when a
  // child field has already used the keypress for its own purpose (a Typeahead selecting a
  // highlighted suggestion, a TimePicker committing its value) — those call preventDefault(),
  // which this checks via defaultPrevented — and when typing inside a textarea, where Enter must
  // stay a newline.
  function handleFormKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter' || e.defaultPrevented) return
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return
    if (isWizard && step < WIZARD_STEP_LABELS.length) {
      e.preventDefault()
      handleNext()
    }
  }

  // Step indicators only let you jump to a step you've already reached — going back is always
  // free (nothing typed is lost, the fields are just hidden), but skipping ahead without passing
  // through Next's validation isn't allowed.
  function handleStepClick(target: number) {
    if (target <= maxStepReached) setStep(target)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (isWizard) {
      setAttemptedSteps(new Set([1, 2, 3]))
    } else {
      setAttemptedSubmit(true)
    }
    setSubmitError('')
    const currentErrors = getEventFormErrors(form, mode)
    const currentSessionErrors = getSessionFormErrors(sessions, mode, eventDates)
    if (Object.keys(currentErrors).length > 0 || Object.keys(currentSessionErrors).length > 0) {
      // Land back on whichever step actually has the problem, rather than a submit click that
      // silently does nothing on Step 3 because Step 1 was the one left invalid.
      if (isWizard) {
        const badStep = [1, 2, 3].find((s) => stepHasErrors(s, currentErrors, currentSessionErrors))
        if (badStep) {
          setStep(badStep)
          setMaxStepReached((m) => Math.max(m, badStep))
        }
      }
      return
    }

    setSubmitting(true)
    const isLimited = form.registrationType === 'Limited'
    const status =
      form.statusMode === 'Manual' ? form.status : computeEventStatus(form.startDate, form.startTime, form.endDate, form.endTime)
    const eventPayload: Omit<EventItem, 'id' | 'checkedIn' | 'dateLabel' | 'timeLabel'> = {
      program: form.program.trim(),
      eventType: form.eventType.trim(),
      semester: form.semester as EventItem['semester'],
      startDate: form.startDate,
      endDate: form.endDate,
      startTime: form.startTime,
      endTime: form.endTime,
      location: form.location.trim(),
      capacity: isLimited ? Number(form.capacity) : 0,
      status,
      statusMode: form.statusMode,
      year: form.year.trim(),
      description: form.description.trim() || undefined,
      registrationType: form.registrationType as EventItem['registrationType'],
    }

    try {
      if (mode === 'create') {
        const event = await addEvent(eventPayload)
        await addSessions(
          sessions.map((session) => ({
            eventId: event.id,
            label: session.label.trim(),
            date: session.date,
            openTime: session.openTime,
            closeTime: session.closeTime,
            checkpointTypeId: DEFAULT_CHECKPOINT_TYPE_ID,
            eventStartTime: session.eventStartTime,
            eventEndTime: session.closeTime,
            lateGraceMinutes: session.lateGraceMinutes,
          })),
        )
        if (isInviteOnly) await saveInvitees(event.id, [...invitees], [])
        onSaved(event)
      } else {
        const event = await updateEvent(initialEvent!.id, eventPayload)

        const currentIds = new Set(sessions.filter((s): s is SessionFormRow & { id: string } => !!s.id).map((s) => s.id))
        const removed = (initialSessions ?? []).filter((s) => !currentIds.has(s.id))
        for (const session of removed) {
          await deleteSession(session.id, session.label)
        }

        const newRows = sessions.filter((s) => !s.id)
        const existingRows = sessions.filter((s): s is SessionFormRow & { id: string } => !!s.id)

        for (const session of existingRows) {
          await updateSession(session.id, {
            label: session.label.trim(),
            date: session.date,
            openTime: session.openTime,
            closeTime: session.closeTime,
            eventStartTime: session.eventStartTime,
            eventEndTime: session.closeTime,
            lateGraceMinutes: session.lateGraceMinutes,
          })
        }
        if (newRows.length > 0) {
          await addSessions(
            newRows.map((session) => ({
              eventId: event.id,
              label: session.label.trim(),
              date: session.date,
              openTime: session.openTime,
              closeTime: session.closeTime,
              checkpointTypeId: DEFAULT_CHECKPOINT_TYPE_ID,
              eventStartTime: session.eventStartTime,
              eventEndTime: session.closeTime,
              lateGraceMinutes: session.lateGraceMinutes,
            })),
          )
        }

        // Only written while the event is actually Invite-only. Switching to Open/Limited leaves
        // the stored list alone (so switching back restores it) — it just stops being enforced.
        if (isInviteOnly) await saveInvitees(event.id, [...invitees], originalInvitees)

        onSaved(event)
      }
    } catch (err) {
      setSubmitting(false)
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong saving this event. Please try again.')
    }
  }

  // --- Section content, shared verbatim between the create wizard (one step visible at a time)
  // and the edit page (every section shown at once) — kept as plain JSX values rather than
  // sub-components so they close over the same form state/handlers above with no prop threading.

  const eventDetailsSection: ReactNode = (
    <section className={CARD_CLASSES}>
      <h2 className={SECTION_TITLE_CLASSES}>Event Details</h2>
      <p className={SECTION_HINT_CLASSES}>The basics — what&rsquo;s happening, and what students should know before they show up.</p>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label className={FIELD_LABEL_CLASSES} htmlFor="event-program">
          Program
        </label>
        <TypeaheadInput
          id="event-program"
          value={form.program}
          onChange={(value) => update('program', value)}
          suggestions={programSuggestions}
          placeholder="Search or type a program..."
          hasError={!!errors.program}
        />
        {errors.program && (
          <span id="event-program-error" role="alert" className={FIELD_ERROR_CLASSES}>
            {errors.program}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label className={FIELD_LABEL_CLASSES} htmlFor="event-type">
          Event type
        </label>
        <TypeaheadInput
          id="event-type"
          value={form.eventType}
          onChange={(value) => update('eventType', value)}
          suggestions={eventTypeSuggestions}
          placeholder="Search or type an event type..."
          hasError={!!errors.eventType}
        />
        {errors.eventType && (
          <span id="event-type-error" role="alert" className={FIELD_ERROR_CLASSES}>
            {errors.eventType}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label className={FIELD_LABEL_CLASSES} htmlFor="event-description">
          Description <span className="font-medium text-[#9aa6ba] normal-case">(optional)</span>
        </label>
        <textarea
          id="event-description"
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          rows={4}
          placeholder="What should students know about this event?"
          className={`${inputClasses(false)} resize-y`}
        />
      </div>
    </section>
  )

  const scheduleSection: ReactNode = (
    <section className={CARD_CLASSES}>
      <h2 className={SECTION_TITLE_CLASSES}>Schedule</h2>
      <p className={SECTION_HINT_CLASSES}>When this runs — the academic term it belongs to, plus its overall start and end.</p>

      <div className="grid grid-cols-2 gap-[18px] max-[601px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className={FIELD_LABEL_CLASSES} htmlFor="event-year">
            Year
          </label>
          <input
            id="event-year"
            type="text"
            value={form.year}
            onChange={(e) => {
              setYearTouched(true)
              update('year', e.target.value)
            }}
            placeholder="e.g. 2026-2027"
            className={inputClasses(!!errors.year)}
            aria-invalid={!!errors.year}
            aria-describedby={errors.year ? 'event-year-error' : undefined}
          />
          {errors.year && (
            <span id="event-year-error" role="alert" className={FIELD_ERROR_CLASSES}>
              {errors.year}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label className={FIELD_LABEL_CLASSES} htmlFor="event-semester">
            Semester
          </label>
          <select
            id="event-semester"
            value={form.semester}
            onChange={(e) => {
              setSemesterTouched(true)
              update('semester', e.target.value as NewEventForm['semester'])
            }}
            className={`${inputClasses(!!errors.semester)} cursor-pointer`}
            aria-invalid={!!errors.semester}
            aria-describedby={errors.semester ? 'event-semester-error' : undefined}
          >
            <option value="">Select a semester</option>
            <option value="Fall">Fall</option>
            <option value="Winter">Winter</option>
            <option value="Summer">Summer</option>
          </select>
          {errors.semester && (
            <span id="event-semester-error" role="alert" className={FIELD_ERROR_CLASSES}>
              {errors.semester}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-[18px] max-[601px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className={FIELD_LABEL_CLASSES} htmlFor="event-start-date">
            Start date
          </label>
          <DatePicker
            id="event-start-date"
            value={form.startDate}
            onChange={handleStartDateChange}
            min={mode === 'create' ? todayDateString() : undefined}
            disabled={isLockedByCompletion}
            title={isLockedByCompletion ? lockedFieldTitle : undefined}
            hasError={!!errors.startDate}
          />
          {errors.startDate && (
            <span id="event-start-date-error" role="alert" className={FIELD_ERROR_CLASSES}>
              {errors.startDate}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label className={FIELD_LABEL_CLASSES} htmlFor="event-end-date">
            End date
          </label>
          <DatePicker
            id="event-end-date"
            value={form.endDate}
            min={form.startDate || undefined}
            onChange={(value) => update('endDate', value)}
            disabled={isLockedByCompletion}
            title={isLockedByCompletion ? lockedFieldTitle : undefined}
            hasError={!!errors.endDate}
          />
          {errors.endDate && (
            <span id="event-end-date-error" role="alert" className={FIELD_ERROR_CLASSES}>
              {errors.endDate}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-[18px] max-[601px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className={FIELD_LABEL_CLASSES} htmlFor="event-start-time">
            Start time
          </label>
          <TimePicker
            id="event-start-time"
            value={form.startTime}
            onChange={handleStartTimeChange}
            disabled={isLockedByCompletion}
            title={isLockedByCompletion ? lockedFieldTitle : undefined}
            hasError={!!errors.startTime}
          />
          {errors.startTime && (
            <span id="event-start-time-error" role="alert" className={FIELD_ERROR_CLASSES}>
              {errors.startTime}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label className={FIELD_LABEL_CLASSES} htmlFor="event-end-time">
            End time
          </label>
          <TimePicker
            id="event-end-time"
            value={form.endTime}
            onChange={handleEndTimeChange}
            disabled={isLockedByCompletion}
            title={isLockedByCompletion ? lockedFieldTitle : undefined}
            hasError={!!errors.endTime}
          />
          {errors.endTime && (
            <span id="event-end-time-error" role="alert" className={FIELD_ERROR_CLASSES}>
              {errors.endTime}
            </span>
          )}
        </div>
      </div>
    </section>
  )

  const locationSection: ReactNode = (
    <section className={CARD_CLASSES}>
      <h2 className={SECTION_TITLE_CLASSES}>Location</h2>
      <p className={SECTION_HINT_CLASSES}>Where students should go — shown wherever this event is listed.</p>
      <div className="flex min-w-0 flex-col gap-1.5">
        <label className={FIELD_LABEL_CLASSES} htmlFor="event-location">
          Where is it happening?
        </label>
        <TypeaheadInput
          id="event-location"
          value={form.location}
          onChange={(value) => update('location', value)}
          suggestions={locationSuggestions}
          placeholder="Search or type a location..."
          hasError={!!errors.location}
        />
        {errors.location && (
          <span id="event-location-error" role="alert" className={FIELD_ERROR_CLASSES}>
            {errors.location}
          </span>
        )}
      </div>
    </section>
  )

  const statusSection: ReactNode = (
    <section className={CARD_CLASSES}>
      <h2 className={SECTION_TITLE_CLASSES}>Status</h2>
      <p className={SECTION_HINT_CLASSES}>Whether this event shows as Upcoming, Active, or Completed.</p>

      <div className="flex min-w-0 flex-col gap-1.5">
        <span className={FIELD_LABEL_CLASSES}>Status mode</span>
        <div role="radiogroup" aria-label="Status mode" className="inline-flex w-fit gap-0.5 rounded-xl bg-[#eef1f6] p-1">
          {STATUS_MODES.map((statusMode) => (
            <button
              key={statusMode}
              type="button"
              role="radio"
              aria-checked={form.statusMode === statusMode}
              tabIndex={form.statusMode === statusMode ? 0 : -1}
              onClick={() => update('statusMode', statusMode)}
              onKeyDown={(e) => radioGroupKeyDown(e, (i) => update('statusMode', STATUS_MODES[i]))}
              className={`rounded-[9px] border-none px-5 py-[9px] text-[13.5px] font-semibold cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] ${
                form.statusMode === statusMode ? 'bg-[#12284a] text-white' : 'bg-transparent text-[#56617a] hover:text-[#12284a]'
              }`}
            >
              {statusMode}
            </button>
          ))}
        </div>
        {form.statusMode === 'Automatic' ? (
          <p className="m-0 mt-1 text-[12.5px] text-[#9aa6ba]">
            Status is calculated automatically from the event&rsquo;s start and end date/time.
          </p>
        ) : (
          <div className="mt-1.5 flex min-w-0 max-w-[260px] flex-col gap-1.5">
            <label className={FIELD_LABEL_CLASSES} htmlFor="event-status">
              Status
            </label>
            <select
              id="event-status"
              value={form.status}
              onChange={(e) => update('status', e.target.value as EventStatus)}
              className={`${inputClasses(false)} cursor-pointer`}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <p className="m-0 text-[12.5px] text-[#9aa6ba]">Stays exactly as set until switched back to Automatic.</p>
          </div>
        )}
      </div>
    </section>
  )

  const sessionsSection: ReactNode = (
    <section className={CARD_CLASSES}>
      <h2 className={SECTION_TITLE_CLASSES}>Check-in sessions</h2>
      <p className={SECTION_HINT_CLASSES}>
        Each session is a separate check-in window students scan into — add one per day for multi-day events.
      </p>

      {!isLockedByCompletion && (
        <div className="flex flex-col gap-3 rounded-[14px] border border-[#dbf3ef] bg-[#f0fdfa] p-4">
          <div>
            <h3 className="m-0 text-[13px] font-extrabold text-[#0d9488]">Quick-fill from session types</h3>
            <p className="m-0 mt-0.5 text-[12.5px] text-[#3f7a72]">
              For a multi-day event with the same check-in windows every day, define each type once (Morning, Afternoon,
              ...), pick which days it applies to, then generate every session in one click.{' '}
              {isWizard
                ? 'Generated sessions stay individually editable below for any one-off exception.'
                : "This adds new sessions alongside the ones already listed below — it never changes or removes an existing session, even ones with no check-ins yet."}
            </p>
          </div>

          {eventDayRange.length === 0 && (
            <p className="m-0 text-[12.5px] font-semibold text-[#a0740f]">Set the event's Start date first to pick days below.</p>
          )}

          {sessionTypes.map((type) => {
            const allDaysSelected = eventDayRange.length > 0 && eventDayRange.every((d) => type.days.includes(d))
            return (
              <div key={type.key} className="flex flex-col gap-2.5 rounded-[10px] border border-[#ccfbf1] bg-white p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={type.label}
                    onChange={(e) => updateSessionType(type.key, 'label', e.target.value)}
                    placeholder="e.g. Morning"
                    aria-label="Session type name"
                    className={`${inputClasses(false)} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => removeSessionType(type.key)}
                    aria-label={`Remove ${type.label || 'session type'}`}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[#e2e6ee] bg-white text-[#9aa6ba] cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] hover:bg-[#fdeceb] hover:text-[#d1453d]"
                  >
                    <XIcon size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[11.5px] font-bold text-[#56617a]" htmlFor={`type-open-${type.key}`}>
                      Opens
                    </label>
                    <TimePicker id={`type-open-${type.key}`} value={type.openTime} onChange={(v) => updateSessionType(type.key, 'openTime', v)} />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[11.5px] font-bold text-[#56617a]" htmlFor={`type-close-${type.key}`}>
                      Closes
                    </label>
                    <TimePicker id={`type-close-${type.key}`} value={type.closeTime} onChange={(v) => updateSessionType(type.key, 'closeTime', v)} />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[11.5px] font-bold text-[#56617a]" htmlFor={`type-start-${type.key}`}>
                      Event starts
                    </label>
                    <TimePicker
                      id={`type-start-${type.key}`}
                      value={type.eventStartTime}
                      onChange={(v) => updateSessionType(type.key, 'eventStartTime', v)}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[11.5px] font-bold text-[#56617a]" htmlFor={`type-grace-${type.key}`}>
                      Late after (min)
                    </label>
                    <input
                      id={`type-grace-${type.key}`}
                      type="number"
                      min={0}
                      step={1}
                      value={Number.isNaN(type.lateGraceMinutes) ? '' : type.lateGraceMinutes}
                      onChange={(e) =>
                        updateSessionType(type.key, 'lateGraceMinutes', e.target.value === '' ? NaN : Number(e.target.value))
                      }
                      className={inputClasses(false)}
                    />
                  </div>
                </div>

                {eventDayRange.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11.5px] font-bold text-[#56617a]">Applies to</span>
                    <div role="group" aria-label={`Days ${type.label || 'this session type'} applies to`} className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        aria-pressed={allDaysSelected}
                        onClick={() => setSessionTypeAllDays(type.key, allDaysSelected)}
                        className={`rounded-full border px-3 py-1.5 text-[12px] font-bold cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] ${
                          allDaysSelected ? 'border-[#0d9488] bg-[#0d9488] text-white' : 'border-[#e2e6ee] bg-white text-[#56617a] hover:bg-[#f2f5fa]'
                        }`}
                      >
                        All days
                      </button>
                      {eventDayRange.map((date, index) => {
                        const isSelected = type.days.includes(date)
                        const dayDate = new Date(`${date}T00:00:00`)
                        return (
                          <button
                            key={date}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => toggleSessionTypeDay(type.key, date)}
                            className={`rounded-full border px-3 py-1.5 text-[12px] font-bold cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] ${
                              isSelected ? 'border-[#0d9488] bg-[#0d9488] text-white' : 'border-[#e2e6ee] bg-white text-[#56617a] hover:bg-[#f2f5fa]'
                            }`}
                          >
                            Day {index + 1}{' '}
                            <span className="opacity-70">· {dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          <div className="flex flex-wrap items-center gap-2">
            {SESSION_TYPE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => addSessionType(preset)}
                className="inline-flex items-center gap-1 rounded-[9px] border border-[#ccfbf1] bg-white px-3 py-2 text-[12.5px] font-bold text-[#0d9488] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#e5faf7]"
              >
                <PlusIcon size={12} />
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => addSessionType()}
              className="inline-flex items-center gap-1 rounded-[9px] border border-[#ccfbf1] bg-white px-3 py-2 text-[12.5px] font-bold text-[#0d9488] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#e5faf7]"
            >
              <PlusIcon size={12} />
              Custom type
            </button>
          </div>

          {sessionTypes.length > 0 && (
            <button
              type="button"
              onClick={handleGenerateSessions}
              disabled={generatedSessionCount === 0}
              className="inline-flex w-fit items-center gap-1.5 rounded-[10px] border-none bg-[#0d9488] px-4 py-2.5 text-[13px] font-bold text-white cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] hover:not-disabled:bg-[#0b7d73] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isWizard ? 'Generate' : 'Add'} {generatedSessionCount || ''} session{generatedSessionCount === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {sessions.map((session) => {
          const rowErrors = sessionErrors[session.key] ?? {}
          const lockedByCheckIns = session.checkInCount > 0
          return (
            <div key={session.key} className="flex flex-col gap-3 rounded-[14px] border border-[#eef1f6] bg-[#fbfcfe] p-4">
              <div className="flex items-start gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLASSES} htmlFor={`session-label-${session.key}`}>
                    Label
                  </label>
                  <input
                    id={`session-label-${session.key}`}
                    type="text"
                    value={session.label}
                    onChange={(e) => updateSessionLabel(session.key, e.target.value)}
                    placeholder="e.g. Day 1"
                    className={inputClasses(!!rowErrors.label)}
                  />
                  {rowErrors.label && <span className={FIELD_ERROR_CLASSES}>{rowErrors.label}</span>}
                  {lockedByCheckIns && (
                    <span className="text-[11.5px] font-semibold text-[#9aa6ba]">
                      {session.checkInCount} check-in{session.checkInCount === 1 ? '' : 's'} recorded — can&rsquo;t be removed
                    </span>
                  )}
                </div>
                {sessions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveSession(session.key)}
                    disabled={lockedByCheckIns}
                    aria-label={`Remove ${session.label || 'session'}`}
                    title={lockedByCheckIns ? "Can't remove — this session already has check-ins recorded" : undefined}
                    className="mt-[26px] inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-[#e2e6ee] bg-white text-[#9aa6ba] cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] hover:not-disabled:bg-[#fdeceb] hover:not-disabled:text-[#d1453d] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <XIcon size={15} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 max-[601px]:grid-cols-1">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLASSES} htmlFor={`session-date-${session.key}`}>
                    Date
                  </label>
                  <DatePicker
                    id={`session-date-${session.key}`}
                    value={session.date}
                    onChange={(value) => updateSessionField(session.key, 'date', value)}
                    min={form.startDate || (mode === 'create' ? todayDateString() : undefined)}
                    max={form.endDate || undefined}
                    hasError={!!rowErrors.date}
                  />
                  {rowErrors.date && (
                    <span id={`session-date-${session.key}-error`} role="alert" className={FIELD_ERROR_CLASSES}>
                      {rowErrors.date}
                    </span>
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLASSES} htmlFor={`session-open-${session.key}`}>
                    Opens
                  </label>
                  <TimePicker
                    id={`session-open-${session.key}`}
                    value={session.openTime}
                    onChange={(value) => updateSessionField(session.key, 'openTime', value)}
                    hasError={!!rowErrors.openTime}
                  />
                  {rowErrors.openTime && <span className={FIELD_ERROR_CLASSES}>{rowErrors.openTime}</span>}
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLASSES} htmlFor={`session-close-${session.key}`}>
                    Closes
                    {sessionClosesNextDay(session) && (
                      <span
                        className="ml-1.5 inline-flex items-center rounded-full bg-[#eaf2fe] px-2 py-[1px] align-middle text-[10.5px] font-bold tracking-[0.2px] text-[#2f6fed]"
                        title="Closes time is earlier than Opens time, so this window is understood to end the day after the session's Date."
                      >
                        Closes next day
                      </span>
                    )}
                  </label>
                  <TimePicker
                    id={`session-close-${session.key}`}
                    value={session.closeTime}
                    onChange={(value) => updateSessionField(session.key, 'closeTime', value)}
                    hasError={!!rowErrors.closeTime}
                  />
                  {rowErrors.closeTime && <span className={FIELD_ERROR_CLASSES}>{rowErrors.closeTime}</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-[10px] border border-[#eef1f6] bg-white p-3 max-[601px]:grid-cols-1">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLASSES} htmlFor={`session-event-start-${session.key}`}>
                    Event starts
                  </label>
                  <TimePicker
                    id={`session-event-start-${session.key}`}
                    value={session.eventStartTime}
                    onChange={(value) => updateSessionField(session.key, 'eventStartTime', value)}
                    hasError={!!rowErrors.eventStartTime}
                  />
                  {rowErrors.eventStartTime ? (
                    <span className={FIELD_ERROR_CLASSES}>{rowErrors.eventStartTime}</span>
                  ) : (
                    <span className="text-[11.5px] text-[#9aa6ba]">
                      When the event itself actually begins — Early/On-time/Late is judged against this, not Opens.
                    </span>
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLASSES} htmlFor={`session-grace-${session.key}`}>
                    Late after (minutes)
                  </label>
                  <input
                    id={`session-grace-${session.key}`}
                    type="number"
                    min={0}
                    step={1}
                    value={Number.isNaN(session.lateGraceMinutes) ? '' : session.lateGraceMinutes}
                    onChange={(e) => updateSessionGraceMinutes(session.key, e.target.value === '' ? NaN : Number(e.target.value))}
                    className={inputClasses(!!rowErrors.lateGraceMinutes)}
                  />
                  {rowErrors.lateGraceMinutes ? (
                    <span className={FIELD_ERROR_CLASSES}>{rowErrors.lateGraceMinutes}</span>
                  ) : session.date && session.eventStartTime && !rowErrors.eventStartTime ? (
                    <span className="text-[11.5px] text-[#9aa6ba]">
                      Marked late after{' '}
                      {formatLateAfterTime({
                        date: session.date,
                        eventStartTime: session.eventStartTime,
                        lateGraceMinutes: session.lateGraceMinutes,
                      })}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={handleAddSession}
        className="inline-flex w-fit items-center gap-1.5 rounded-[10px] border border-[#dbf3ef] bg-[#f0fdfa] px-4 py-2.5 text-[13.5px] font-bold text-[#0d9488] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#dbf3ef]"
      >
        <PlusIcon size={14} />
        Add session
      </button>
    </section>
  )

  const registrationSection: ReactNode = (
    <section className={CARD_CLASSES}>
      <h2 className={SECTION_TITLE_CLASSES}>Registration type</h2>
      <p className={SECTION_HINT_CLASSES}>Decide who&rsquo;s allowed to check in, and whether there&rsquo;s a limit on how many.</p>

      <div className="flex min-w-0 flex-col gap-1.5">
        <div role="radiogroup" aria-label="Registration type" className="inline-flex w-fit gap-0.5 rounded-xl bg-[#eef1f6] p-1">
          {REGISTRATION_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={form.registrationType === type}
              tabIndex={(form.registrationType || REGISTRATION_TYPES[0]) === type ? 0 : -1}
              onClick={() => update('registrationType', type)}
              onKeyDown={(e) => radioGroupKeyDown(e, (i) => update('registrationType', REGISTRATION_TYPES[i]))}
              disabled={isLockedByCompletion}
              title={isLockedByCompletion ? lockedFieldTitle : undefined}
              className={`rounded-[9px] border-none px-5 py-[9px] text-[13.5px] font-semibold [transition:background-color_150ms_ease,color_150ms_ease] disabled:cursor-not-allowed ${
                form.registrationType === type
                  ? 'bg-[#12284a] text-white'
                  : `bg-transparent text-[#56617a] ${isLockedByCompletion ? '' : 'cursor-pointer hover:text-[#12284a]'}`
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        {errors.registrationType && (
          <span id="event-registration-type-error" role="alert" className={FIELD_ERROR_CLASSES}>
            {errors.registrationType}
          </span>
        )}
      </div>

      <p className="m-0 -mt-2 text-[12.5px] text-[#9aa6ba]">
        {form.registrationType === 'Limited'
          ? 'Open to any student, but check-ins stop once capacity is reached.'
          : form.registrationType === 'Invite-only'
            ? 'Only students on the invite list below can check in. They still use their existing Fusion pass — no new QR code is issued.'
            : totalStudents !== null
              ? `Any student can check in, with no fixed cap — the practical ceiling is the ${totalStudents} student${totalStudents === 1 ? '' : 's'} currently in the system.`
              : 'Any student can check in, with no cap.'}
      </p>

      {form.registrationType === 'Limited' && (
        <div className="flex min-w-0 max-w-[220px] flex-col gap-1.5">
          <label className={FIELD_LABEL_CLASSES} htmlFor="event-capacity">
            Capacity
          </label>
          <input
            id="event-capacity"
            type="number"
            min={1}
            value={form.capacity}
            onChange={(e) => update('capacity', e.target.value)}
            placeholder="e.g. 100"
            disabled={isLockedByCompletion}
            title={isLockedByCompletion ? lockedFieldTitle : undefined}
            className={`${inputClasses(!!errors.capacity)} disabled:cursor-not-allowed disabled:opacity-60`}
            aria-invalid={!!errors.capacity}
            aria-describedby={errors.capacity ? 'event-capacity-error' : undefined}
          />
          {errors.capacity && (
            <span id="event-capacity-error" role="alert" className={FIELD_ERROR_CLASSES}>
              {errors.capacity}
            </span>
          )}
        </div>
      )}
    </section>
  )

  const inviteesSection: ReactNode = isInviteOnly && (
    <section className={CARD_CLASSES}>
      <h2 className={SECTION_TITLE_CLASSES}>Invited students</h2>
      <p className={SECTION_HINT_CLASSES}>
        Search or upload a list to build the guest list — only students on it will be able to check in.
      </p>
      <InviteeSelector
        students={allStudents}
        loading={!studentsLoaded}
        selected={invitees}
        onChange={setInvitees}
        readOnly={isLockedByCompletion}
      />
    </section>
  )

  const submitLabel = submitting ? (mode === 'create' ? 'Creating event…' : 'Saving changes…') : mode === 'create' ? 'Create event' : 'Save changes'

  const submitErrorBanner = submitError && (
    <div className="rounded-[10px] border border-[#f8c9c9] bg-[#fde8e8] px-3.5 py-3 text-[13px] font-semibold text-[#d1453d]">{submitError}</div>
  )

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[30px] font-extrabold text-[#12284a] max-[701px]:text-2xl">
            {mode === 'create' ? 'Add Event' : 'Edit Event'}
          </h1>
          <p className="m-0 text-sm text-[#7c8aa0]">
            {mode === 'create'
              ? 'A few quick steps to get a new event ready for check-ins.'
              : 'Update this event’s details.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 rounded-xl border border-[#e2e6ee] bg-white px-5 py-3 text-sm font-bold text-[#56617a] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f2f5fa]"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate className="flex w-full flex-col gap-[18px]">
        {isLockedByCompletion && (
          <div className="flex items-start gap-3 rounded-2xl border border-[#fbedc0] bg-[#fff8e1] px-5 py-4">
            <span className="mt-0.5 shrink-0 text-[#a0740f]">
              <ClockIcon size={18} />
            </span>
            <div>
              <p className="m-0 text-[13.5px] font-bold text-[#a0740f]">This event has ended — only limited details can be edited</p>
              <p className="m-0 mt-0.5 text-[12.5px] text-[#a0740f]">
                Its schedule, capacity, registration type, and invite list are locked to protect the attendance record. You
                can still update the description, or fix a typo in the name or location.
              </p>
            </div>
          </div>
        )}

        {isWizard && (
          <div className={CARD_CLASSES}>
            <WizardProgress
              steps={WIZARD_STEP_LABELS}
              currentStep={step}
              maxStepReached={maxStepReached}
              onStepClick={handleStepClick}
            />
          </div>
        )}

        {isWizard ? (
          <>
            {step === 1 && eventDetailsSection}
            {step === 2 && (
              <>
                {scheduleSection}
                {locationSection}
                {statusSection}
                {sessionsSection}
              </>
            )}
            {step === 3 && (
              <>
                {registrationSection}
                {inviteesSection}
              </>
            )}

            {submitErrorBanner}

            <div className="flex items-center justify-between gap-3">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-1.5 rounded-[14px] border border-[#e2e6ee] bg-white px-6 py-4 text-[14px] font-bold text-[#56617a] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f2f5fa]"
                >
                  <ChevronLeftIcon size={16} />
                  Back
                </button>
              ) : (
                <span />
              )}

              {step < WIZARD_STEP_LABELS.length ? (
                <button
                  key="continue"
                  type="button"
                  onClick={handleNext}
                  className="rounded-[14px] border-none bg-[linear-gradient(120deg,#0d9488,#14b8a6)] px-8 py-4 text-[15.5px] font-extrabold text-white cursor-pointer [transition:transform_150ms_ease,box-shadow_150ms_ease] shadow-[0_10px_24px_rgba(13,148,136,0.25)] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(13,148,136,0.32)]"
                >
                  Continue
                </button>
              ) : (
                // A distinct `key` from the Continue button above is required, not just style —
                // without one, React reuses the same underlying DOM button and only flips its
                // `type` attribute from "button" to "submit" in place. The click that just
                // advanced the wizard to this final step then completes as a genuine submit
                // click on that now-mutated node, firing the form immediately on arrival.
                <button
                  key="submit"
                  type="submit"
                  disabled={submitting}
                  className="rounded-[14px] border-none bg-[linear-gradient(120deg,#0d9488,#14b8a6)] px-8 py-4 text-[15.5px] font-extrabold text-white cursor-pointer [transition:transform_150ms_ease,box-shadow_150ms_ease] shadow-[0_10px_24px_rgba(13,148,136,0.25)] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(13,148,136,0.32)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitLabel}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            {eventDetailsSection}
            {scheduleSection}
            {locationSection}
            {statusSection}
            {sessionsSection}
            {registrationSection}
            {inviteesSection}

            {submitErrorBanner}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-[14px] border-none bg-[linear-gradient(120deg,#0d9488,#14b8a6)] px-6 py-4 text-[15.5px] font-extrabold text-white cursor-pointer [transition:transform_150ms_ease,box-shadow_150ms_ease] shadow-[0_10px_24px_rgba(13,148,136,0.25)] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(13,148,136,0.32)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitLabel}
            </button>
          </>
        )}
      </form>
    </div>
  )
}
