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

export type FacultyTrendDirection = 'up' | 'down' | 'flat' | 'new'

export interface FacultyTrend {
  faculty: string
  direction: FacultyTrendDirection
  // Per-semester new-join counts, oldest to newest — only the semesters that actually appear in
  // the data (short/empty when everyone joined in the same window, e.g. right after a fresh seed).
  history: { semester: string; count: number }[]
}

export interface TopActiveStudent {
  studentId: string
  fullName: string
  faculty: string
  eventsCompleted: number
}

export interface StudentAnalytics {
  facultyCounts: FacultyCount[]
  statusBreakdown: StatusCount[]
  joinsOverTime: JoinPeriod[]
  facultyTrends: FacultyTrend[]
  topActiveStudents: TopActiveStudent[]
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

  // --- Chart 4: per-faculty growth trend across recent semesters ---
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

  const topActiveStudents = await fetchTopActiveStudents()

  return { facultyCounts, statusBreakdown, joinsOverTime, facultyTrends, topActiveStudents }
}

interface CheckInEventSessionRow {
  student_id: string
  event_id: string
  session_id: string
}

interface EventSessionCountRow {
  id: string
  event_id: string
}

interface StudentNameRow {
  id: string
  first_name: string
  last_name: string
  faculty: string
}

// "Completed" an event means checked into every one of that event's sessions, not just one — a
// student who attends 1 of a 5-session bootcamp hasn't completed it the same way someone who shows
// up to a single-session hackathon has completed theirs. Comparing the count of an event's real
// sessions against the count of DISTINCT sessions a student has a check-in for (not their total
// check-in rows, which would double-count a student re-scanned at the same session) is what makes
// that distinction — a plain check-in count per student would wrongly rank someone who attended 3
// sessions of one event above someone who fully completed 2 different smaller events.
async function fetchTopActiveStudents(limit = 5): Promise<TopActiveStudent[]> {
  const [{ data: checkIns, error: checkInsError }, { data: sessions, error: sessionsError }, { data: students, error: studentsError }] =
    await Promise.all([
      supabase.from('check_ins').select('student_id, event_id, session_id'),
      supabase.from('sessions').select('id, event_id'),
      supabase.from('students').select('id, first_name, last_name, faculty'),
    ])
  if (checkInsError) throw checkInsError
  if (sessionsError) throw sessionsError
  if (studentsError) throw studentsError

  const totalSessionsByEvent = new Map<string, number>()
  for (const { event_id } of (sessions ?? []) as EventSessionCountRow[]) {
    totalSessionsByEvent.set(event_id, (totalSessionsByEvent.get(event_id) ?? 0) + 1)
  }

  const attendedSessionsByStudentEvent = new Map<string, Set<string>>()
  for (const row of (checkIns ?? []) as CheckInEventSessionRow[]) {
    const key = `${row.student_id}::${row.event_id}`
    const set = attendedSessionsByStudentEvent.get(key) ?? new Set<string>()
    set.add(row.session_id)
    attendedSessionsByStudentEvent.set(key, set)
  }

  const completedCountByStudent = new Map<string, number>()
  for (const [key, attendedSessions] of attendedSessionsByStudentEvent) {
    const [studentId, eventId] = key.split('::')
    const totalSessions = totalSessionsByEvent.get(eventId) ?? 0
    if (totalSessions > 0 && attendedSessions.size >= totalSessions) {
      completedCountByStudent.set(studentId, (completedCountByStudent.get(studentId) ?? 0) + 1)
    }
  }

  const studentById = new Map(((students ?? []) as StudentNameRow[]).map((s) => [s.id, s]))

  return [...completedCountByStudent.entries()]
    .map(([studentId, eventsCompleted]) => {
      const student = studentById.get(studentId)
      return {
        studentId,
        fullName: student ? `${student.first_name} ${student.last_name}`.trim() : 'Unknown student',
        faculty: student?.faculty ?? '',
        eventsCompleted,
      }
    })
    .sort((a, b) => b.eventsCompleted - a.eventsCompleted)
    .slice(0, limit)
}
