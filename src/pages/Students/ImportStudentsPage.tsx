import { useRef, useState, type DragEvent } from 'react'
import {
  parseTabularFile,
  isSupportedTabularFile,
  TABULAR_FILE_ACCEPT,
  UNSUPPORTED_FILE_MESSAGE,
} from '../../lib/parseTabularFile'
import { Link } from 'react-router-dom'
import { CheckCircleIcon, FileUploadIcon, RefreshIcon } from '../../components/icons/NavIcons'
import { Pill } from '../../components/Pill/Pill'
import { MiniStatCard } from '../../components/MiniStatCard/MiniStatCard'
import {
  EXPECTED_FIELD_KEYS,
  EXPECTED_FIELD_LABELS,
  guessColumnMapping,
  validateRows,
  fetchExistingStudentIndex,
  insertImportedStudent,
  updateImportedStudent,
  runWithConcurrency,
  type ColumnMapping,
  type ExpectedField,
  type ImportRow,
} from './csvImportData'
import { SmartImportReview } from './SmartImportReview'
import { buildSmartImportRows, stripJunkHeaderRows, toValidateRowsInput, type SmartImportRow } from './smartImport'

type Step = 'upload' | 'mapping' | 'smart-review' | 'preview' | 'importing' | 'result'

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

const CARD_CLASSES =
  'box-border flex w-full flex-col gap-[18px] rounded-2xl border border-[#eef6f5] bg-white px-[30px] py-7 shadow-[0_10px_30px_rgba(13,148,136,0.07)] max-[601px]:px-5 max-[601px]:py-[22px]'
const FIELD_LABEL_CLASSES = 'text-[13px] font-bold text-[#33415c]'
const SELECT_CLASSES =
  'w-full box-border rounded-[10px] px-3.5 py-3 bg-[#f7f9fc] text-sm text-[#12284a] border border-[#e2e6ee] cursor-pointer [transition:border-color_150ms_ease,background-color_150ms_ease] focus:bg-white focus:border-[#0d9488] focus:outline-none'
const PRIMARY_BTN_CLASSES =
  'rounded-[14px] border-none bg-[linear-gradient(120deg,#0d9488,#14b8a6)] px-6 py-3.5 text-sm font-extrabold text-white cursor-pointer [transition:transform_150ms_ease,box-shadow_150ms_ease] shadow-[0_10px_24px_rgba(13,148,136,0.25)] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(13,148,136,0.32)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:shadow-none'
const SECONDARY_BTN_CLASSES =
  'rounded-[14px] border border-[#e2e6ee] bg-white px-6 py-3.5 text-sm font-bold text-[#56617a] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f2f5fa]'

// Only name and email are required to create a new student — student_number, faculty, program and
// year can all be filled in later via a follow-up CSV (matched by email) once they're known. See
// csvImportData.ts's update path.
const REQUIRED_FOR_NEW: ExpectedField[] = ['first_name', 'last_name', 'email']

const OUTCOME_META: Record<ImportRow['outcome'], { label: string; bg: string; text: string }> = {
  new: { label: 'New', bg: '#e3edff', text: '#2f6fed' },
  update: { label: 'Update', bg: '#fff3d6', text: '#b3790a' },
  error: { label: 'Error', bg: '#fde8e8', text: '#d1453d' },
}

interface WriteFailure {
  row: ImportRow
  reason: string
}

interface ImportOutcome {
  added: number
  updated: number
  validationErrorCount: number
  writeFailures: WriteFailure[]
  warnings: WriteFailure[]
}

function RowDetails({ row }: { row: ImportRow }) {
  if (row.outcome === 'error') {
    return <span className="text-[#d1453d]">{row.errors.join('; ')}</span>
  }
  if (row.outcome === 'update') {
    if (!row.changedFields || row.changedFields.length === 0) {
      return <span className="text-[#9aa6ba]">No changes</span>
    }
    return (
      <div className="flex flex-col gap-0.5">
        {row.changedFields.map((c) => (
          <span key={c.label}>
            <span className="font-semibold text-[#12284a]">{c.label}:</span>{' '}
            <span className="text-[#9aa6ba]">{c.from || '(blank)'}</span> {'→'} {c.to}
          </span>
        ))}
      </div>
    )
  }
  // Faculty and program are both optional now, so either (or both) can be blank — join only the
  // parts that exist instead of always placing a dot between them, which left a stray "··" when
  // one side was empty.
  const summary = [row.mapped.faculty, row.mapped.program].filter(Boolean).join(' · ') || 'No faculty/program set'
  return (
    <span className="text-[#7c8aa0]">
      {summary}
      {!row.mapped.studentNumber && <span className="font-semibold text-[#a0740f]"> &middot; ID pending</span>}
    </span>
  )
}

