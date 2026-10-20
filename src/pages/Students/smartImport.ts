// Cleans a messy survey-export CSV (Qualtrics and similar tools) into the shape the existing CSV
// import pipeline (csvImportData.ts) already knows how to validate and write — every rule here is
// plain code (regex, lookup tables, Fuse.js fuzzy matching), nothing calls an AI model or an
// external API, and no student data leaves the browser. A cleaned value is never invented when the
// source is ambiguous: an uncertain field is flagged for a human to confirm instead.
// The single-function import (not `import validator from 'validator'`) keeps the rest of
// validator's ~150 other checks — locale data, credit cards, IBANs, etc. — out of this app's
// bundle entirely; isEmail is the only one this file needs.
import isEmail from 'validator/lib/isEmail'
import { matchFaculty } from '../../data/facultyProgramLookup'
import { LEVELS, STUDENT_ID_PATTERN } from '../AddStudent/addStudentData'
import { EXPECTED_FIELD_KEYS, type ColumnMapping, type ExpectedField } from './csvImportData'
import { needsCaseFix, toNameCase } from './nameCase'

export type Confidence = 'high' | 'medium' | 'low'

export interface CleanedField {
  original: string
  value: string
  confidence: Confidence
  changed: boolean
  note?: string
}

export type CleanedFields = Record<ExpectedField, CleanedField>

export interface SmartImportRow {
  rowNumber: number // matches the CSV's own line numbers, same convention as ImportRow
  raw: Record<string, string>
  fields: CleanedFields
  needsReview: boolean
  reasons: string[]
}

