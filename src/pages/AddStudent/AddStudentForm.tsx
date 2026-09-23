import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircleIcon, DownloadIcon } from '../../components/icons/NavIcons'
import { ProgramAutocomplete } from './ProgramAutocomplete'
import { QrPassPreview } from './QrPassPreview'
import { supabase } from '../../lib/supabaseClient'
import { fetchPassToken } from '../../data/passesData'
import { generatePassPdf } from '../PassTools/generatePassPdf'
import type { Student } from '../StudentDirectory/studentDirectoryData'
import {
  FACULTIES,
  LEVELS,
  YEARS,
  OTHER_OPTION,
  STUDENT_ID_PATTERN,
  EMAIL_PATTERN,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  getLiveProgramSuggestions,
  EMPTY_STUDENT_FORM,
  type NewStudentForm,
  type StudentLevel,
} from './addStudentData'

type FormErrors = Partial<Record<keyof NewStudentForm, string>>

const FIELD_LABEL_CLASSES = 'text-[13px] font-bold text-[#33415c]'
const FIELD_ERROR_CLASSES = 'text-[12.5px] font-semibold text-[#d1453d]'
const CARD_CLASSES =
  'box-border flex w-full flex-col gap-[18px] rounded-2xl border border-[#eef6f5] bg-white px-[30px] py-7 shadow-[0_10px_30px_rgba(13,148,136,0.07)] max-[601px]:px-5 max-[601px]:py-[22px]'

function inputClasses(hasError: boolean) {
  return `w-full box-border rounded-[10px] px-3.5 py-3 bg-[#f7f9fc] text-sm text-[#12284a] border [transition:border-color_150ms_ease,background-color_150ms_ease,box-shadow_150ms_ease] focus:bg-white focus:border-[#0d9488] focus:shadow-[0_0_0_3px_rgba(13,148,136,0.12)] focus:outline-none ${
    hasError ? 'border-[#e05252]!' : 'border-[#e2e6ee]'
  }`
}

function getErrors(form: NewStudentForm): FormErrors {
  const errors: FormErrors = {}

  if (!form.firstName.trim()) {
    errors.firstName = 'This field is required'
  } else if (form.firstName.trim().length > NAME_MAX_LENGTH) {
    errors.firstName = `Must be ${NAME_MAX_LENGTH} characters or fewer`
  } else if (!NAME_PATTERN.test(form.firstName.trim())) {
    errors.firstName = 'Letters only — no numbers or symbols'
  }

  if (!form.lastName.trim()) {
    errors.lastName = 'This field is required'
  } else if (form.lastName.trim().length > NAME_MAX_LENGTH) {
    errors.lastName = `Must be ${NAME_MAX_LENGTH} characters or fewer`
  } else if (!NAME_PATTERN.test(form.lastName.trim())) {
    errors.lastName = 'Letters only — no numbers or symbols'
  }

  if (form.middleName.trim() && !NAME_PATTERN.test(form.middleName.trim())) {
    errors.middleName = 'Letters only — no numbers or symbols'
  }

  if (!form.studentId.trim()) {
    errors.studentId = 'This field is required'
  } else if (!STUDENT_ID_PATTERN.test(form.studentId.trim())) {
    errors.studentId = 'Student ID must be 9 digits'
  }

  if (!form.email.trim()) {
    errors.email = 'This field is required'
  } else if (!EMAIL_PATTERN.test(form.email.trim())) {
    errors.email = 'Enter a valid email address'
  } else if (!form.email.trim().toLowerCase().endsWith('@uwindsor.ca')) {
    errors.email = 'Must be a valid @uwindsor.ca email'
  }

  if (!form.faculty.trim()) {
    errors.faculty = 'This field is required'
  } else if (form.faculty === OTHER_OPTION && !form.customFaculty.trim()) {
    errors.customFaculty = 'This field is required'
  }

  if (!form.program.trim()) errors.program = 'This field is required'
  if (!form.currentYear.trim()) errors.currentYear = 'This field is required'

  return errors
}

interface SubmittedStudent {
  // A full profile, shaped exactly like Pass Tools' own Student — lets the success screen reuse
  // generatePassPdf() (and QrPassPreview) unchanged rather than a parallel one-off version of it.
  student: Student
  // The real random token the database generated for this student's pass, returned straight from
  // the insert below — the success screen's QR and PDF are built from this, never from the
  // student ID.
  passToken: string | null
}

