import { useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import { SearchIcon, FileUploadIcon, XIcon } from '../../components/icons/NavIcons'
import { Pill } from '../../components/Pill/Pill'
import { FACULTIES, YEARS } from '../AddStudent/addStudentData'
import { STATUS_COLORS, type Student } from '../StudentDirectory/studentDirectoryData'

interface InviteeSelectorProps {
  students: Student[]
  loading: boolean
  selected: Set<string> // student uuids
  onChange: (next: Set<string>) => void
  // Completed events keep their invite list as a historical record — the list still renders (so
  // staff can see who was invited) but nothing here can change it.
  readOnly?: boolean
}

const FILTER_SELECT_CLASSES =
  'w-full rounded-[10px] border border-[#e2e6ee] bg-white px-3 py-[9px] text-[13px] font-semibold text-[#12284a] cursor-pointer [transition:border-color_150ms_ease] hover:border-[#c7d0e0] focus:border-[#0d9488] focus:outline-none'
const SMALL_BTN_CLASSES =
  'inline-flex items-center gap-1.5 rounded-[10px] border border-[#dbf3ef] bg-[#f0fdfa] px-3.5 py-2 text-[12.5px] font-bold text-[#0d9488] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#dbf3ef] disabled:cursor-not-allowed disabled:opacity-50'
const TH_CLASSES =
  'border-b border-[#eef1f6] px-3.5 py-3 text-left text-[11px] font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase'

// Matches the CSV header normalising in csvImportData.ts — one column is enough here.
function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

const STUDENT_NUMBER_ALIASES = ['student_number', 'student_id', 'studentid', 'id_number', 'id']
const EMAIL_ALIASES = ['email', 'email_address', 'university_email']

interface CsvPreview {
  matched: { value: string; student: Student }[]
  unmatched: string[]
  columnUsed: 'student_number' | 'email'
}

export function InviteeSelector({ students, loading, selected, onChange, readOnly = false }: InviteeSelectorProps) {
  const [search, setSearch] = useState('')
  const [faculty, setFaculty] = useState('All')
  const [program, setProgram] = useState('All')
  const [year, setYear] = useState('All')
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvError, setCsvError] = useState('')
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const programs = useMemo(() => Array.from(new Set(students.map((s) => s.program).filter(Boolean))).sort(), [students])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return students.filter((s) => {
      if (faculty !== 'All' && s.faculty !== faculty) return false
      if (program !== 'All' && s.program !== program) return false
      if (year !== 'All' && s.year !== year) return false
      if (query) {
        const haystack = `${s.fullName} ${s.email} ${s.id}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [students, search, faculty, program, year])

  const filteredAllSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.uuid))

  function toggle(uuid: string) {
    if (readOnly) return
    const next = new Set(selected)
    if (next.has(uuid)) next.delete(uuid)
    else next.add(uuid)
    onChange(next)
  }

  function selectAllFiltered() {
    const next = new Set(selected)
    for (const s of filtered) next.add(s.uuid)
    onChange(next)
  }

  function clearFiltered() {
    const next = new Set(selected)
    for (const s of filtered) next.delete(s.uuid)
    onChange(next)
  }

  function handleReset() {
    setSearch('')
    setFaculty('All')
    setProgram('All')
    setYear('All')
  }

  function handleCsvFile(file: File) {
    setCsvError('')
    setCsvPreview(null)
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvError('Please upload a .csv file.')
      return
    }

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        const headers = results.meta.fields ?? []
        const byNormalized = new Map<string, string>()
        for (const h of headers) {
          const norm = normalizeHeader(h)
          if (!byNormalized.has(norm)) byNormalized.set(norm, h)
        }

        const numberHeader = STUDENT_NUMBER_ALIASES.map((a) => byNormalized.get(a)).find(Boolean)
        const emailHeader = EMAIL_ALIASES.map((a) => byNormalized.get(a)).find(Boolean)
        const header = numberHeader ?? emailHeader
        if (!header) {
          setCsvError('This CSV needs a student_number column (or an email column as a fallback).')
          return
        }
        const columnUsed: CsvPreview['columnUsed'] = numberHeader ? 'student_number' : 'email'

        const byNumber = new Map(students.map((s) => [s.id.trim().toLowerCase(), s]))
        const byEmail = new Map(students.map((s) => [s.email.trim().toLowerCase(), s]))

        const matched: CsvPreview['matched'] = []
        const unmatched: string[] = []
        const seen = new Set<string>()

        for (const row of results.data) {
          const value = (row[header] ?? '').trim()
          if (!value) continue
          const key = value.toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)

          const student = columnUsed === 'student_number' ? byNumber.get(key) : byEmail.get(key)
          if (student) matched.push({ value, student })
          else unmatched.push(value)
        }

        if (matched.length === 0 && unmatched.length === 0) {
          setCsvError('This CSV has no rows to read.')
          return
        }
        setCsvPreview({ matched, unmatched, columnUsed })
      },
      error: () => setCsvError('Could not read this file. Please check it is a valid CSV and try again.'),
    })
  }

  function confirmCsv() {
    if (!csvPreview) return
    const next = new Set(selected)
    for (const m of csvPreview.matched) next.add(m.student.uuid)
    onChange(next)
    setCsvPreview(null)
    setCsvOpen(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="text-[13.5px] font-bold text-[#12284a]">
          {selected.size} student{selected.size === 1 ? '' : 's'} invited
        </span>
        {!readOnly && (
          <button type="button" onClick={() => setCsvOpen((open) => !open)} className={SMALL_BTN_CLASSES}>
            <FileUploadIcon size={14} />
            {csvOpen ? 'Hide CSV upload' : 'Upload CSV'}
          </button>
        )}
      </div>

      {readOnly && (
        <p className="m-0 rounded-[10px] border border-[#eef1f6] bg-[#fbfcfe] px-3.5 py-2.5 text-[12.5px] text-[#7c8aa0]">
          Invited students can&rsquo;t be changed after this event has ended.
        </p>
      )}

      {!readOnly && csvOpen && (
        <div className="flex flex-col gap-3 rounded-[14px] border border-[#eef1f6] bg-[#fbfcfe] p-4">
          <p className="m-0 text-[12.5px] text-[#7c8aa0]">
            Upload a CSV with a single <span className="font-semibold text-[#12284a]">student_number</span> column (or{' '}
            <span className="font-semibold text-[#12284a]">email</span> as a fallback). Rows are matched against existing
            students — nothing is added until you confirm.
          </p>

          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={() => csvInputRef.current?.click()} className={SMALL_BTN_CLASSES}>
              Choose file
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleCsvFile(file)
                e.target.value = ''
              }}
            />
          </div>

          {csvError && (
            <div className="rounded-[10px] border border-[#f8c9c9] bg-[#fde8e8] px-3.5 py-2.5 text-[12.5px] font-semibold text-[#d1453d]">
              {csvError}
            </div>
          )}

          {csvPreview && (
            <div className="flex flex-col gap-2.5">
              <p className="m-0 text-[12.5px] font-bold text-[#12284a]">
                Matched by {csvPreview.columnUsed === 'student_number' ? 'student number' : 'email'}:{' '}
                {csvPreview.matched.length} matched, {csvPreview.unmatched.length} not found
              </p>

              {csvPreview.matched.length > 0 && (
                <div className="max-h-[150px] overflow-y-auto rounded-[10px] border border-[#d3f1e2] bg-[#f3fbf7] px-3 py-2.5 text-[12.5px] text-[#12284a]">
                  {csvPreview.matched.map((m) => (
                    <div key={m.student.uuid}>
                      <span className="font-semibold">{m.value}</span> &rarr; {m.student.fullName} ({m.student.email})
                    </div>
                  ))}
                </div>
              )}

              {csvPreview.unmatched.length > 0 && (
                <div className="max-h-[150px] overflow-y-auto rounded-[10px] border border-[#f8c9c9] bg-[#fdf3f3] px-3 py-2.5 text-[12.5px] text-[#d1453d]">
                  <p className="m-0 mb-1 font-bold">No student found for:</p>
                  {csvPreview.unmatched.map((value) => (
                    <div key={value}>{value}</div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={confirmCsv}
                  disabled={csvPreview.matched.length === 0}
                  className="rounded-[10px] border-none bg-[#0d9488] px-4 py-2 text-[12.5px] font-bold text-white cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#0b7d73] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add {csvPreview.matched.length} matched
                </button>
                <button
                  type="button"
                  onClick={() => setCsvPreview(null)}
                  className="rounded-[10px] border border-[#e2e6ee] bg-white px-4 py-2 text-[12.5px] font-bold text-[#56617a] cursor-pointer hover:bg-[#f2f5fa]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
        <div className="flex items-center gap-2 rounded-[10px] border border-[#e2e6ee] bg-white px-3 py-[9px] text-[#7c8aa0] [transition:border-color_150ms_ease] focus-within:border-[#0d9488]">
          <SearchIcon size={15} />
          <input
            type="text"
            aria-label="Search invitees by name, email, or student ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, ID..."
            className="w-full min-w-0 border-none text-[13px] text-[#12284a] outline-none"
          />
        </div>

        <select className={FILTER_SELECT_CLASSES} value={faculty} onChange={(e) => setFaculty(e.target.value)}>
          <option value="All">All faculties</option>
          {FACULTIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <select className={FILTER_SELECT_CLASSES} value={program} onChange={(e) => setProgram(e.target.value)}>
          <option value="All">All programs</option>
          {programs.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select className={FILTER_SELECT_CLASSES} value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="All">All years</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {!readOnly && (
          <>
            <button type="button" onClick={selectAllFiltered} disabled={filtered.length === 0 || filteredAllSelected} className={SMALL_BTN_CLASSES}>
              Select all {filtered.length} filtered
            </button>
            <button
              type="button"
              onClick={clearFiltered}
              disabled={filtered.length === 0 || !filtered.some((s) => selected.has(s.uuid))}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e2e6ee] bg-white px-3.5 py-2 text-[12.5px] font-bold text-[#56617a] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f2f5fa] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear filtered
            </button>
          </>
        )}
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 rounded-[10px] border-none bg-transparent px-2 py-2 text-[12.5px] font-bold text-[#9aa6ba] cursor-pointer hover:text-[#56617a]"
        >
          <XIcon size={12} />
          Reset filters
        </button>
      </div>

      {loading ? (
        <p className="m-0 py-6 text-center text-[13px] text-[#7c8aa0]">Loading students&hellip;</p>
      ) : filtered.length === 0 ? (
        <p className="m-0 py-6 text-center text-[13px] text-[#7c8aa0]">No students match these filters.</p>
      ) : (
        <>
          <div className="max-h-[380px] overflow-auto rounded-[14px] border border-[#eef1f6] max-[701px]:hidden">
            <table className="w-full min-w-[820px] border-collapse">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className={`${TH_CLASSES} w-10`} />
                  <th className={TH_CLASSES}>Student</th>
                  <th className={TH_CLASSES}>Email</th>
                  <th className={TH_CLASSES}>Faculty</th>
                  <th className={TH_CLASSES}>Program</th>
                  <th className={TH_CLASSES}>Level &amp; Year</th>
                  <th className={TH_CLASSES}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((student) => {
                  const isSelected = selected.has(student.uuid)
                  const statusColor = STATUS_COLORS[student.status]
                  return (
                    <tr
                      key={student.uuid}
                      onClick={readOnly ? undefined : () => toggle(student.uuid)}
                      className={`[transition:background-color_150ms_ease] ${readOnly ? '' : 'cursor-pointer'} ${isSelected ? 'bg-[#f0fdfa]' : readOnly ? '' : 'hover:bg-[#f7f9fc]'}`}
                    >
                      <td className="border-b border-[#f2f4f8] px-3.5 py-3 align-middle">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={readOnly}
                          onChange={() => toggle(student.uuid)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 cursor-pointer accent-[#0d9488] disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="border-b border-[#f2f4f8] px-3.5 py-3 align-middle text-[13px] whitespace-nowrap">
                        <div className="font-bold text-[#12284a]">{student.fullName}</div>
                        <div className="text-[11.5px] text-[#9aa6ba]">{student.id}</div>
                      </td>
                      <td className="border-b border-[#f2f4f8] px-3.5 py-3 align-middle text-[12.5px] text-[#33415c]">{student.email}</td>
                      <td className="border-b border-[#f2f4f8] px-3.5 py-3 align-middle text-[12.5px] text-[#33415c]">{student.faculty}</td>
                      <td className="border-b border-[#f2f4f8] px-3.5 py-3 align-middle text-[12.5px] text-[#33415c]">{student.program}</td>
                      <td className="border-b border-[#f2f4f8] px-3.5 py-3 align-middle text-[12.5px] whitespace-nowrap text-[#33415c]">
                        <div className="font-semibold text-[#12284a]">{student.level}</div>
                        <div className="text-[11.5px] text-[#9aa6ba]">{student.year}</div>
                      </td>
                      <td className="border-b border-[#f2f4f8] px-3.5 py-3 align-middle">
                        <Pill bg={statusColor.bg} text={statusColor.text}>
                          {student.status}
                        </Pill>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="hidden max-h-[380px] flex-col gap-2 overflow-y-auto max-[701px]:flex">
            {filtered.map((student) => {
              const isSelected = selected.has(student.uuid)
              const statusColor = STATUS_COLORS[student.status]
              return (
                <div
                  key={student.uuid}
                  onClick={readOnly ? undefined : () => toggle(student.uuid)}
                  className={`flex gap-3 rounded-[14px] border p-3.5 ${readOnly ? '' : 'cursor-pointer'} ${
                    isSelected ? 'border-[#ccfbf1] bg-[#f0fdfa]' : 'border-[#eef1f6] bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={readOnly}
                    onChange={() => toggle(student.uuid)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#0d9488] disabled:cursor-not-allowed"
                  />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-bold text-[#12284a]">{student.fullName}</span>
                      <Pill bg={statusColor.bg} text={statusColor.text}>
                        {student.status}
                      </Pill>
                    </div>
                    <span className="text-[12px] text-[#56617a]">{student.id} &middot; {student.email}</span>
                    <span className="text-[12px] text-[#56617a]">{student.faculty}</span>
                    <span className="text-[12px] text-[#56617a]">
                      {student.program} &middot; {student.level} &middot; {student.year}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
