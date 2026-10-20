import Papa from 'papaparse'
// The "universal" build, not "browser": the browser build parses in a Web Worker, and bundled
// workers have already bitten this app once (see ImportStudentsPage's note on PapaParse's worker
// mode). Roster spreadsheets are small enough that parsing on the main thread is instant.
import { readSheet } from 'read-excel-file/universal'

export interface TabularResult {
  meta: { fields: string[] }
  data: Record<string, string>[]
}

export const TABULAR_FILE_ACCEPT =
  '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const UNSUPPORTED_FILE_MESSAGE = 'Please upload a .csv or .xlsx file.'

export function isSupportedTabularFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.csv') || name.endsWith('.xlsx')
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  return String(value).trim()
}

async function parseXlsx(file: File): Promise<TabularResult> {
  const sheet = await readSheet(file)
  if (sheet.length === 0) return { meta: { fields: [] }, data: [] }

  // First row is the header, same as Papa's `header: true`. Blank/duplicate header cells are
  // dropped so every field is a usable, unique key.
  const headerRow = sheet[0].map(cellToString)
  const columns: { index: number; name: string }[] = []
  const seen = new Set<string>()
  headerRow.forEach((name, index) => {
    if (name === '' || seen.has(name)) return
    seen.add(name)
    columns.push({ index, name })
  })

  const data = sheet
    .slice(1)
    .map((row) => Object.fromEntries(columns.map(({ index, name }) => [name, cellToString(row[index])])))
    .filter((row) => Object.values(row).some((v) => v !== ''))

  return { meta: { fields: columns.map((c) => c.name) }, data }
}

// Parses a .csv or .xlsx file into the same `{ meta.fields, data }` shape PapaParse hands to its
// `complete` callback, so the CSV-only call sites needed no changes beyond swapping the parser.
export function parseTabularFile(
  file: File,
  callbacks: { complete: (results: TabularResult) => void; error: () => void },
) {
  if (file.name.toLowerCase().endsWith('.xlsx')) {
    parseXlsx(file).then(callbacks.complete, callbacks.error)
    return
  }
  Papa.parse<Record<string, string>>(file, {
    header: true,
    skipEmptyLines: 'greedy',
    complete: (results) => callbacks.complete({ meta: { fields: results.meta.fields ?? [] }, data: results.data }),
    error: () => callbacks.error(),
  })
}