export function AddStudentForm() {
  const [form, setForm] = useState<NewStudentForm>(EMPTY_STUDENT_FORM)
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [submitted, setSubmitted] = useState<SubmittedStudent | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const errors = attemptedSubmit ? getErrors(form) : {}
  const effectiveFaculty = form.faculty === OTHER_OPTION ? form.customFaculty : form.faculty

  function updateField<K extends keyof NewStudentForm>(field: K, value: NewStudentForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleFacultyChange(faculty: string) {
    setForm((prev) => ({
      ...prev,
      faculty,
      customFaculty: faculty === OTHER_OPTION ? prev.customFaculty : '',
      program: '',
    }))
  }

  function handleLevelChange(level: StudentLevel) {
    setForm((prev) => ({ ...prev, level, program: '' }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setAttemptedSubmit(true)
    setSubmitError('')
    const currentErrors = getErrors(form)
    if (Object.keys(currentErrors).length > 0) return

    setSubmitting(true)
    const fullName = `${form.firstName} ${form.lastName}`.trim()

    const { data: student, error: studentError } = await supabase
      .from('students')
      .insert({
        student_number: form.studentId.trim(),
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim(),
        faculty: effectiveFaculty,
        program: form.program,
        level: form.level,
        year: form.currentYear,
        status: 'Active',
      })
      .select()
      .single()

    if (studentError || !student) {
      setSubmitting(false)
      setSubmitError(
        studentError?.code === '23505'
          ? 'A student with that ID or email already exists.'
          : 'Something went wrong creating this student. Please try again.',
      )
      return
    }

    // There's no direct SELECT on `passes` anymore (schema-lock-pass-tokens.sql), so the insert
    // can't read its own row back via `.select()` the way it used to — RLS blocks that RETURNING
    // just like any other select. Insert, then fetch the token through get_pass_token(), the same
    // Admin-only path Pass Tools already uses.
    const { error: passError } = await supabase.from('passes').insert({ student_id: student.id })
    const passToken = passError ? null : await fetchPassToken(student.id)
    setSubmitting(false)

    if (passError) {
      setSubmitError('Student was created, but their pass could not be generated. Please try reissuing it from Pass Tools.')
    }

    setSubmitted({
      student: {
        id: student.student_number,
        uuid: student.id,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        fullName,
        email: form.email.trim(),
        faculty: effectiveFaculty,
        program: form.program,
        level: form.level,
        year: form.currentYear,
        status: 'Active',
        dateJoined: student.created_at,
        passStatus: 'Active',
        reissueCount: 0,
      },
      passToken,
    })
  }

  function handleAddAnother() {
    setForm(EMPTY_STUDENT_FORM)
    setAttemptedSubmit(false)
    setSubmitted(null)
    setSubmitError('')
  }

  const [downloading, setDownloading] = useState(false)

  async function handleDownloadPass() {
    if (!submitted?.passToken) return
    setDownloading(true)
    try {
      await generatePassPdf(submitted.student, submitted.passToken)
    } finally {
      setDownloading(false)
    }
  }

  const [programSuggestions, setProgramSuggestions] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    getLiveProgramSuggestions(effectiveFaculty, form.level).then((suggestions) => {
      if (cancelled) return
      setProgramSuggestions(suggestions)
    })
    return () => {
      cancelled = true
    }
  }, [effectiveFaculty, form.level])

  if (submitted) {
    return (
      <div className="flex w-full flex-col items-center gap-3.5 rounded-[20px] border border-[#eef6f5] bg-white px-9 py-12 text-center shadow-[0_10px_30px_rgba(13,148,136,0.08)] max-[601px]:px-[22px] max-[601px]:py-9">
        <div className="mb-1 flex h-16 w-16 items-center justify-center rounded-full bg-[#ccfbf1] text-[#0d9488] [animation:add-student-check-pop_420ms_cubic-bezier(0.34,1.56,0.64,1)]">
          <CheckCircleIcon size={30} />
        </div>
        <h1 className="m-0 text-2xl font-extrabold text-[#12284a]">You&apos;re all set!</h1>
        <p className="m-0 mb-2 text-[15px] text-[#6b7a94]">
          {submitted.student.fullName}&apos;s permanent Fusion Pass has been generated.
        </p>

        <QrPassPreview
          passToken={submitted.passToken}
          name={submitted.student.fullName}
          faculty={submitted.student.faculty}
          levelLabel={`${submitted.student.level} · ${submitted.student.year}`}
        />

        <div className="mt-4 flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={handleDownloadPass}
            disabled={downloading || !submitted.passToken}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-none bg-[#0d9488] px-5 py-[13px] text-sm font-bold text-white cursor-pointer [transition:background-color_150ms_ease,translate_150ms_ease] hover:not-disabled:-translate-y-px hover:not-disabled:bg-[#0b7d73] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <DownloadIcon size={16} />
            {downloading ? 'Generating PDF…' : 'Download Pass'}
          </button>

          <div className="flex w-full gap-3 max-[601px]:flex-col">
            <button
              type="button"
              className="flex-1 rounded-xl border border-[#d8e2e0] bg-transparent px-5 py-[13px] text-sm font-bold text-[#56617a] cursor-pointer [transition:background-color_150ms_ease,border-color_150ms_ease] hover:border-[#c3d1cf] hover:bg-[#f7f9fc]"
              onClick={handleAddAnother}
            >
              Add another student
            </button>
            <button
              type="button"
              className="flex-1 rounded-xl border border-[#d8e2e0] bg-transparent px-5 py-[13px] text-sm font-bold text-[#56617a] cursor-pointer [transition:background-color_150ms_ease,border-color_150ms_ease] hover:border-[#c3d1cf] hover:bg-[#f7f9fc]"
              onClick={() => window.close()}
            >
              Close this tab
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form className="flex w-full flex-col gap-[22px]" onSubmit={handleSubmit} noValidate>
      <section className={CARD_CLASSES}>
        <h2 className="m-0 mb-0.5 text-[13px] font-extrabold tracking-[0.6px] text-[#0d9488] uppercase">Personal Info</h2>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="firstName" className={FIELD_LABEL_CLASSES}>
            First Name
          </label>
          <input
            id="firstName"
            type="text"
            value={form.firstName}
            onChange={(e) => updateField('firstName', e.target.value)}
            maxLength={NAME_MAX_LENGTH}
            className={inputClasses(Boolean(errors.firstName))}
            aria-invalid={Boolean(errors.firstName)}
            aria-describedby={errors.firstName ? 'firstName-error' : undefined}
          />
          {errors.firstName && (
            <span id="firstName-error" role="alert" className={FIELD_ERROR_CLASSES}>
              {errors.firstName}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="middleName" className={FIELD_LABEL_CLASSES}>
            Middle Name <span className="font-medium text-[#9aa6ba]">(optional)</span>
          </label>
          <input
            id="middleName"
            type="text"
            value={form.middleName}
            onChange={(e) => updateField('middleName', e.target.value)}
            maxLength={NAME_MAX_LENGTH}
            className={inputClasses(Boolean(errors.middleName))}
            aria-invalid={Boolean(errors.middleName)}
            aria-describedby={errors.middleName ? 'middleName-error' : undefined}
          />
          {errors.middleName && (
            <span id="middleName-error" role="alert" className={FIELD_ERROR_CLASSES}>
              {errors.middleName}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="lastName" className={FIELD_LABEL_CLASSES}>
            Last Name
          </label>
          <input
            id="lastName"
            type="text"
            value={form.lastName}
            onChange={(e) => updateField('lastName', e.target.value)}
            maxLength={NAME_MAX_LENGTH}
            className={inputClasses(Boolean(errors.lastName))}
            aria-invalid={Boolean(errors.lastName)}
            aria-describedby={errors.lastName ? 'lastName-error' : undefined}
          />
          {errors.lastName && (
            <span id="lastName-error" role="alert" className={FIELD_ERROR_CLASSES}>
              {errors.lastName}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-[18px] max-[601px]:grid-cols-1">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="studentId" className={FIELD_LABEL_CLASSES}>
              Student ID
            </label>
            <input
              id="studentId"
              type="text"
              inputMode="numeric"
              value={form.studentId}
              onChange={(e) => updateField('studentId', e.target.value)}
              className={inputClasses(Boolean(errors.studentId))}
              placeholder="e.g. 110277001"
              aria-invalid={Boolean(errors.studentId)}
              aria-describedby={errors.studentId ? 'studentId-error' : undefined}
            />
            {errors.studentId && (
              <span id="studentId-error" role="alert" className={FIELD_ERROR_CLASSES}>
                {errors.studentId}
              </span>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="email" className={FIELD_LABEL_CLASSES}>
              University Email
            </label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              className={inputClasses(Boolean(errors.email))}
              placeholder="e.g. student@uwindsor.ca"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <span id="email-error" role="alert" className={FIELD_ERROR_CLASSES}>
                {errors.email}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className={CARD_CLASSES}>
        <h2 className="m-0 mb-0.5 text-[13px] font-extrabold tracking-[0.6px] text-[#0d9488] uppercase">Academic Info</h2>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="faculty" className={FIELD_LABEL_CLASSES}>
            Faculty
          </label>
          <select
            id="faculty"
            value={form.faculty}
            onChange={(e) => handleFacultyChange(e.target.value)}
            className={`${inputClasses(Boolean(errors.faculty))} cursor-pointer`}
            aria-invalid={Boolean(errors.faculty)}
            aria-describedby={errors.faculty ? 'faculty-error' : undefined}
          >
            <option value="">Select a faculty</option>
            {FACULTIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
            <option value={OTHER_OPTION}>{OTHER_OPTION}</option>
          </select>
          {errors.faculty && (
            <span id="faculty-error" role="alert" className={FIELD_ERROR_CLASSES}>
              {errors.faculty}
            </span>
          )}
        </div>

        {form.faculty === OTHER_OPTION && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="customFaculty" className={FIELD_LABEL_CLASSES}>
              Faculty name
            </label>
            <input
              id="customFaculty"
              type="text"
              value={form.customFaculty}
              onChange={(e) => updateField('customFaculty', e.target.value)}
              className={inputClasses(Boolean(errors.customFaculty))}
              placeholder="Enter the faculty name"
              autoFocus
              aria-invalid={Boolean(errors.customFaculty)}
              aria-describedby={errors.customFaculty ? 'customFaculty-error' : undefined}
            />
            {errors.customFaculty && (
              <span id="customFaculty-error" role="alert" className={FIELD_ERROR_CLASSES}>
                {errors.customFaculty}
              </span>
            )}
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="level" className={FIELD_LABEL_CLASSES}>
            Program Level
          </label>
          <select
            id="level"
            value={form.level}
            onChange={(e) => handleLevelChange(e.target.value as StudentLevel)}
            className={`${inputClasses(false)} cursor-pointer`}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="program" className={FIELD_LABEL_CLASSES}>
            Course / Academic Program
          </label>
          <ProgramAutocomplete
            id="program"
            value={form.program}
            onChange={(value) => updateField('program', value)}
            suggestions={programSuggestions}
            disabled={!effectiveFaculty}
            hasError={Boolean(errors.program)}
          />
          {errors.program && (
            <span id="program-error" role="alert" className={FIELD_ERROR_CLASSES}>
              {errors.program}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="currentYear" className={FIELD_LABEL_CLASSES}>
            Current Year
          </label>
          <select
            id="currentYear"
            value={form.currentYear}
            onChange={(e) => updateField('currentYear', e.target.value)}
            className={`${inputClasses(Boolean(errors.currentYear))} cursor-pointer`}
            aria-invalid={Boolean(errors.currentYear)}
            aria-describedby={errors.currentYear ? 'currentYear-error' : undefined}
          >
            <option value="">Select a year</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {errors.currentYear && (
            <span id="currentYear-error" role="alert" className={FIELD_ERROR_CLASSES}>
              {errors.currentYear}
            </span>
          )}
        </div>
      </section>

      {submitError && (
        <div className="rounded-[10px] border border-[#f8c9c9] bg-[#fde8e8] px-3.5 py-3 text-[13px] font-semibold text-[#d1453d]">
          {submitError}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-[14px] border-none bg-[linear-gradient(120deg,#0d9488,#14b8a6)] px-6 py-4 text-[15.5px] font-extrabold text-white cursor-pointer shadow-[0_10px_24px_rgba(13,148,136,0.25)] [transition:translate_150ms_ease,box-shadow_150ms_ease] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(13,148,136,0.32)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Adding student…' : 'Add student'}
      </button>
    </form>
  )
}