// Qualtrics (and similar survey tools) put the question text in the first data row and an
// {"ImportId":...} JSON blob in the second — both land as ordinary data rows once PapaParse has
// already consumed the real header row. Detection is deliberately narrow (only the file's first
// two rows, only the literal ImportId signature) rather than scanning the whole file, so a
// legitimate data row can never be mistaken for one of these.
const IMPORT_ID_PATTERN = /^\{"ImportId"/

export function stripJunkHeaderRows(rows: Record<string, string>[]): { rows: Record<string, string>[]; droppedCount: number } {
  if (rows.length < 2) return { rows, droppedCount: 0 }
  const secondRowIsImportId = Object.values(rows[1]).some((v) => IMPORT_ID_PATTERN.test((v ?? '').toString().trim()))
  if (!secondRowIsImportId) return { rows, droppedCount: 0 }
  return { rows: rows.slice(2), droppedCount: 2 }
}

function field(original: string, value: string, confidence: Confidence, note?: string): CleanedField {
  return { original, value, confidence, changed: value !== original, note }
}

function cleanName(raw: string): CleanedField {
  const trimmed = raw.trim()
  if (!trimmed) return field(raw, '', 'low', 'Missing')
  const cased = needsCaseFix(trimmed) ? toNameCase(trimmed) : trimmed
  return field(raw, cased, 'high')
}

function cleanEmail(raw: string): CleanedField {
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return field(raw, '', 'low', 'Missing')
  if (!isEmail(trimmed)) return field(raw, trimmed, 'low', 'Invalid email format')
  return field(raw, trimmed, 'high')
}

// 2.9E+09 / 3.82E+09 — a 9-digit student number that Excel silently reformatted as scientific
// notation along the way. The precision is already gone by the time it reaches us, so guessing the
// real digits back would just invent a wrong ID; blanking it is the only honest option.
const SCI_NOTATION_PATTERN = /^\d(\.\d+)?e\+?\d+$/i

function cleanStudentNumber(raw: string): CleanedField {
  const trimmed = raw.trim()
  if (!trimmed) return field(raw, '', 'high') // blank is fine — student_number is optional
  if (SCI_NOTATION_PATTERN.test(trimmed)) {
    return field(raw, '', 'low', 'Student number damaged, re-export from the survey tool')
  }
  if (STUDENT_ID_PATTERN.test(trimmed)) return field(raw, trimmed, 'high')
  return field(raw, trimmed, 'medium', 'Student ID should be 9 digits — check this value')
}

const SEMESTER_PATTERN = /semester/i

// A year of study only ever needs "one" through "tenth" — no general-purpose number-word parser
// is worth the dependency weight (or, as it turned out, the broken browser bundling — see
// smartImport.test.ts's history) for a lookup this small.
const YEAR_WORD_TO_NUMBER: Record<string, number> = {
  one: 1,
  first: 1,
  two: 2,
  second: 2,
  three: 3,
  third: 3,
  four: 4,
  fourth: 4,
  five: 5,
  fifth: 5,
  six: 6,
  sixth: 6,
  seven: 7,
  seventh: 7,
  eight: 8,
  eighth: 8,
  nine: 9,
  ninth: 9,
  ten: 10,
  tenth: 10,
}

function extractYearNumber(text: string): number | null {
  const digitMatch = text.match(/\d+/)
  if (digitMatch) return Number(digitMatch[0])
  const word = text
    .toLowerCase()
    .match(/[a-z]+/g)
    ?.find((w) => w in YEAR_WORD_TO_NUMBER)
  return word ? YEAR_WORD_TO_NUMBER[word] : null
}

// Handles "1st", "2nd year", "grade 1", "first year", "Year 3", "3rd year" and plain "2".
function cleanYear(raw: string): CleanedField {
  const trimmed = raw.trim()
  if (!trimmed) return field(raw, '', 'high') // blank is fine — year is optional
  if (SEMESTER_PATTERN.test(trimmed)) {
    return field(raw, trimmed, 'medium', 'Given in semesters, not years — check this value')
  }

  const n = extractYearNumber(trimmed)
  if (n === null) return field(raw, trimmed, 'low', 'Could not determine year from this value')
  if (n < 1 || n > 8) return field(raw, String(n), 'medium', 'Unusual year value — check this')
  return field(raw, String(n), 'high')
}

function cleanProgramLevel(raw: string, programText: string): CleanedField {
  const trimmed = raw.trim()
  const exact = LEVELS.find((l) => l.toLowerCase() === trimmed.toLowerCase())
  if (exact) return field(raw, exact, 'high')

  if (!trimmed && !programText.trim()) return field(raw, '', 'high') // blank is fine — program level is optional

  const source = `${raw} ${programText}`.toLowerCase()
  const inferredFromText = !trimmed // only "inferred" (medium) when the level column itself was blank
  if (/phd|doctor|master|msc|mba|meng|mfa|msw|llm|\bma\b/.test(source)) {
    return field(raw, 'Graduate', inferredFromText ? 'medium' : 'high', inferredFromText ? 'Inferred from program text' : undefined)
  }
  if (/bachelor|undergrad/.test(source)) {
    return field(raw, 'Undergraduate', inferredFromText ? 'medium' : 'high', inferredFromText ? 'Inferred from program text' : undefined)
  }
  return field(raw, trimmed, 'low', 'Could not determine program level')
}

function cleanFaculty(raw: string, programText: string): CleanedField {
  if (!raw.trim() && !programText.trim()) return field(raw, '', 'high') // blank is fine — faculty is optional

  const match = matchFaculty(raw, programText)
  if (!match) return field(raw, raw.trim(), 'low', 'Could not match a faculty')
  if (match.via === 'exact' || match.via === 'suffix') return field(raw, match.faculty, 'high')
  // A fuzzy guess (from program or faculty text) is filled in but flagged — staff confirms it
  // rather than it silently becoming the record, since Fuse.js can be wrong on a short string.
  const confidence: Confidence = match.score < 0.2 ? 'medium' : 'low'
  return field(raw, match.faculty, confidence, `Fuzzy-matched from ${match.via === 'program' ? 'program' : 'faculty'} text — confirm this`)
}

function cleanProgram(raw: string): CleanedField {
  const trimmed = raw.trim()
  if (!trimmed) return field(raw, '', 'high') // blank is fine — program is optional
  return field(raw, trimmed, 'high')
}

function cleanStatus(raw: string): CleanedField {
  return field(raw, raw.trim(), 'high') // optional — defaults to Active downstream, same as today
}

function getRawValue(raw: Record<string, string>, mapping: ColumnMapping, key: ExpectedField): string {
  const header = mapping[key]
  if (!header) return ''
  return (raw[header] ?? '').toString().trim()
}

export function cleanRow(raw: Record<string, string>, mapping: ColumnMapping): CleanedFields {
  const programRaw = getRawValue(raw, mapping, 'program')
  return {
    student_number: cleanStudentNumber(getRawValue(raw, mapping, 'student_number')),
    first_name: cleanName(getRawValue(raw, mapping, 'first_name')),
    last_name: cleanName(getRawValue(raw, mapping, 'last_name')),
    email: cleanEmail(getRawValue(raw, mapping, 'email')),
    faculty: cleanFaculty(getRawValue(raw, mapping, 'faculty'), programRaw),
    program: cleanProgram(programRaw),
    program_level: cleanProgramLevel(getRawValue(raw, mapping, 'program_level'), programRaw),
    year: cleanYear(getRawValue(raw, mapping, 'year')),
    status: cleanStatus(getRawValue(raw, mapping, 'status')),
  }
}

export function buildSmartImportRows(rawRows: Record<string, string>[], mapping: ColumnMapping): SmartImportRow[] {
  const rows: SmartImportRow[] = rawRows.map((raw, index) => ({
    rowNumber: index + 2,
    raw,
    fields: cleanRow(raw, mapping),
    needsReview: false,
    reasons: [],
  }))

  for (const row of rows) {
    const reasons: string[] = []
    for (const key of EXPECTED_FIELD_KEYS) {
      const note = row.fields[key].note
      if (row.fields[key].confidence !== 'high' && note) reasons.push(note)
    }
    row.reasons = reasons
    row.needsReview = reasons.length > 0
  }

  flagDuplicates(rows, (r) => r.fields.email.value, 'Duplicate email')
  flagDuplicates(rows, (r) => r.fields.student_number.value, 'Duplicate student number')

  return rows
}

// Groups rows by `key(row)`, keeps the first occurrence clean, and flags every later one — "detect
// duplicate rows ... keep the first and flag the others."
function flagDuplicates(rows: SmartImportRow[], key: (row: SmartImportRow) => string, label: string) {
  const groups = new Map<string, SmartImportRow[]>()
  for (const row of rows) {
    const value = key(row)
    if (!value) continue
    const group = groups.get(value) ?? []
    group.push(row)
    groups.set(value, group)
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    for (let i = 1; i < group.length; i++) {
      group[i].reasons.push(`${label} (also row ${group[0].rowNumber})`)
      group[i].needsReview = true
    }
  }
}

export interface SmartImportSummary {
  total: number
  clean: number
  needsReview: number
  duplicates: number
  damagedIds: number
}

export function summarizeSmartImport(rows: SmartImportRow[]): SmartImportSummary {
  const duplicates = rows.filter((r) => r.reasons.some((reason) => reason.startsWith('Duplicate'))).length
  const damagedIds = rows.filter((r) => r.fields.student_number.note?.includes('damaged')).length
  const needsReview = rows.filter((r) => r.needsReview).length
  return { total: rows.length, clean: rows.length - needsReview, needsReview, duplicates, damagedIds }
}

// Feeds the (possibly staff-edited) cleaned values back into the existing validateRows() pipeline
// unchanged — a synthetic "raw row" keyed by the field names themselves, with an identity mapping,
// so none of csvImportData.ts's tested business-rule logic (matching against existing students,
// required-field checks, the ID-collision check, etc.) needs to be duplicated or re-implemented here.
export function toValidateRowsInput(rows: SmartImportRow[]): { rawRows: Record<string, string>[]; mapping: ColumnMapping } {
  const mapping = Object.fromEntries(EXPECTED_FIELD_KEYS.map((key) => [key, key])) as ColumnMapping
  const rawRows = rows.map((row) => Object.fromEntries(EXPECTED_FIELD_KEYS.map((key) => [key, row.fields[key].value])))
  return { rawRows, mapping }
}
