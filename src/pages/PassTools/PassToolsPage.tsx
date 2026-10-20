import { useEffect, useState, type ReactNode } from 'react'
import { SearchIcon, RefreshIcon, ChevronLeftIcon, ChevronRightIcon } from '../../components/icons/NavIcons'
import { rowActivationProps } from '../../lib/rowActivation'
import { FACULTIES, LEVELS, YEARS, getLiveProgramSuggestions, type StudentLevel } from '../AddStudent/addStudentData'
import { ProgramAutocomplete } from '../AddStudent/ProgramAutocomplete'
import { QrPassPreview } from '../AddStudent/QrPassPreview'
import { generatePassPdf } from './generatePassPdf'
import {
  fetchStudents,
  updateStudent,
  getInitials,
  getAvatarTheme,
  STATUS_OPTIONS,
  STATUS_COLORS,
  type Student,
  type StudentStatus,
  type AvatarTheme,
} from '../StudentDirectory/studentDirectoryData'
import { fetchPassToken, issuePass } from '../../data/passesData'
import { fetchFusionId } from '../../data/fusionIds'

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

const BROWSE_PAGE_SIZE = 8

const FILTER_SELECT_CLASSES =
  'w-full rounded-[10px] border border-[#e2e6ee] bg-white px-3 py-[10px] text-[13.5px] font-semibold text-[#12284a] cursor-pointer [transition:border-color_150ms_ease] hover:border-[#c7d0e0] focus:border-[#0d9488] focus:outline-none'

const RESET_BTN_CLASSES =
  'inline-flex items-center gap-[7px] self-end rounded-[10px] border border-[#ccfbf1] bg-[#e5faf7] px-4 py-[10px] text-[13.5px] font-bold text-[#0d9488] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#ccfbf1] h-[41px]'

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-[150px] flex-col gap-[7px] max-[701px]:min-w-full max-[901px]:min-w-[47%] max-[901px]:flex-1">
      <span className="text-[11px] font-bold tracking-[0.6px] text-[#9aa6ba] uppercase">{label}</span>
      {children}
    </div>
  )
}

type PageItem = number | 'ellipsis-start' | 'ellipsis-end'

