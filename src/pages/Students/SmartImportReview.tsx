import { useMemo, useState } from 'react'
import { MiniStatCard } from '../../components/MiniStatCard/MiniStatCard'
import { EXPECTED_FIELD_LABELS, type ExpectedField } from './csvImportData'
import { summarizeSmartImport, type CleanedField, type SmartImportRow } from './smartImport'

const PRIMARY_BTN_CLASSES =
  'rounded-[14px] border-none bg-[linear-gradient(120deg,#0d9488,#14b8a6)] px-6 py-3.5 text-sm font-extrabold text-white cursor-pointer [transition:transform_150ms_ease,box-shadow_150ms_ease] shadow-[0_10px_24px_rgba(13,148,136,0.25)] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(13,148,136,0.32)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:shadow-none'
const SECONDARY_BTN_CLASSES =
  'rounded-[14px] border border-[#e2e6ee] bg-white px-6 py-3.5 text-sm font-bold text-[#56617a] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f2f5fa]'
const CARD_CLASSES =
  'box-border flex w-full flex-col gap-[18px] rounded-2xl border border-[#eef6f5] bg-white px-[30px] py-7 shadow-[0_10px_30px_rgba(13,148,136,0.07)] max-[601px]:px-5 max-[601px]:py-[22px]'

// Only fields worth their own review column — status is optional/rarely messy and program is
// mostly a pass-through, so showing them here would add width without adding anything to review.
const REVIEW_FIELDS: ExpectedField[] = ['first_name', 'last_name', 'email', 'student_number', 'faculty', 'program', 'program_level', 'year']

function cellClasses(cell: CleanedField): string {
  if (cell.confidence === 'low') return 'border-[#f8c9c9] bg-[#fdf3f3] text-[#9a2f29]'
  if (cell.confidence === 'medium') return 'border-[#fde3c4] bg-[#fffaf3] text-[#8a6d1a]'
  if (cell.changed) return 'border-[#bcd6f8] bg-[#f3f8ff] text-[#1d4ed8]'
  return 'border-[#e2e6ee] bg-white text-[#1d1d1f]'
}

interface Props {
  rows: SmartImportRow[]
  onRowsChange: (rows: SmartImportRow[]) => void
  skipped: Set<number>
  onToggleSkip: (rowNumber: number) => void
  droppedJunkRowCount: number
  onStartOver: () => void
  onContinue: (scope: 'clean' | 'all') => void
}

