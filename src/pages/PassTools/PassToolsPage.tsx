import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SearchIcon, ChevronLeftIcon } from '../../components/icons/NavIcons'
import { Modal } from '../../components/Modal/Modal'
import { FACULTIES, LEVELS, YEARS, getLiveProgramSuggestions, type StudentLevel } from '../AddStudent/addStudentData'
import { ProgramAutocomplete } from '../AddStudent/ProgramAutocomplete'
import { QrPassPreview } from '../AddStudent/QrPassPreview'
import { generatePassPdf } from './generatePassPdf'
import {
  searchStudents,
  updateStudent,
  getInitials,
  getAvatarTheme,
  STATUS_OPTIONS,
  type Student,
  type StudentStatus,
  type AvatarTheme,
} from '../StudentDirectory/studentDirectoryData'
import { fetchPassToken } from '../../data/passesData'

const REISSUE_REASONS = ['Lost', 'Stolen', 'Damaged', 'Other'] as const

// Toggle back on to restore real reissue-with-new-token behavior (rotates the pass token /
// reissueCount, deactivating the old QR code). While off, Reissue just resends the existing pass.
const ENABLE_PASS_TOKEN_REISSUE = false

interface EditForm {
  firstName: string
  lastName: string
  email: string
  faculty: string
  program: string
  level: StudentLevel
  year: string
  status: StudentStatus
}

const FIELD_LABEL_CLASSES = 'text-[13px] font-bold text-[#33415c]'
const FIELD_ERROR_CLASSES = 'text-[12.5px] font-semibold text-[#d1453d]'

const INPUT_CLASSES =
  'w-full box-border rounded-[10px] border border-[#e2e6ee] bg-[#f7f9fc] px-3.5 py-3 text-sm text-[#12284a] [transition:border-color_150ms_ease,background-color_150ms_ease,box-shadow_150ms_ease] focus:border-[#0d9488] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,148,136,0.12)] focus:outline-none'

const SECONDARY_BTN_CLASSES =
  'w-full rounded-xl border border-[#0d9488]/30 bg-white px-4 py-[11px] text-sm font-bold text-[#0d9488] cursor-pointer [transition:background-color_150ms_ease] hover:not-disabled:bg-[#e5faf7] disabled:cursor-not-allowed disabled:opacity-40'

const AVATAR_THEME_CLASSES: Record<AvatarTheme, string> = {
  blue: 'bg-[#d6e7fc] text-[#2f6fed]',
  green: 'bg-[#d3f1e2] text-[#12a35c]',
  teal: 'bg-[#ccfbf1] text-[#0d9488]',
  purple: 'bg-[#e4dbfb] text-[#8b5cf6]',
  amber: 'bg-[#fff3d6] text-[#b3790a]',
  pink: 'bg-[#fde7f1] text-[#d13d82]',
}

function toEditForm(student: Student): EditForm {
  return {
    firstName: student.firstName,
    lastName: student.lastName,
    email: student.email,
    faculty: student.faculty,
    program: student.program,
    level: student.level,
    year: student.year,
    status: student.status,
  }
}

// Only the fields that actually changed — sent as-is to updateStudent() so the UPDATE only
// touches those columns.
function diffEditForm(form: EditForm, original: Student): Partial<EditForm> {
  const changes: Partial<EditForm> = {}
  if (form.firstName !== original.firstName) changes.firstName = form.firstName
  if (form.lastName !== original.lastName) changes.lastName = form.lastName
  if (form.email !== original.email) changes.email = form.email
  if (form.faculty !== original.faculty) changes.faculty = form.faculty
  if (form.program !== original.program) changes.program = form.program
  if (form.level !== original.level) changes.level = form.level
  if (form.year !== original.year) changes.year = form.year
  if (form.status !== original.status) changes.status = form.status
  return changes
}