// Same "1 ... 4 5 6 ... 12" windowing as the Student Directory's own pagination — duplicated
// rather than imported from that page, since a page file importing UI helpers from another page
// file would be an odd cross-page coupling for what's really just a small, self-contained bit of
// math the two pages happen to both need.
function getPageItems(current: number, total: number): PageItem[] {
  const siblingCount = 1
  const windowSize = siblingCount * 2 + 5

  if (total <= windowSize) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const leftSibling = Math.max(current - siblingCount, 1)
  const rightSibling = Math.min(current + siblingCount, total)
  const showLeftEllipsis = leftSibling > 2
  const showRightEllipsis = rightSibling < total - 1

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftRange = Array.from({ length: 3 + siblingCount * 2 }, (_, i) => i + 1)
    return [...leftRange, 'ellipsis-end', total]
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    const rightCount = 3 + siblingCount * 2
    const rightRange = Array.from({ length: rightCount }, (_, i) => total - rightCount + i + 1)
    return [1, 'ellipsis-start', ...rightRange]
  }

  const middleRange = Array.from({ length: rightSibling - leftSibling + 1 }, (_, i) => leftSibling + i)
  return [1, 'ellipsis-start', ...middleRange, 'ellipsis-end', total]
}

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
  const [selected, setSelected] = useState<Student | null>(null)
  const [form, setForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  // The browsable table shown while no student is picked yet — same filter/pagination pattern as
  // the Student Directory, so staff can either search directly or just scan/filter the list to
  // spot who needs pass help (e.g. filtering to Status: Revoked).
  const [nameQuery, setNameQuery] = useState('')
  const [studentIdQuery, setStudentIdQuery] = useState('')
  const [faculty, setFaculty] = useState('All')
  const [level, setLevel] = useState<StudentLevel | 'All'>('All')
  const [year, setYear] = useState('All')
  const [status, setStatus] = useState<StudentStatus | 'All'>('All')
  const [browsePage, setBrowsePage] = useState(1)

  const [browseStudents, setBrowseStudents] = useState<Student[]>([])
  const [browseTotalCount, setBrowseTotalCount] = useState(0)
  const [browseResultKey, setBrowseResultKey] = useState('')

  const browseFilterKey = JSON.stringify({ nameQuery, studentIdQuery, faculty, level, year, status })
  const [lastBrowseFilterKey, setLastBrowseFilterKey] = useState(browseFilterKey)
  if (browseFilterKey !== lastBrowseFilterKey) {
    setLastBrowseFilterKey(browseFilterKey)
    setBrowsePage(1)
  }

  const browseRequestKey = JSON.stringify({ browsePage, nameQuery, studentIdQuery, faculty, level, year, status })
  const browseLoading = !selected && browseRequestKey !== browseResultKey

  useEffect(() => {
    if (selected) return
    let cancelled = false
    fetchStudents({ page: browsePage, pageSize: BROWSE_PAGE_SIZE, studentIdQuery, nameQuery, faculty, level, year, status }).then(
      (result) => {
        if (cancelled) return
        setBrowseStudents(result.students)
        setBrowseTotalCount(result.totalCount)
        setBrowseResultKey(browseRequestKey)
      },
    )
    return () => {
      cancelled = true
    }
  }, [selected, browseRequestKey, browsePage, studentIdQuery, nameQuery, faculty, level, year, status])

  const browseTotalPages = Math.max(1, Math.ceil(browseTotalCount / BROWSE_PAGE_SIZE))
  const browseCurrentPage = Math.min(browsePage, browseTotalPages)
  const browseRangeStart = browseTotalCount === 0 ? 0 : (browseCurrentPage - 1) * BROWSE_PAGE_SIZE + 1
  const browseRangeEnd = (browseCurrentPage - 1) * BROWSE_PAGE_SIZE + browseStudents.length

  function handleResetFilters() {
    setNameQuery('')
    setStudentIdQuery('')
    setFaculty('All')
    setLevel('All')
    setYear('All')
    setStatus('All')
  }

  function selectStudent(student: Student) {
    setSelected(student)
    setForm(toEditForm(student))
    setActionMessage(null)
    setSavedFlash(false)
    setSaveError('')
  }

  function backToList() {
    setSelected(null)
    setForm(null)
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
      // Table: public.students, matched on their real uuid — only the changed columns
      // (first_name/last_name/email/faculty/program/level/year/status) are sent.
      const updated = await updateStudent(selected.uuid, changes)
      setSelected(updated)
      setForm(toEditForm(updated))
      setSaving(false)
      setSavedFlash(true)
    } catch {
      setSaving(false)
      setSaveError('Could not save changes. Please try again.')
    }
  }

  async function handleDownload() {
    // No token means the pass row hasn't loaded (or is missing) — never fall back to generating
    // a code from the student ID.
    if (!selected || !passToken) return
    setDownloading(true)
    try {
      const fusionId = await fetchFusionId(selected.uuid).catch(() => null)
      await generatePassPdf(selected, passToken, fusionId)
      setActionMessage('Pass PDF downloaded')
    } finally {
      setDownloading(false)
    }
  }

  // The selected student's real pass token, loaded from the passes table. The QR/PDF are built
  // from this, never from the student number. Tagged with the uuid it was fetched for — same
  // pattern as the Analysis page's attendeesData — so "still loading" and "loaded, no pass exists"
  // are both derived from whether this matches the current selection, rather than a separate flag
  // that could drift out of sync. A handful of students genuinely have no passes row at all (see
  // issuePass below); without this, QrPassPreview couldn't tell that apart from a slow request and
  // showed "Loading pass…" forever.
  const [passTokenData, setPassTokenData] = useState<{ uuid: string; token: string | null } | null>(null)
  const passToken = passTokenData && passTokenData.uuid === selected?.uuid ? passTokenData.token : null
  const passTokenLoading = Boolean(selected) && passTokenData?.uuid !== selected?.uuid

  const selectedUuid = selected?.uuid ?? null

  useEffect(() => {
    if (!selectedUuid) return
    let cancelled = false
    fetchPassToken(selectedUuid).then((token) => {
      if (!cancelled) setPassTokenData({ uuid: selectedUuid, token })
    })
    return () => {
      cancelled = true
    }
  }, [selectedUuid])

  const [issuingPass, setIssuingPass] = useState(false)

  async function handleIssuePass() {
    if (!selectedUuid || selected?.id === null) return
    setIssuingPass(true)
    try {
      await issuePass(selectedUuid)
      // A freshly issued pass defaults to Active in the database — reflect that immediately
      // rather than waiting for a reload to pick it up.
      setSelected((prev) => (prev ? { ...prev, passStatus: 'Active' } : prev))
      const token = await fetchPassToken(selectedUuid)
      setPassTokenData({ uuid: selectedUuid, token })
    } catch {
      setActionMessage("Couldn't issue a pass. Please try again.")
    } finally {
      setIssuingPass(false)
    }
  }

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
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6">
      {!selected && (
        <>
          <div className="flex flex-wrap items-end gap-3.5 rounded-[18px] bg-white px-[22px] py-5 shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[901px]:gap-3">
            <FilterField label="Student Name">
              <div className="flex min-w-[200px] items-center gap-2 rounded-[10px] border border-[#e2e6ee] bg-white px-3 py-[10px] text-[#7c8aa0] [transition:border-color_150ms_ease] focus-within:border-[#0d9488]">
                <SearchIcon size={16} />
                <input
                  type="text"
                  aria-label="Search by student name"
                  placeholder="Search by student name..."
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                  className="flex-1 border-none text-[13.5px] text-[#12284a] outline-none"
                />
              </div>
            </FilterField>

            <FilterField label="Student ID">
              <div className="flex min-w-[200px] items-center gap-2 rounded-[10px] border border-[#e2e6ee] bg-white px-3 py-[10px] text-[#7c8aa0] [transition:border-color_150ms_ease] focus-within:border-[#0d9488]">
                <SearchIcon size={16} />
                <input
                  type="text"
                  aria-label="Search by student ID"
                  placeholder="Search by student ID..."
                  value={studentIdQuery}
                  onChange={(e) => setStudentIdQuery(e.target.value)}
                  className="flex-1 border-none text-[13.5px] text-[#12284a] outline-none"
                />
              </div>
            </FilterField>

            <FilterField label="Faculty">
              <select className={FILTER_SELECT_CLASSES} value={faculty} onChange={(e) => setFaculty(e.target.value)}>
                <option value="All">All</option>
                {FACULTIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Program Level">
              <select className={FILTER_SELECT_CLASSES} value={level} onChange={(e) => setLevel(e.target.value as StudentLevel | 'All')}>
                <option value="All">All</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Year">
              <select className={FILTER_SELECT_CLASSES} value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="All">All</option>
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Status">
              <select className={FILTER_SELECT_CLASSES} value={status} onChange={(e) => setStatus(e.target.value as StudentStatus | 'All')}>
                <option value="All">All</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </FilterField>

            <button
              type="button"
              className={`${RESET_BTN_CLASSES} max-[701px]:ml-0 max-[701px]:w-full max-[701px]:justify-center max-[901px]:ml-auto`}
              onClick={handleResetFilters}
            >
              <RefreshIcon size={15} />
              Reset
            </button>
          </div>

          {browseLoading ? (
            <div className="flex flex-col items-center gap-4 rounded-[18px] bg-white px-5 py-[60px] text-center text-sm text-[#7c8aa0] shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
              Loading students&hellip;
            </div>
          ) : browseStudents.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-[18px] bg-white px-5 py-[60px] text-center text-sm text-[#7c8aa0] shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
              <p className="m-0">No students match your filters.</p>
              <button
                type="button"
                className="inline-flex items-center gap-[7px] rounded-[10px] border border-[#ccfbf1] bg-[#e5faf7] px-[18px] py-[10px] text-[13.5px] font-bold text-[#0d9488] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#ccfbf1]"
                onClick={handleResetFilters}
              >
                <RefreshIcon size={15} />
                Reset filters
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-[18px] bg-white shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[701px]:hidden">
                <table className="w-full min-w-[820px] border-collapse">
                  <thead>
                    <tr>
                      <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                        Student
                      </th>
                      <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                        Faculty
                      </th>
                      <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                        Program
                      </th>
                      <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                        Level &amp; Year
                      </th>
                      <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                        Status
                      </th>
                      <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                        Pass
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {browseStudents.map((student, index) => {
                      const cellBorder = index === browseStudents.length - 1 ? '' : 'border-b border-[#f2f4f8]'
                      const passRevokedRow = student.passStatus === 'Revoked'
                      return (
                        <tr
                          key={student.uuid}
                          {...rowActivationProps(() => selectStudent(student))}
                          className="cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f7f9fc] focus-visible:bg-[#f7f9fc] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0d9488]"
                        >
                          <td className={`px-[22px] py-4 align-middle ${cellBorder}`}>
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${AVATAR_THEME_CLASSES[getAvatarTheme(student.id ?? student.uuid)]}`}
                              >
                                {getInitials(student.fullName)}
                              </div>
                              <div className="flex min-w-0 flex-col">
                                <span className="truncate text-[13.5px] font-bold whitespace-nowrap text-[#12284a]">{student.fullName}</span>
                                <span className="text-[12px] font-semibold whitespace-nowrap text-[#9aa6ba]">{student.id ?? 'ID pending'}</span>
                              </div>
                            </div>
                          </td>
                          <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>{student.faculty}</td>
                          <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>{student.program}</td>
                          <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>
                            <div className="font-semibold text-[#12284a]">{student.level}</div>
                            <div className="mt-0.5 text-[12.5px] text-[#9aa6ba]">{student.year}</div>
                          </td>
                          <td className={`px-[22px] py-4 align-middle ${cellBorder}`}>
                            <span
                              className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-bold"
                              style={{ background: STATUS_COLORS[student.status].bg, color: STATUS_COLORS[student.status].text }}
                            >
                              {student.status}
                            </span>
                          </td>
                          <td className={`px-[22px] py-4 align-middle ${cellBorder}`}>
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-bold ${
                                passRevokedRow ? 'bg-[#fde8e8] text-[#d1453d]' : 'bg-[#e1f8ec] text-[#159a56]'
                              }`}
                            >
                              {student.passStatus}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="hidden flex-col gap-3 max-[701px]:flex">
                {browseStudents.map((student) => (
                  <button
                    key={student.uuid}
                    type="button"
                    onClick={() => selectStudent(student)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-[#eef1f6] bg-white px-4 py-3.5 text-left shadow-[0_2px_10px_rgba(15,40,74,0.05)]"
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${AVATAR_THEME_CLASSES[getAvatarTheme(student.id ?? student.uuid)]}`}
                    >
                      {getInitials(student.fullName)}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[14px] font-bold text-[#12284a]">{student.fullName}</span>
                      <span className="truncate text-[12.5px] text-[#9aa6ba]">
                        {[student.id ?? 'ID pending', student.faculty].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-bold ${
                        student.passStatus === 'Revoked' ? 'bg-[#fde8e8] text-[#d1453d]' : 'bg-[#e1f8ec] text-[#159a56]'
                      }`}
                    >
                      {student.passStatus}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#7c8aa0] max-[701px]:justify-center max-[701px]:text-center">
                <span>
                  Showing {browseRangeStart}&ndash;{browseRangeEnd} of {browseTotalCount}
                </span>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <button
                    type="button"
                    disabled={browseCurrentPage <= 1}
                    onClick={() => setBrowsePage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                    className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-[#e2e6ee] bg-white text-[#12284a] cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] hover:not-disabled:bg-[#f2f5fa] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeftIcon size={16} />
                  </button>

                  {getPageItems(browseCurrentPage, browseTotalPages).map((item, index) =>
                    typeof item === 'number' ? (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setBrowsePage(item)}
                        aria-current={item === browseCurrentPage ? 'page' : undefined}
                        aria-label={`Page ${item}`}
                        className={`inline-flex h-[34px] min-w-[34px] items-center justify-center rounded-[9px] border px-1.5 text-[13px] font-semibold cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] ${
                          item === browseCurrentPage
                            ? 'border-[#0d9488] bg-[#0d9488] font-bold text-white hover:bg-[#0d9488]'
                            : 'border-[#e2e6ee] bg-white text-[#12284a] hover:bg-[#f2f5fa]'
                        }`}
                      >
                        {item}
                      </button>
                    ) : (
                      <span
                        key={`${item}-${index}`}
                        className="inline-flex h-[34px] w-5 items-center justify-center tracking-[1px] font-bold text-[#9aa6ba]"
                      >
                        &hellip;
                      </span>
                    ),
                  )}

                  <button
                    type="button"
                    disabled={browseCurrentPage >= browseTotalPages}
                    onClick={() => setBrowsePage((p) => Math.min(browseTotalPages, p + 1))}
                    aria-label="Next page"
                    className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-[#e2e6ee] bg-white text-[#12284a] cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] hover:not-disabled:bg-[#f2f5fa] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRightIcon size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

        {selected && form && (
          <>
            <button
              type="button"
              onClick={backToList}
              className="inline-flex w-fit items-center gap-1 text-[13.5px] font-semibold text-[#7c8aa0] cursor-pointer border-none bg-transparent p-0 [transition:color_150ms_ease] hover:text-[#0d9488]"
            >
              <ChevronLeftIcon size={16} />
              Back to student list
            </button>

            <div className="grid w-full grid-cols-[2fr_1fr] gap-6 max-[901px]:grid-cols-1">
            <div className="flex flex-col gap-5 rounded-2xl border border-[#eef1f6] bg-white px-7 py-6 shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[641px]:px-5 max-[641px]:py-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="m-0 text-lg font-extrabold text-[#1d1d1f]">Edit Student Details</h2>
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
                loading={passTokenLoading}
                onIssuePass={handleIssuePass}
                issuingPass={issuingPass}
                studentIdPending={selected.id === null}
                name={selected.fullName}
                faculty={selected.faculty}
                level={selected.level}
                year={selected.year}
                status={selected.passStatus}
              />

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={passRevoked || downloading || !passToken}
                  className={SECONDARY_BTN_CLASSES}
                >
                  {downloading ? 'Generating PDF…' : 'Download'}
                </button>
              </div>

              {actionMessage && <p className="m-0 text-xs font-semibold text-[#0d9488]">{actionMessage}</p>}
            </div>
            </div>
          </>
        )}
    </div>
  )
}