export function SmartImportReview({ rows, onRowsChange, skipped, onToggleSkip, droppedJunkRowCount, onStartOver, onContinue }: Props) {
  const [reviewOnly, setReviewOnly] = useState(false)
  const summary = useMemo(() => summarizeSmartImport(rows), [rows])

  const visibleRows = reviewOnly ? rows.filter((r) => r.needsReview) : rows
  const includedCount = rows.filter((r) => !skipped.has(r.rowNumber)).length
  const cleanIncludedCount = rows.filter((r) => !skipped.has(r.rowNumber) && !r.needsReview).length

  function editCell(rowNumber: number, key: ExpectedField, value: string) {
    onRowsChange(
      rows.map((row) =>
        row.rowNumber !== rowNumber
          ? row
          : { ...row, fields: { ...row.fields, [key]: { ...row.fields[key], value, changed: value !== row.fields[key].original } } },
      ),
    )
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div className={CARD_CLASSES}>
        <h2 className="m-0 mb-0.5 text-[13px] font-extrabold tracking-[0.6px] text-[#0d9488] uppercase">Smart import — review</h2>
        <p className="m-0 -mt-2 text-[12.5px] text-[#9aa6ba]">
          Every cell below was cleaned automatically. Blue means we changed something confidently, amber means we guessed and you
          should confirm it, red means we couldn&apos;t make sense of it. Edit any cell directly before importing.
          {droppedJunkRowCount > 0 &&
            ` We also dropped ${droppedJunkRowCount} header-only row${droppedJunkRowCount === 1 ? '' : 's'} (question text / import IDs) before cleaning.`}
        </p>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3">
          <MiniStatCard count={summary.clean} label="Clean" theme="green" />
          <MiniStatCard count={summary.needsReview} label="Need review" theme="amber" />
          <MiniStatCard count={summary.duplicates} label="Duplicates" theme="purple" />
          <MiniStatCard count={summary.damagedIds} label="Damaged IDs" theme="blue" />
        </div>

        <label className="inline-flex w-fit items-center gap-2 text-[13px] font-semibold text-[#33415c]">
          <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} className="h-4 w-4 accent-[#0d9488]" />
          Show only rows that need review ({summary.needsReview})
        </label>
      </div>

      <div className="overflow-x-auto rounded-[18px] bg-white shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
        <table className="w-full min-w-[1180px] border-collapse">
          <caption className="sr-only">Cleaned rows ready for review, original values editable before import</caption>
          <thead>
            <tr>
              <th className="border-b border-[#eef1f6] px-3 py-3 text-left text-[11px] font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                Row
              </th>
              {REVIEW_FIELDS.map((key) => (
                <th
                  key={key}
                  className="border-b border-[#eef1f6] px-3 py-3 text-left text-[11px] font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase"
                >
                  {EXPECTED_FIELD_LABELS[key]}
                </th>
              ))}
              <th className="border-b border-[#eef1f6] px-3 py-3 text-left text-[11px] font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                Why
              </th>
              <th className="border-b border-[#eef1f6] px-3 py-3 text-right text-[11px] font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                <span className="sr-only">Skip</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const isSkipped = skipped.has(row.rowNumber)
              return (
                <tr key={row.rowNumber} className={isSkipped ? 'opacity-50' : ''}>
                  <td className="border-b border-[#f2f4f8] px-3 py-2.5 align-top text-[12.5px] text-[#9aa6ba]">{row.rowNumber}</td>
                  {REVIEW_FIELDS.map((key) => {
                    const cell = row.fields[key]
                    return (
                      <td key={key} className="border-b border-[#f2f4f8] px-2 py-2 align-top">
                        <input
                          type="text"
                          value={cell.value}
                          disabled={isSkipped}
                          onChange={(e) => editCell(row.rowNumber, key, e.target.value)}
                          aria-label={`${EXPECTED_FIELD_LABELS[key]} for row ${row.rowNumber}`}
                          className={`w-full min-w-[110px] rounded-[8px] border px-2.5 py-1.5 text-[12.5px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30 disabled:cursor-not-allowed ${cellClasses(cell)}`}
                        />
                        {cell.changed && (
                          <span className="mt-0.5 block truncate text-[10.5px] text-[#9aa6ba]" title={cell.original}>
                            was: {cell.original || '(blank)'}
                          </span>
                        )}
                      </td>
                    )
                  })}
                  <td className="border-b border-[#f2f4f8] px-3 py-2.5 align-top text-[11.5px] text-[#7c8aa0]">
                    {row.reasons.length > 0 ? row.reasons.join('; ') : <span className="text-[#c3ccdb]">&mdash;</span>}
                  </td>
                  <td className="border-b border-[#f2f4f8] px-3 py-2.5 text-right align-top">
                    <button
                      type="button"
                      aria-pressed={isSkipped}
                      onClick={() => onToggleSkip(row.rowNumber)}
                      className={`rounded-[8px] border px-2.5 py-1.5 text-[11.5px] font-bold whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0d9488] ${
                        isSkipped
                          ? 'border-[#e2e6ee] bg-[#f2f5fa] text-[#56617a]'
                          : 'border-[#f8c9c9] bg-white text-[#d1453d] hover:bg-[#fde8e8]'
                      }`}
                    >
                      {isSkipped ? 'Skipped' : 'Skip'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" className={SECONDARY_BTN_CLASSES} onClick={onStartOver}>
          Start over
        </button>
        <button type="button" className={SECONDARY_BTN_CLASSES} disabled={cleanIncludedCount === 0} onClick={() => onContinue('clean')}>
          Import only clean rows ({cleanIncludedCount})
        </button>
        <button type="button" className={PRIMARY_BTN_CLASSES} disabled={includedCount === 0} onClick={() => onContinue('all')}>
          Import all reviewed rows ({includedCount})
        </button>
      </div>
    </div>
  )
}
