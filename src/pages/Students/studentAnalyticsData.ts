import { supabase } from '../../lib/supabaseClient'
import type { StudentStatus } from '../StudentDirectory/studentDirectoryData'

// Raw shape pulled once from Supabase and aggregated client-side below — the `students` table is
// small enough (an internal staff tool, not a public-facing app) that a single unfiltered select
// is simpler and cheaper than maintaining several bespoke Postgres aggregate RPCs.
interface AnalyticsRow {
  faculty: string
  status: StudentStatus
  created_at: string
}

async function fetchAllStudentsForAnalytics(): Promise<AnalyticsRow[]> {
  const { data, error } = await supabase.from('students').select('faculty, status, created_at')
  if (error) throw error
  return (data ?? []) as AnalyticsRow[]
}

export interface FacultyCount {
  faculty: string
  count: number
}

export interface StatusCount {
  status: StudentStatus
  count: number
  percent: number
}

export interface JoinPeriod {
  key: string // sortable, e.g. "2026-03"
  label: string // display, e.g. "Mar 2026"
  count: number
}

export interface FacultyStatusRow {
  faculty: string
  Active: number
  Alumni: number
  Withdrawn: number
  total: number
}

export type FacultyTrendDirection = 'up' | 'down' | 'flat' | 'new'

export interface FacultyTrend {
  faculty: string
  direction: FacultyTrendDirection
  // Per-semester new-join counts, oldest to newest — only the semesters that actually appear in
  // the data (short/empty when everyone joined in the same window, e.g. right after a fresh seed).
  history: { semester: string; count: number }[]
}

export interface StudentAnalytics {
  facultyCounts: FacultyCount[]
  statusBreakdown: StatusCount[]
  joinsOverTime: JoinPeriod[]
  facultyStatusMatrix: FacultyStatusRow[]
  facultyTrends: FacultyTrend[]
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// Fall (Sep–Dec) / Winter (Jan–Apr) / Summer (May–Aug) — standard university term calendar.
function semesterOf(date: Date): { key: string; label: string } {
  const year = date.getFullYear()
  const month = date.getMonth()
  if (month <= 3) return { key: `${year}-1`, label: `Winter ${year}` }
  if (month <= 7) return { key: `${year}-2`, label: `Summer ${year}` }
  return { key: `${year}-3`, label: `Fall ${year}` }
}

export async function fetchStudentAnalytics(): Promise<StudentAnalytics> {
  const rows = await fetchAllStudentsForAnalytics()

  // --- Chart 1: student count by faculty, lowest first ---
  const facultyCountMap = new Map<string, number>()
  for (const row of rows) facultyCountMap.set(row.faculty, (facultyCountMap.get(row.faculty) ?? 0) + 1)
  const facultyCounts: FacultyCount[] = [...facultyCountMap.entries()]
    .map(([faculty, count]) => ({ faculty, count }))
    .sort((a, b) => a.count - b.count)

  // --- Chart 2: Active / Alumni / Withdrawn breakdown ---
  const statusCountMap = new Map<StudentStatus, number>([
    ['Active', 0],
    ['Alumni', 0],
    ['Withdrawn', 0],
  ])
  for (const row of rows) statusCountMap.set(row.status, (statusCountMap.get(row.status) ?? 0) + 1)
  const total = rows.length
  const statusBreakdown: StatusCount[] = [...statusCountMap.entries()].map(([status, count]) => ({
    status,
    count,
    percent: total > 0 ? Math.round((count / total) * 100) : 0,
  }))

  // --- Chart 3: new students joined per month ---
  const joinMap = new Map<string, { label: string; count: number }>()
  for (const row of rows) {
    const date = new Date(row.created_at)
    const key = monthKey(date)
    const existing = joinMap.get(key)
    if (existing) existing.count += 1
    else joinMap.set(key, { label: monthLabel(date), count: 1 })
  }
  const joinsOverTime: JoinPeriod[] = [...joinMap.entries()]
    .map(([key, { label, count }]) => ({ key, label, count }))
    .sort((a, b) => a.key.localeCompare(b.key))

  // --- Chart 4: faculty x status stacked ---
  const matrixMap = new Map<string, FacultyStatusRow>()
  for (const { faculty } of facultyCounts) matrixMap.set(faculty, { faculty, Active: 0, Alumni: 0, Withdrawn: 0, total: 0 })
  for (const row of rows) {
    const entry = matrixMap.get(row.faculty)
    if (!entry) continue
    entry[row.status] += 1
    entry.total += 1
  }
  const facultyStatusMatrix = [...matrixMap.values()]

  // --- Chart 5: per-faculty growth trend across recent semesters ---
  const facultySemesterMap = new Map<string, Map<string, { label: string; count: number }>>()
  for (const row of rows) {
    const { key, label } = semesterOf(new Date(row.created_at))
    if (!facultySemesterMap.has(row.faculty)) facultySemesterMap.set(row.faculty, new Map())
    const semesterMap = facultySemesterMap.get(row.faculty)!
    const existing = semesterMap.get(key)
    if (existing) existing.count += 1
    else semesterMap.set(key, { label, count: 1 })
  }

  const facultyTrends: FacultyTrend[] = facultyCounts.map(({ faculty }) => {
    const semesterMap = facultySemesterMap.get(faculty) ?? new Map()
    const history = [...semesterMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-4)
      .map(([, value]) => value)

    let direction: FacultyTrendDirection = 'new'
    if (history.length >= 2) {
      const latest = history[history.length - 1].count
      const previous = history[history.length - 2].count
      direction = latest > previous ? 'up' : latest < previous ? 'down' : 'flat'
    }

    return { faculty, direction, history }
  })

  return { facultyCounts, statusBreakdown, joinsOverTime, facultyStatusMatrix, facultyTrends }
}