export function ImportStudentsPage() {
  const [step, setStep] = useState<Step>('upload')
  const [fileError, setFileError] = useState('')
  const [parsing, setParsing] = useState(false)
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Smart import — populated once the column mapping is confirmed, reviewed/edited by staff on
  // the smart-review step, then converted (toValidateRowsInput) into the same shape the existing
  // validateRows() pipeline below already expects, so nothing downstream had to change.
  const [smartRows, setSmartRows] = useState<SmartImportRow[]>([])
  const [skippedRowNumbers, setSkippedRowNumbers] = useState<Set<number>>(new Set())
  const [droppedJunkRowCount, setDroppedJunkRowCount] = useState(0)

  function resetWizard() {
    setStep('upload')
    setFileError('')
    setParsing(false)
    setHeaders([])
    setRawRows([])
    setMapping(null)
    setRows([])
    setProgress({ done: 0, total: 0 })
    setOutcome(null)
    setSmartRows([])
    setSkippedRowNumbers(new Set())
    setDroppedJunkRowCount(0)
  }

  async function runValidation(confirmedMapping: ColumnMapping, parsedRows: Record<string, string>[]) {
    setParsing(true)
    try {
      const existing = await fetchExistingStudentIndex()
      setRows(validateRows(parsedRows, confirmedMapping, existing))
      setStep('preview')
    } catch {
      setFileError('Could not check against existing students. Please try again.')
    } finally {
      setParsing(false)
    }
  }

  function runSmartClean(confirmedMapping: ColumnMapping, parsedRows: Record<string, string>[]) {
    setSmartRows(buildSmartImportRows(parsedRows, confirmedMapping))
    setSkippedRowNumbers(new Set())
    setParsing(false)
    setStep('smart-review')
  }

  function toggleSkipRow(rowNumber: number) {
    setSkippedRowNumbers((prev) => {
      const next = new Set(prev)
      if (next.has(rowNumber)) next.delete(rowNumber)
      else next.add(rowNumber)
      return next
    })
  }

  function handleSmartReviewContinue(scope: 'clean' | 'all') {
    const included = smartRows.filter((row) => !skippedRowNumbers.has(row.rowNumber) && (scope === 'all' || !row.needsReview))
    const { rawRows: convertedRows, mapping: identityMapping } = toValidateRowsInput(included)
    void runValidation(identityMapping, convertedRows)
  }

  function handleDownloadFlagged() {
    const flaggedOrSkipped = smartRows.filter((row) => row.needsReview || skippedRowNumbers.has(row.rowNumber))
    if (flaggedOrSkipped.length === 0) return
    const header = ['Row', 'First name', 'Last name', 'Email', 'Student ID', 'Reasons', 'Skipped'].map(csvEscape).join(',')
    const lines = flaggedOrSkipped.map((row) =>
      [
        String(row.rowNumber),
        row.fields.first_name.value,
        row.fields.last_name.value,
        row.fields.email.value,
        row.fields.student_number.value,
        row.reasons.join('; '),
        skippedRowNumbers.has(row.rowNumber) ? 'Yes' : 'No',
      ]
        .map(csvEscape)
        .join(','),
    )
    downloadCsv('skipped-or-flagged-rows.csv', [header, ...lines].join('\n'))
  }

  function handleFile(file: File) {
    setFileError('')
    if (!isSupportedTabularFile(file)) {
      setFileError(UNSUPPORTED_FILE_MESSAGE)
      return
    }

    setParsing(true)
    // Deliberately not worker: true — PapaParse's worker mode spawns a Web Worker by pointing it
    // at its own script via document.currentScript.src, which resolves to the wrong file once the
    // library is bundled into this app's production build. The worker then throws immediately
    // (`Cannot read properties of undefined (reading 'skipEmptyLines')`) instead of ever calling
    // back, so `complete`/`error` never fire and the UI sits on "Reading file…" indefinitely —
    // this is what actually caused the reported multi-minute hang, not slow parsing. Roster CSVs
    // here are small enough (hundreds to a few thousand rows) that parsing synchronously on the
    // main thread finishes in well under a second anyway, so there's no upside to the worker even
    // if it worked.
    parseTabularFile(file, {
      complete: (results) => {
        const parsedHeaders = results.meta.fields
        const rawParsedRows = results.data.filter((row) => Object.values(row).some((v) => (v ?? '').toString().trim() !== ''))
        // Qualtrics-style question-text + {"ImportId"} rows, if present, are stripped before
        // anything downstream (column mapping guessing, cleaning) ever sees them.
        const { rows: parsedRows, droppedCount } = stripJunkHeaderRows(rawParsedRows)

        if (parsedHeaders.length === 0 || parsedRows.length === 0) {
          setParsing(false)
          setFileError('This file has no data rows to import.')
          return
        }

        setHeaders(parsedHeaders)
        setRawRows(parsedRows)
        setDroppedJunkRowCount(droppedCount)
        const { mapping: guessed, exact } = guessColumnMapping(parsedHeaders)
        setMapping(guessed)

        if (exact) {
          runSmartClean(guessed, parsedRows)
        } else {
          setParsing(false)
          setStep('mapping')
        }
      },
      error: () => {
        setParsing(false)
        setFileError('Could not read this file. Please check it is a valid CSV or Excel (.xlsx) file and try again.')
      },
    })
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  function updateMapping(field: ExpectedField, header: string) {
    setMapping((prev) => (prev ? { ...prev, [field]: header || null } : prev))
  }

  async function handleConfirmImport() {
    setStep('importing')
    const importable = rows.filter((r) => r.outcome !== 'error')
    setProgress({ done: 0, total: importable.length })
    let done = 0

    const results = await runWithConcurrency(importable, 10, async (row) => {
      const res =
        row.outcome === 'new'
          ? await insertImportedStudent(row)
          : await updateImportedStudent(row.existingStudent!.id, row.changes ?? {})
      done += 1
      setProgress({ done, total: importable.length })
      return { row, res }
    })

    const added = results.filter((r) => r.row.outcome === 'new' && r.res.ok).length
    const updated = results.filter((r) => r.row.outcome === 'update' && r.res.ok).length
    const writeFailures = results.filter((r) => !r.res.ok).map((r) => ({ row: r.row, reason: r.res.error ?? 'Unknown error' }))
    const warnings = results
      .filter((r) => r.res.ok && r.res.warning)
      .map((r) => ({ row: r.row, reason: r.res.warning ?? '' }))

    setOutcome({
      added,
      updated,
      validationErrorCount: rows.filter((r) => r.outcome === 'error').length,
      writeFailures,
      warnings,
    })
    setStep('result')
  }

  const newCount = rows.filter((r) => r.outcome === 'new').length
  const updateCount = rows.filter((r) => r.outcome === 'update').length
  const errorCount = rows.filter((r) => r.outcome === 'error').length

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-[22px]">
      <div>
          <p className="m-0 text-sm text-[#7c8aa0]">Bulk import or update students from a CSV or Excel file.</p>
        </div>

        {step === 'upload' && (
          <div className={CARD_CLASSES}>
            <h2 className="m-0 mb-0.5 text-[13px] font-extrabold tracking-[0.6px] text-[#0d9488] uppercase">Upload a file</h2>
            <p className="m-0 -mt-2 text-[12.5px] text-[#9aa6ba]">
              Expected columns: student_number, first_name, last_name, email, faculty, program, program_level, year, status.
              Extra columns are ignored, and renamed columns can be matched on the next step.
            </p>

            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center [transition:border-color_150ms_ease,background-color_150ms_ease] ${
                dragActive ? 'border-[#0d9488] bg-[#f0fdfa]' : 'border-[#dbe2ea] bg-[#fbfcfe] hover:border-[#c7d0e0]'
              }`}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ccfbf1] text-[#0d9488]">
                <FileUploadIcon size={26} />
              </div>
              <div>
                <p className="m-0 text-[15px] font-bold text-[#12284a]">Drag and drop a CSV or Excel file here</p>
                <p className="m-0 mt-1 text-[13px] text-[#7c8aa0]">or click to browse &mdash; .csv or .xlsx files</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept={TABULAR_FILE_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFile(file)
                  e.target.value = ''
                }}
              />
            </div>

            {parsing && <p className="m-0 text-[13px] font-semibold text-[#7c8aa0]">Reading file&hellip;</p>}
            {fileError && (
              <div className="rounded-[10px] border border-[#f8c9c9] bg-[#fde8e8] px-3.5 py-3 text-[13px] font-semibold text-[#d1453d]">
                {fileError}
              </div>
            )}
          </div>
        )}

        {step === 'mapping' && mapping && (
          <div className={CARD_CLASSES}>
            <h2 className="m-0 mb-0.5 text-[13px] font-extrabold tracking-[0.6px] text-[#0d9488] uppercase">Match your columns</h2>
            <p className="m-0 -mt-2 text-[12.5px] text-[#9aa6ba]">
              We couldn&apos;t match every column automatically &mdash; confirm or adjust below. We&apos;ve pre-filled our best
              guesses.
            </p>

            <div className="flex flex-col gap-3.5">
              {EXPECTED_FIELD_KEYS.map((field) => (
                <div key={field} className="grid grid-cols-2 items-center gap-3 max-[601px]:grid-cols-1">
                  <label className={FIELD_LABEL_CLASSES}>
                    {EXPECTED_FIELD_LABELS[field]}
                    {REQUIRED_FOR_NEW.includes(field) && <span className="text-[#9aa6ba]"> (required for new students)</span>}
                  </label>
                  <select
                    value={mapping[field] ?? ''}
                    onChange={(e) => updateMapping(field, e.target.value)}
                    className={`${SELECT_CLASSES} cursor-pointer`}
                  >
                    <option value="">Not present</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button type="button" className={SECONDARY_BTN_CLASSES} onClick={resetWizard}>
                Start over
              </button>
              <button type="button" className={PRIMARY_BTN_CLASSES} onClick={() => runSmartClean(mapping, rawRows)}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'smart-review' && (
          <SmartImportReview
            rows={smartRows}
            onRowsChange={setSmartRows}
            skipped={skippedRowNumbers}
            onToggleSkip={toggleSkipRow}
            droppedJunkRowCount={droppedJunkRowCount}
            onStartOver={resetWizard}
            onContinue={handleSmartReviewContinue}
          />
        )}

        {(step === 'preview' || step === 'importing') && (
          <div className="flex flex-col gap-[18px]">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-[18px] max-[701px]:gap-3">
              <MiniStatCard count={newCount} label="New students" theme="blue" />
              <MiniStatCard count={updateCount} label="Will update" theme="amber" />
              <MiniStatCard count={errorCount} label="Errors (won't import)" theme="purple" />
            </div>

            <div className="overflow-x-auto rounded-[18px] bg-white shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[701px]:hidden">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr>
                    <th className="border-b border-[#eef1f6] px-[18px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                      Row
                    </th>
                    <th className="border-b border-[#eef1f6] px-[18px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                      Name
                    </th>
                    <th className="border-b border-[#eef1f6] px-[18px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                      Email
                    </th>
                    <th className="border-b border-[#eef1f6] px-[18px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                      Status
                    </th>
                    <th className="border-b border-[#eef1f6] px-[18px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const meta = OUTCOME_META[row.outcome]
                    const cellBorder = index === rows.length - 1 ? '' : 'border-b border-[#f2f4f8]'
                    return (
                      <tr key={row.rowNumber}>
                        <td className={`px-[18px] py-3.5 align-top text-[13px] text-[#9aa6ba] ${cellBorder}`}>{row.rowNumber}</td>
                        <td className={`px-[18px] py-3.5 align-top text-[13.5px] font-bold whitespace-nowrap text-[#12284a] ${cellBorder}`}>
                          {row.mapped.firstName} {row.mapped.lastName}
                        </td>
                        <td className={`px-[18px] py-3.5 align-top text-[13px] text-[#33415c] ${cellBorder}`}>{row.mapped.email}</td>
                        <td className={`px-[18px] py-3.5 align-top ${cellBorder}`}>
                          <Pill bg={meta.bg} text={meta.text}>
                            {meta.label}
                          </Pill>
                        </td>
                        <td className={`px-[18px] py-3.5 align-top text-[12.5px] ${cellBorder}`}>
                          <RowDetails row={row} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="hidden flex-col gap-3 max-[701px]:flex">
              {rows.map((row) => {
                const meta = OUTCOME_META[row.outcome]
                return (
                  <div key={row.rowNumber} className="flex flex-col gap-1.5 rounded-2xl bg-white p-[18px] shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
                    <div className="flex items-center justify-between gap-2.5">
                      <span className="text-[14px] font-bold text-[#12284a]">
                        {row.mapped.firstName} {row.mapped.lastName}
                      </span>
                      <Pill bg={meta.bg} text={meta.text}>
                        {meta.label}
                      </Pill>
                    </div>
                    <div className="text-[12.5px] text-[#56617a]">{row.mapped.email}</div>
                    <div className="text-[12.5px]">
                      <RowDetails row={row} />
                    </div>
                  </div>
                )
              })}
            </div>

            {step === 'importing' && (
              <div className={CARD_CLASSES}>
                <p className="m-0 text-[13.5px] font-semibold text-[#12284a]">
                  Importing {progress.done} / {progress.total}&hellip;
                </p>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#eef1f6]">
                  <div
                    className="h-full rounded-full bg-[#0d9488] [transition:width_150ms_ease]"
                    style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {step === 'preview' && (
              <div className="flex flex-wrap gap-3">
                <button type="button" className={SECONDARY_BTN_CLASSES} onClick={resetWizard}>
                  Start over
                </button>
                <button
                  type="button"
                  className={PRIMARY_BTN_CLASSES}
                  disabled={newCount + updateCount === 0}
                  onClick={() => void handleConfirmImport()}
                >
                  Confirm Import ({newCount + updateCount})
                </button>
              </div>
            )}
          </div>
        )}

        {step === 'result' && outcome && (
          <div className={`${CARD_CLASSES} items-center text-center`}>
            <div className="mb-1 flex h-16 w-16 items-center justify-center rounded-full bg-[#ccfbf1] text-[#0d9488]">
              <CheckCircleIcon size={30} />
            </div>
            <h2 className="m-0 text-2xl font-extrabold text-[#1d1d1f]">Import complete</h2>
            <p className="m-0 text-[15px] text-[#6b7a94]">
              {outcome.added} added, {outcome.updated} updated, {outcome.validationErrorCount + outcome.writeFailures.length} skipped.
            </p>

            {outcome.warnings.length > 0 && (
              <div className="w-full rounded-[10px] border border-[#fbedc0] bg-[#fff8e1] px-3.5 py-3 text-left text-[13px] font-semibold text-[#8a6d1a]">
                {outcome.warnings.map((w) => (
                  <div key={w.row.rowNumber}>
                    Row {w.row.rowNumber} ({w.row.mapped.email}): {w.reason}
                  </div>
                ))}
              </div>
            )}

            {outcome.writeFailures.length > 0 && (
              <div className="w-full rounded-[10px] border border-[#f8c9c9] bg-[#fde8e8] px-3.5 py-3 text-left text-[13px] font-semibold text-[#d1453d]">
                <p className="m-0 mb-1">Rows that failed to import:</p>
                {outcome.writeFailures.map((f) => (
                  <div key={f.row.rowNumber} className="font-normal">
                    Row {f.row.rowNumber} ({f.row.mapped.email}): {f.reason}
                  </div>
                ))}
              </div>
            )}

            {smartRows.some((row) => row.needsReview || skippedRowNumbers.has(row.rowNumber)) && (
              <button type="button" className={`w-full ${SECONDARY_BTN_CLASSES}`} onClick={handleDownloadFlagged}>
                Download skipped or flagged rows (CSV)
              </button>
            )}

            <div className="mt-2 flex w-full gap-3 max-[601px]:flex-col">
              <button type="button" className={`flex-1 ${SECONDARY_BTN_CLASSES}`} onClick={resetWizard}>
                <span className="inline-flex items-center justify-center gap-1.5">
                  <RefreshIcon size={14} />
                  Import another file
                </span>
              </button>
              <Link to="/students/directory" className={`flex-1 text-center no-underline ${PRIMARY_BTN_CLASSES}`}>
                Back to Student Directory
              </Link>
            </div>
          </div>
        )}
    </div>
  )
}
