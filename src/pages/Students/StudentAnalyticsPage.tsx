import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type PieLabelRenderProps,
} from 'recharts'
import { STATUS_COLORS } from '../StudentDirectory/studentDirectoryData'
import {
  fetchStudentAnalytics,
  type FacultyCount,
  type FacultyTrend,
  type FacultyTrendDirection,
  type JoinPeriod,
  type StatusCount,
  type StudentAnalytics,
  type TopActiveStudent,
} from './studentAnalyticsData'

const ACCENT_COLOR = '#0d9488'
const WARNING_COLOR = '#d1453d'
const HIGHLIGHT_COUNT = 2 // lowest N faculties flagged as underrepresented on the gap chart

const CARD_CLASSES = 'flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[641px]:p-5'

const EMPTY_STATE_CLASSES =
  'flex flex-col items-center gap-2 rounded-[18px] bg-white px-5 py-[60px] text-center text-sm text-[#7c8aa0] shadow-[0_2px_10px_rgba(15,40,74,0.05)]'

function CardHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="m-0 text-[15px] font-extrabold text-[#1d1d1f]">{title}</h2>
      <p className="m-0 mt-0.5 text-[12.5px] text-[#7c8aa0]">{subtitle}</p>
    </div>
  )
}

// Long official faculty names (e.g. "Schulich School of Medicine and Dentistry – Windsor Campus")
// blow out chart axes — shorten for on-chart labels, keep the full name available for tooltips.
function shortFacultyLabel(faculty: string): string {
  const stripped = faculty.replace(/^Faculty of /, '')
  return stripped.length > 26 ? `${stripped.slice(0, 24)}…` : stripped
}

function TrendArrow({ direction }: { direction: FacultyTrendDirection }) {
  if (direction === 'up') {
    return (
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    )
  }
  if (direction === 'down') {
    return (
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12l7 7 7-7" />
      </svg>
    )
  }
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
    </svg>
  )
}

const TREND_META: Record<FacultyTrendDirection, { label: string; classes: string }> = {
  up: { label: 'Growing', classes: 'bg-[#e1f8ec] text-[#159a56]' },
  down: { label: 'Declining', classes: 'bg-[#fde8e8] text-[#d1453d]' },
  flat: { label: 'Flat', classes: 'bg-[#eef1f6] text-[#7c8aa0]' },
  new: { label: 'New data', classes: 'bg-[#eaf2fe] text-[#2f6fed]' },
}