export function PassToolsPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Student[]>([])
  const [selected, setSelected] = useState<Student | null>(null)
  const [form, setForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [reissueOpen, setReissueOpen] = useState(false)
  const [reissueReason, setReissueReason] = useState('')

  useEffect(() => {
    let cancelled = false
    searchStudents(query).then((found) => {
      if (!cancelled) setResults(found)
    })
    return () => {
      cancelled = true
    }
  }, [query])

  function selectStudent(student: Student) {
    setSelected(student)
    setForm(toEditForm(student))
    setQuery('')
    setResults([])
    setActionMessage(null)
    setSavedFlash(false)
    setSaveError('')
  }

  function updateField<K extends keyof EditForm>(field: K, value: EditForm[K]) {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev))
    setSavedFlash(false)
    setSaveError('')
  }

  function handleFacultyChange(faculty: string) {
    setForm((prev) => (prev ? { ...prev, faculty, program: '' } : prev))
    setSavedFlash(false)
    setSaveError('')
  }

  function handleLevelChange(level: StudentLevel) {
    setForm((prev) => (prev ? { ...prev, level, program: '' } : prev))
    setSavedFlash(false)
    setSaveError('')
  }

  const dirty = Boolean(
    selected &&
      form &&
      (form.firstName !== selected.firstName ||
        form.lastName !== selected.lastName ||
        form.email !== selected.email ||
        form.faculty !== selected.faculty ||
        form.program !== selected.program ||
        form.level !== selected.level ||
        form.year !== selected.year ||
        form.status !== selected.status),
  )
  const hasRequiredFields = Boolean(form && form.firstName.trim() && form.lastName.trim())

  async function handleSave() {
    if (!selected || !form || !dirty || !hasRequiredFields) return
    setSaving(true)
    setSaveError('')

    const changes = diffEditForm(form, selected)

    try {
      // Table: public.students, matched on student_number — only the changed columns
      // (first_name/last_name/email/faculty/program/level/year/status) are sent.
      const updated = await updateStudent(selected.id, changes)
      setSelected(updated)
      setForm(toEditForm(updated))
      setSaving(false)
      setSavedFlash(true)
    } catch {
      setSaving(false)
      setSaveError('Could not save changes. Please try again.')
    }
  }

  function handleResend() {
    if (!selected) return
    setActionMessage(`Pass resent to ${selected.email}`)
  }

  async function handleDownload() {
    // No token means the pass row hasn't loaded (or is missing) — never fall back to generating
    // a code from the student ID.
    if (!selected || !passToken) return
    setDownloading(true)
    try {
      await generatePassPdf(selected, passToken)
      setActionMessage('Pass PDF downloaded')
    } finally {
      setDownloading(false)
    }
  }

  async function handleReissueConfirm() {
    if (!selected || !reissueReason) return

    if (ENABLE_PASS_TOKEN_REISSUE) {
      // Generates a new pass token and deactivates the previous QR code. Disabled for now —
      // see ENABLE_PASS_TOKEN_REISSUE — Reissue currently just resends the existing pass unchanged.
      const updated = await updateStudent(selected.id, {
        passStatus: 'Active',
        reissueCount: (selected.reissueCount ?? 0) + 1,
      })
      setSelected(updated)
    }

    setReissueOpen(false)
    setReissueReason('')
    setActionMessage(
      ENABLE_PASS_TOKEN_REISSUE
        ? 'Pass reissued — previous QR code is now deactivated'
        : `Pass resent to ${selected.email} — QR code unchanged`,
    )
  }

  // The selected student's real pass token, loaded from the passes table. The QR/PDF are built
  // from this, never from the student number.
  const [passToken, setPassToken] = useState<string | null>(null)

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    fetchPassToken(selected.uuid).then((token) => {
      if (cancelled) return
      setPassToken(token)
    })
    return () => {
      cancelled = true
    }
  }, [selected])

  const [programSuggestions, setProgramSuggestions] = useState<string[]>([])

  useEffect(() => {
    if (!form) return
    let cancelled = false
    getLiveProgramSuggestions(form.faculty, form.level).then((suggestions) => {
      if (cancelled) return
      setProgramSuggestions(suggestions)
    })
    return () => {
      cancelled = true
    }
    // Deliberately narrower than `form` — refetch only when faculty/level actually change, not on
    // every keystroke elsewhere in the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.faculty, form?.level])

  const passRevoked = selected?.passStatus === 'Revoked'

  return (
    <div className="box-border flex min-h-screen justify-center bg-[linear-gradient(180deg,#f4fdfc_0%,#f7f9fc_100%)] px-6 pt-14 pb-20 max-[641px]:px-4 max-[641px]:pt-9 max-[641px]:pb-15">
      <div className="flex w-full max-w-[1100px] flex-col gap-6">
        <Link
          to="/students"
          className="inline-flex w-fit items-center gap-1 text-[13.5px] font-semibold text-[#7c8aa0] no-underline [transition:color_150ms_ease] hover:text-[#2f6fed]"
        >
          <ChevronLeftIcon size={16} />
          Back to Students
        </Link>

        <div className="w-full rounded-[18px] bg-white px-6 py-5 shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
          <span className="text-[11px] font-bold tracking-[0.6px] text-[#9aa6ba] uppercase">Find a student</span>
          <div className="mt-2 flex items-center gap-2 rounded-[10px] border border-[#e2e6ee] bg-white px-3 py-[10px] text-[#7c8aa0] [transition:border-color_150ms_ease] focus-within:border-[#0d9488]">
            <SearchIcon size={16} />
            <input
              type="text"
              aria-label="Find a student by name, student ID, or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, student ID, or email..."
              className="flex-1 border-none text-sm text-[#12284a] outline-none"
            />
          </div>

          {query.trim() &&
            (results.length > 0 ? (
              <ul className="mt-3 flex flex-col border-t border-[#f0f2f7]">
                {results.map((student) => (
                  <li key={student.id} className="border-b border-[#f0f2f7]">
                    <button
                      type="button"
                      onClick={() => selectStudent(student)}
                      className="flex w-full items-center gap-3 px-2 py-3 text-left cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f7f9fc]"
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${AVATAR_THEME_CLASSES[getAvatarTheme(student.id)]}`}
                      >
                        {getInitials(student.fullName)}
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <span className="text-sm font-bold text-[#12284a]">{student.fullName}</span>
                        <span className="truncate text-xs text-[#9aa6ba]">
                          {student.id} &middot; {student.email}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[#9aa6ba]">No students match &ldquo;{query}&rdquo;.</p>
            ))}
        </div>

        {selected && form && (
          <div className="grid w-full grid-cols-[2fr_1fr] gap-6 max-[901px]:grid-cols-1">
            <div className="flex flex-col gap-5 rounded-2xl border border-[#eef1f6] bg-white px-7 py-6 shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[641px]:px-5 max-[641px]:py-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="m-0 text-lg font-extrabold text-[#12284a]">Edit Student Details</h2>
                {savedFlash && <span className="text-xs font-bold text-[#0d9488]">{'Saved ✓'}</span>}
              </div>

              <div className="grid grid-cols-2 gap-4 max-[641px]:grid-cols-1">
                <div className="flex flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLASSES}>First Name</label>
                  <input
                    type="text"
                    required
                    value={form.firstName}
                    onChange={(e) => updateField('firstName', e.target.value)}
                    className={INPUT_CLASSES}
                  />
                  {!form.firstName.trim() && <span className={FIELD_ERROR_CLASSES}>First name is required</span>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLASSES}>Last Name</label>
                  <input
                    type="text"
                    required
                    value={form.lastName}
                    onChange={(e) => updateField('lastName', e.target.value)}
                    className={INPUT_CLASSES}
                  />
                  {!form.lastName.trim() && <span className={FIELD_ERROR_CLASSES}>Last name is required</span>}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={FIELD_LABEL_CLASSES}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className={INPUT_CLASSES}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 max-[641px]:grid-cols-1">
                <div className="flex flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLASSES}>Faculty</label>
                  <select
                    value={form.faculty}
                    onChange={(e) => handleFacultyChange(e.target.value)}
                    className={`${INPUT_CLASSES} cursor-pointer`}
                  >
                    {FACULTIES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLASSES}>Program Level</label>
                  <select
                    value={form.level}
                    onChange={(e) => handleLevelChange(e.target.value as StudentLevel)}
                    className={`${INPUT_CLASSES} cursor-pointer`}
                  >
                    {LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={FIELD_LABEL_CLASSES}>Course / Academic Program</label>
                <ProgramAutocomplete
                  id="pass-tools-program"
                  value={form.program}
                  onChange={(value) => updateField('program', value)}
                  suggestions={programSuggestions}
                  disabled={false}
                  hasError={false}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 max-[641px]:grid-cols-1">
                <div className="flex flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLASSES}>Current Year</label>
                  <select
                    value={form.year}
                    onChange={(e) => updateField('year', e.target.value)}
                    className={`${INPUT_CLASSES} cursor-pointer`}
                  >
                    {YEARS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={FIELD_LABEL_CLASSES}>Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => updateField('status', e.target.value as StudentStatus)}
                    className={`${INPUT_CLASSES} cursor-pointer`}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {saveError && (
                <div className="rounded-[10px] border border-[#f8c9c9] bg-[#fde8e8] px-3.5 py-3 text-[13px] font-semibold text-[#d1453d]">
                  {saveError}
                </div>
              )}

              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || !hasRequiredFields || saving}
                className="w-full rounded-xl border-none bg-[#0d9488] px-5 py-3 text-sm font-bold text-white cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] hover:not-disabled:bg-[#0b7d73] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>

            <div className="flex flex-col gap-5 rounded-2xl border border-[#ccfbf1] bg-[#f0fdfa] px-6 py-6 max-[641px]:px-5 max-[641px]:py-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="m-0 text-base font-extrabold text-[#0d9488]">Fusion Pass</h3>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    passRevoked ? 'bg-[#fde8e8] text-[#d1453d]' : 'bg-[#e1f8ec] text-[#159a56]'
                  }`}
                >
                  {selected.passStatus}
                </span>
              </div>

              <QrPassPreview
                passToken={passToken}
                name={selected.fullName}
                faculty={selected.faculty}
                levelLabel={`${selected.level} · ${selected.year}`}
                status={selected.passStatus}
              />

              <div className="flex flex-col gap-2.5">
                <button type="button" onClick={handleResend} disabled={passRevoked} className={SECONDARY_BTN_CLASSES}>
                  Resend
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={passRevoked || downloading || !passToken}
                  className={SECONDARY_BTN_CLASSES}
                >
                  {downloading ? 'Generating PDF…' : 'Download'}
                </button>
                <button
                  type="button"
                  onClick={() => setReissueOpen(true)}
                  className="w-full rounded-xl border-none bg-[#b3790a] px-4 py-[11px] text-sm font-bold text-white cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#96650a]"
                >
                  Reissue
                </button>
              </div>

              {actionMessage && <p className="m-0 text-xs font-semibold text-[#0d9488]">{actionMessage}</p>}
            </div>
          </div>
        )}
      </div>

      <Modal
        open={reissueOpen}
        onClose={() => {
          setReissueOpen(false)
          setReissueReason('')
        }}
      >
        {selected && (
          <div className="flex flex-col gap-4">
            <h2 className="m-0 text-lg font-extrabold text-[#12284a]">Reissue this pass?</h2>
            <p className="m-0 text-sm text-[#56617a]">
              {ENABLE_PASS_TOKEN_REISSUE
                ? `This deactivates ${selected.fullName}'s current QR code and generates a new one. They'll need the new pass to check in going forward.`
                : `This resends ${selected.fullName}'s existing pass. Their QR code stays the same — no new pass is generated.`}
            </p>

            <div className="flex flex-col gap-1.5">
              <label className={FIELD_LABEL_CLASSES}>Reason</label>
              <select
                value={reissueReason}
                onChange={(e) => setReissueReason(e.target.value)}
                className={`${INPUT_CLASSES} cursor-pointer`}
              >
                <option value="">Select a reason</option>
                {REISSUE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setReissueOpen(false)
                  setReissueReason('')
                }}
                className="rounded-[10px] border-none bg-transparent px-[18px] py-2.5 text-[13.5px] font-bold text-[#7c8aa0] cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] hover:bg-[#f2f5fa] hover:text-[#56617a]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReissueConfirm}
                disabled={!reissueReason}
                className="rounded-[10px] border-none bg-[#b3790a] px-5 py-2.5 text-[13.5px] font-bold text-white cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] hover:not-disabled:bg-[#96650a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reissue pass
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
