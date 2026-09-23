import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeftIcon } from '../../components/icons/NavIcons'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
import { STATUS_COLORS, type StudentStatus } from '../StudentDirectory/studentDirectoryData'
import {
  fetchStudentAnalytics,
  type FacultyCount,
  type FacultyStatusRow,
  type FacultyTrend,
  type FacultyTrendDirection,
  type JoinPeriod,
  type StatusCount,
  type StudentAnalytics,
} from './studentAnalyticsData'

const ACCENT_COLOR = '#0d9488'
const WARNING_COLOR = '#d1453d'
const HIGHLIGHT_COUNT = 2 // lowest N faculties flagged as underrepresented on the gap chart

const STATUS_ORDER: StudentStatus[] = ['Active', 'Alumni', 'Withdrawn']

const CARD_CLASSES = 'flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[641px]:p-5'

const EMPTY_STATE_CLASSES =
  'flex flex-col items-center gap-2 rounded-[18px] bg-white px-5 py-[60px] text-center text-sm text-[#7c8aa0] shadow-[0_2px_10px_rgba(15,40,74,0.05)]'

function CardHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="m-0 text-[15px] font-extrabold text-[#12284a]">{title}</h2>
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
    return <div className={EMPTY_STATE_CLASSES}>No students yet — this chart fills in once students are added.</div>
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

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
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
          {data.map((entry) => (
            <Cell key={entry.status} fill={STATUS_COLORS[entry.status].text} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, _name, item) => {
            const entry = (item as { payload: StatusCount }).payload
            return [`${value} (${entry.percent}%)`, entry.status]
          }}
        />
        <Legend verticalAlign="bottom" height={30} iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
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

function FacultyStatusChart({ data }: { data: FacultyStatusRow[] }) {
  if (data.length === 0) {
    return <div className={EMPTY_STATE_CLASSES}>No students yet.</div>
  }

  return (
    <ResponsiveContainer width="100%" height={360}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 70, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" vertical={false} />
        <XAxis
          dataKey="faculty"
          tickFormatter={shortFacultyLabel}
          tick={{ fontSize: 11.5, fill: '#33415c' }}
          axisLine={{ stroke: '#eef1f6' }}
          tickLine={false}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#7c8aa0' }} axisLine={{ stroke: '#eef1f6' }} tickLine={false} width={30} />
        <Tooltip cursor={{ fill: '#f7f9fc' }} />
        <Legend verticalAlign="top" height={32} iconType="circle" />
        {STATUS_ORDER.map((status, index) => (
          <Bar
            key={status}
            dataKey={status}
            stackId="status"
            fill={STATUS_COLORS[status].text}
            radius={index === STATUS_ORDER.length - 1 ? [4, 4, 0, 0] : undefined}
            maxBarSize={44}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
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
    <div className="box-border flex min-h-screen justify-center bg-[linear-gradient(180deg,#f4fdfc_0%,#f7f9fc_100%)] px-6 pt-14 pb-20 max-[701px]:px-4 max-[701px]:pt-9 max-[701px]:pb-15">
      <div className="flex w-full max-w-[1240px] flex-col gap-[22px]">
        <Link
          to="/students"
          className="inline-flex w-fit items-center gap-1 text-[13.5px] font-semibold text-[#7c8aa0] no-underline [transition:color_150ms_ease] hover:text-[#2f6fed]"
        >
          <ChevronLeftIcon size={16} />
          Back to Students
        </Link>

        <div>
          <h1 className="m-0 mb-1 text-[30px] font-extrabold text-[#12284a] max-[701px]:text-2xl">Student Analytics</h1>
          <p className="m-0 text-sm text-[#7c8aa0]">Faculty representation, status mix, and growth trends across the student body.</p>
        </div>

        {loading ? (
          <div className={EMPTY_STATE_CLASSES}>Loading analytics&hellip;</div>
        ) : error || !analytics ? (
          <div className={EMPTY_STATE_CLASSES}>Couldn&apos;t load analytics. Please try again.</div>
        ) : (
          <>
            <div className="grid grid-cols-[2fr_1fr] gap-[18px] max-[901px]:grid-cols-1">
              <div className={CARD_CLASSES}>
                <CardHeading
                  title="Students by faculty"
                  subtitle="Lowest enrollment first — the most underrepresented faculties are flagged in red."
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

            <div className={CARD_CLASSES}>
              <CardHeading title="Status mix by faculty" subtitle="Spot faculties with an unusually high withdrawal rate." />
              <FacultyStatusChart data={analytics.facultyStatusMatrix} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