function FacultyGapChart({ data }: { data: FacultyCount[] }) {
  if (data.length === 0) {
    return <div className={EMPTY_STATE_CLASSES}>No students yet. This chart fills in once students are added.</div>
  }

  const chartHeight = Math.max(260, data.length * 46)

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#7c8aa0' }} axisLine={{ stroke: '#eef1f6' }} tickLine={false} />
        <YAxis
          type="category"
          dataKey="faculty"
          tickFormatter={shortFacultyLabel}
          width={190}
          tick={{ fontSize: 12, fill: '#33415c' }}
          axisLine={{ stroke: '#eef1f6' }}
          tickLine={false}
        />
        <Tooltip cursor={{ fill: '#f7f9fc' }} formatter={(value) => [`${value} student${value === 1 ? '' : 's'}`, 'Enrolled']} />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={26}>
          {data.map((entry, index) => (
            <Cell key={entry.faculty} fill={index < HIGHLIGHT_COUNT ? WARNING_COLOR : ACCENT_COLOR} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function FacultyTrendList({ trends }: { trends: FacultyTrend[] }) {
  if (trends.length === 0) {
    return <div className={EMPTY_STATE_CLASSES}>No trend data yet.</div>
  }

  return (
    <div className="flex flex-col divide-y divide-[#f2f4f8]">
      {trends.map((trend) => {
        const meta = TREND_META[trend.direction]
        const last = trend.history[trend.history.length - 1]
        const prev = trend.history[trend.history.length - 2]
        return (
          <div key={trend.faculty} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-bold text-[#12284a]" title={trend.faculty}>
                {shortFacultyLabel(trend.faculty)}
              </span>
              <span className="text-[11.5px] text-[#9aa6ba]">
                {prev ? `${prev.count} → ${last.count} joins` : last ? `${last.count} join${last.count === 1 ? '' : 's'} so far` : 'No joins yet'}
              </span>
            </div>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ${meta.classes}`}>
              <TrendArrow direction={trend.direction} />
              {meta.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function StatusDonutChart({ data }: { data: StatusCount[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0)
  if (total === 0) {
    return <div className={EMPTY_STATE_CLASSES}>No students yet.</div>
  }

  // A 0-count status is a 0-degree slice — Recharts still places its label/leader-line at that
  // single point on the circle, so two or more zero statuses stack their labels right on top of
  // each other (illegible, as seen with Alumni/Withdrawn both at 0%). Dropping zero-count entries
  // from what's actually drawn removes those invisible slices and their labels entirely; the
  // Legend below is given the full, unfiltered list separately so Active/Alumni/Withdrawn still
  // all show there even when one of them is 0.
  const nonZero = data.filter((entry) => entry.count > 0)

  return (
    <div>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={nonZero}
            dataKey="count"
            nameKey="status"
            innerRadius={70}
            outerRadius={100}
            paddingAngle={2}
            label={(props: PieLabelRenderProps) => {
              const entry = props.payload as StatusCount
              return `${entry.status}: ${entry.count} (${entry.percent}%)`
            }}
            labelLine={{ stroke: '#c7d0e0' }}
          >
            {nonZero.map((entry) => (
              <Cell key={entry.status} fill={STATUS_COLORS[entry.status].text} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, _name, item) => {
              const entry = (item as { payload: StatusCount }).payload
              return [`${value} (${entry.percent}%)`, entry.status]
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Built by hand, from the full (unfiltered) status list — rather than Recharts' own <Legend>,
          whose built-in payload always mirrors whatever was actually drawn in the chart above. Since
          zero-count statuses are deliberately left out of the chart itself (see nonZero above), using
          the built-in Legend would silently drop Alumni/Withdrawn from here too whenever one is 0. */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
        {data.map((entry) => (
          <div key={entry.status} className="flex items-center gap-1.5 text-[13px] text-[#33415c]">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[entry.status].text }}
            />
            {entry.status}
          </div>
        ))}
      </div>
    </div>
  )
}

function JoinsLineChart({ data }: { data: JoinPeriod[] }) {
  if (data.length === 0) {
    return <div className={EMPTY_STATE_CLASSES}>No join dates recorded yet.</div>
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#7c8aa0' }} axisLine={{ stroke: '#eef1f6' }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#7c8aa0' }} axisLine={{ stroke: '#eef1f6' }} tickLine={false} width={30} />
        <Tooltip formatter={(value) => [`${value} new student${value === 1 ? '' : 's'}`, 'Joined']} />
        <Line type="monotone" dataKey="count" stroke={ACCENT_COLOR} strokeWidth={2.5} dot={{ r: 4, fill: ACCENT_COLOR }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// Gold / silver / bronze for the top 3, a neutral tone for the rest — the "championship" framing
// only really reads for a podium of three; beyond that a plain rank number is clearer than reusing
// bronze (or inventing a 4th/5th color with no real-world medal meaning).
const RANK_COLORS = ['#f4b400', '#9aa6ba', '#c97a3d'] as const
const RANK_DEFAULT_COLOR = '#7c8aa0'

function TopActiveStudentsLeaderboard({ data }: { data: TopActiveStudent[] }) {
  if (data.length === 0) {
    return (
      <div className={EMPTY_STATE_CLASSES}>No completed events yet. This fills in once students finish checking into every session of an event.</div>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-[#f2f4f8]">
      {data.map((student, index) => (
        <div key={student.studentId} className="flex items-center gap-3.5 py-3 first:pt-0 last:pb-0">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white"
            style={{ backgroundColor: RANK_COLORS[index] ?? RANK_DEFAULT_COLOR }}
          >
            {index + 1}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13.5px] font-bold text-[#12284a]">{student.fullName}</span>
            <span className="truncate text-[11.5px] text-[#9aa6ba]" title={student.faculty}>
              {shortFacultyLabel(student.faculty)}
            </span>
          </div>
          <span className="shrink-0 rounded-full bg-[#eaf2fe] px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap text-[#2f6fed]">
            {student.eventsCompleted} event{student.eventsCompleted === 1 ? '' : 's'} completed
          </span>
        </div>
      ))}
    </div>
  )
}

export function StudentAnalyticsPage() {
  const [analytics, setAnalytics] = useState<StudentAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetchStudentAnalytics()
      .then((result) => {
        setAnalytics(result)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-[22px]">
      <div>
          <p className="m-0 text-sm text-[#7c8aa0]">Faculty representation, status mix, and growth trends across the student body.</p>
        </div>

        {loading ? (
          <div className={EMPTY_STATE_CLASSES}>Loading analytics&hellip;</div>
        ) : error || !analytics ? (
          <div className={EMPTY_STATE_CLASSES}>Couldn&apos;t load analytics. Please try again.</div>
        ) : (
          <>
            <div className={CARD_CLASSES}>
              <CardHeading
                title="Top 5 most active students"
                subtitle="Ranked by events fully completed: every session of an event attended, not just one."
              />
              <TopActiveStudentsLeaderboard data={analytics.topActiveStudents} />
            </div>

            <div className="grid grid-cols-[2fr_1fr] gap-[18px] max-[901px]:grid-cols-1">
              <div className={CARD_CLASSES}>
                <CardHeading
                  title="Students by faculty"
                  subtitle="Lowest enrollment first. The most underrepresented faculties are flagged in red."
                />
                <FacultyGapChart data={analytics.facultyCounts} />
              </div>

              <div className={CARD_CLASSES}>
                <CardHeading title="Faculty growth trend" subtitle="Change in new joins across recent semesters." />
                <FacultyTrendList trends={analytics.facultyTrends} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-[18px] max-[901px]:grid-cols-1">
              <div className={CARD_CLASSES}>
                <CardHeading title="Status breakdown" subtitle="Active, alumni, and withdrawn students." />
                <StatusDonutChart data={analytics.statusBreakdown} />
              </div>

              <div className={CARD_CLASSES}>
                <CardHeading title="New students over time" subtitle="Joins per month across the student body." />
                <JoinsLineChart data={analytics.joinsOverTime} />
              </div>
            </div>
          </>
        )}
    </div>
  )
}
