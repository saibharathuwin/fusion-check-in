import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { rowActivationProps } from '../../lib/rowActivation'
import { radioGroupKeyDown } from '../../lib/radioGroup'
import { DateRangePicker, type DateRange } from '../../components/DateRangePicker/DateRangePicker'
import { MiniStatCard } from '../../components/MiniStatCard/MiniStatCard'
import { Pill } from '../../components/Pill/Pill'
import {
  PlusIcon,
  SearchIcon,
  RefreshIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PinIcon,
  PencilIcon,
  TrashIcon,
} from '../../components/icons/NavIcons'
import {
  fetchEvents,
  formatCheckedInLabel,
  effectiveCapacity,
  canDeleteEvent,
  deleteDisabledReason,
  type EventItem,
  type EventStatus,
  type Semester,
} from './eventsData'
import { STATUS_COLORS, getEventTypeColor } from './pillColors'
import { DeleteEventDialog } from './DeleteEventDialog'
import { countAllStudents } from '../StudentDirectory/studentDirectoryData'

const REFRESH_INTERVAL_MS = 60_000

type StatusFilter = 'All' | EventStatus
type SemesterFilter = 'All' | Semester
type SortOrder = 'newest' | 'oldest'

const PAGE_SIZE = 10
const STATUS_TABS: StatusFilter[] = ['All', 'Upcoming', 'Active', 'Completed']

const FILTER_SELECT_CLASSES =
  'w-full rounded-[10px] border border-[#e2e6ee] bg-white px-3 py-[10px] text-[13.5px] font-semibold text-[#12284a] cursor-pointer [transition:border-color_150ms_ease] hover:border-[#c7d0e0] focus:border-[#2f6fed] focus:outline-none'

const RESET_BTN_CLASSES =
  'inline-flex items-center gap-[7px] self-end rounded-[10px] border border-[#dbe9fc] bg-[#eaf2fe] px-4 py-[10px] text-[13.5px] font-bold text-[#2f6fed] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#dbe9fc] h-[41px]'

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-[150px] flex-col gap-[7px] max-[701px]:min-w-full max-[901px]:min-w-[47%] max-[901px]:flex-1">
      <span className="text-[11px] font-bold tracking-[0.6px] text-[#9aa6ba] uppercase">{label}</span>
      {children}
    </div>
  )
}

function participantsPct(checkedIn: number, capacity: number) {
  if (capacity <= 0) return 0
  return Math.min(100, Math.round((checkedIn / capacity) * 100))
}

type PageItem = number | 'ellipsis-start' | 'ellipsis-end'

function getPageItems(current: number, total: number): PageItem[] {
  const siblingCount = 1
  const windowSize = siblingCount * 2 + 5 // first + last + current + siblings + both ellipses' worth of slack

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

export function Events() {
  const navigate = useNavigate()

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [eventType, setEventType] = useState('All')
  const [program, setProgram] = useState('All')
  const [location, setLocation] = useState('All')
  const [semester, setSemester] = useState<SemesterFilter>('All')
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null })
  const [search, setSearch] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [page, setPage] = useState(1)

  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<EventItem | null>(null)

  // The live student count, used as the effective capacity for Open-registration events — fetched
  // once for the whole list rather than per card.
  const [totalStudents, setTotalStudents] = useState<number | null>(null)
  useEffect(() => {
    countAllStudents().then(setTotalStudents)
  }, [])

  const load = useCallback(() => {
    // `loading` starts true and is only ever cleared here (once data arrives), never reset to
    // true again on refresh — the periodic refresh below should update statuses silently.
    fetchEvents().then((data) => {
      setEvents(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Automatic-mode events recompute their status on every fetch — this periodic refresh is what
  // flips Upcoming → Active → Completed on its own while the list sits open, with no cron needed.
  useEffect(() => {
    const interval = setInterval(load, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [load])

  const eventTypes = useMemo(() => Array.from(new Set(events.map((e) => e.eventType))).sort(), [events])
  const programs = useMemo(() => Array.from(new Set(events.map((e) => e.program))).sort(), [events])
  const locations = useMemo(() => Array.from(new Set(events.map((e) => e.location))).sort(), [events])

  const totalEvents = events.length
  const upcomingCount = events.filter((e) => e.status === 'Upcoming').length
  const activeCount = events.filter((e) => e.status === 'Active').length
  const completedCount = events.filter((e) => e.status === 'Completed').length

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return events.filter((e) => {
      if (statusFilter !== 'All' && e.status !== statusFilter) return false
      if (eventType !== 'All' && e.eventType !== eventType) return false
      if (program !== 'All' && e.program !== program) return false
      if (location !== 'All' && e.location !== location) return false
      if (semester !== 'All' && e.semester !== semester) return false
      if (dateRange.from && e.startDate < dateRange.from) return false
      if (dateRange.to && e.startDate > dateRange.to) return false
      if (query) {
        const haystack = `${e.program} ${e.eventType} ${e.location}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [events, statusFilter, eventType, program, location, semester, dateRange, search])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => (sortOrder === 'newest' ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate)))
    return copy
  }, [filtered, sortOrder])

  const filterKey = JSON.stringify({ statusFilter, eventType, program, location, semester, dateRange, search, sortOrder })
  const [lastFilterKey, setLastFilterKey] = useState(filterKey)
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey)
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const rangeStart = sorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = (currentPage - 1) * PAGE_SIZE + paged.length

  function handleReset() {
    setStatusFilter('All')
    setEventType('All')
    setProgram('All')
    setLocation('All')
    setSemester('All')
    setDateRange({ from: null, to: null })
    setSearch('')
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="m-0 text-[30px] font-extrabold text-[#12284a] max-[701px]:text-2xl">Events</h1>
        <button
          type="button"
          onClick={() => navigate('/events/new')}
          className="inline-flex items-center gap-2 rounded-xl border-none bg-[#12284a] px-5 py-3 text-sm font-bold text-white cursor-pointer [transition:background-color_150ms_ease,translate_150ms_ease] hover:-translate-y-px hover:bg-[#1a3865]"
        >
          <PlusIcon size={16} />
          Create event
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3.5 rounded-[18px] bg-white px-[22px] py-5 shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[901px]:gap-3">
        <FilterField label="Status">
          <select
            className={FILTER_SELECT_CLASSES}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            {STATUS_TABS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Event Type">
          <select className={FILTER_SELECT_CLASSES} value={eventType} onChange={(e) => setEventType(e.target.value)}>
            <option value="All">All</option>
            {eventTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Program">
          <select className={FILTER_SELECT_CLASSES} value={program} onChange={(e) => setProgram(e.target.value)}>
            <option value="All">All</option>
            {programs.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Location">
          <select className={FILTER_SELECT_CLASSES} value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="All">All</option>
            {locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Semester">
          <select
            className={FILTER_SELECT_CLASSES}
            value={semester}
            onChange={(e) => setSemester(e.target.value as SemesterFilter)}
          >
            <option value="All">All</option>
            <option value="Fall">Fall</option>
            <option value="Winter">Winter</option>
            <option value="Summer">Summer</option>
          </select>
        </FilterField>

        <FilterField label="Date Range">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </FilterField>

        <FilterField label="Search">
          <div className="flex min-w-[200px] items-center gap-2 rounded-[10px] border border-[#e2e6ee] bg-white px-3 py-[10px] text-[#7c8aa0] [transition:border-color_150ms_ease] focus-within:border-[#2f6fed]">
            <SearchIcon size={16} />
            <input
              type="text"
              aria-label="Search programs"
              placeholder="Search programs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 border-none text-[13.5px] text-[#12284a] outline-none"
            />
          </div>
        </FilterField>

        <button
          type="button"
          className={`${RESET_BTN_CLASSES} max-[701px]:ml-0 max-[701px]:w-full max-[701px]:justify-center max-[901px]:ml-auto`}
          onClick={handleReset}
        >
          <RefreshIcon size={15} />
          Reset
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-[18px] max-[701px]:gap-3">
        <MiniStatCard count={totalEvents} label="Total Events" theme="blue" />
        <MiniStatCard count={upcomingCount} label="Upcoming" theme="green" />
        <MiniStatCard count={activeCount} label="Active (Today)" theme="amber" />
        <MiniStatCard count={completedCount} label="Completed" theme="purple" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 max-[701px]:flex-col max-[701px]:items-stretch">
        <div role="radiogroup" aria-label="Filter by status" className="inline-flex gap-0.5 rounded-xl bg-[#eef1f6] p-1 max-[701px]:overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="radio"
              aria-checked={statusFilter === tab}
              tabIndex={statusFilter === tab ? 0 : -1}
              className={`rounded-[9px] border-none px-[18px] py-[9px] text-[13.5px] font-semibold cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] ${
                statusFilter === tab ? 'bg-[#12284a] text-white' : 'bg-transparent text-[#56617a] hover:text-[#12284a]'
              }`}
              onClick={() => setStatusFilter(tab)}
              onKeyDown={(e) => radioGroupKeyDown(e, (i) => setStatusFilter(STATUS_TABS[i]))}
            >
              {tab}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-[13px] font-semibold text-[#7c8aa0]">
          Sort by
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            className="rounded-[9px] border border-[#e2e6ee] px-[10px] py-2 text-[13.5px] font-semibold text-[#12284a] cursor-pointer"
          >
            <option value="newest">Date (Newest)</option>
            <option value="oldest">Date (Oldest)</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-4 rounded-[18px] bg-white px-5 py-[60px] text-center text-sm text-[#7c8aa0] shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
          Loading events&hellip;
        </div>
      ) : paged.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-[18px] bg-white px-5 py-[60px] text-center text-sm text-[#7c8aa0] shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
          {events.length === 0 ? (
            <>
              <p className="m-0">No events yet.</p>
              <button
                type="button"
                className="inline-flex items-center gap-[7px] rounded-[10px] border-none bg-[linear-gradient(120deg,#0d9488,#14b8a6)] px-5 py-2.5 text-[13.5px] font-bold text-white cursor-pointer [transition:transform_150ms_ease] hover:-translate-y-0.5"
                onClick={() => navigate('/events/new')}
              >
                <PlusIcon size={14} />
                Create your first event
              </button>
            </>
          ) : (
            <>
              <p className="m-0">No events match your filters.</p>
              <button
                type="button"
                className="inline-flex items-center gap-[7px] rounded-[10px] border border-[#dbe9fc] bg-[#eaf2fe] px-[18px] py-[10px] text-[13.5px] font-bold text-[#2f6fed] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#dbe9fc]"
                onClick={handleReset}
              >
                <RefreshIcon size={15} />
                Reset filters
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[18px] bg-white shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[701px]:hidden">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                    Program
                  </th>
                  <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                    Event Type
                  </th>
                  <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                    Date &amp; Time
                  </th>
                  <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                    Location
                  </th>
                  <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                    Participants
                  </th>
                  <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                    Status
                  </th>
                  <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paged.map((event, index) => {
                  const typeColor = getEventTypeColor(event.eventType)
                  const statusColor = STATUS_COLORS[event.status]
                  const barCapacity = effectiveCapacity(event, totalStudents)
                  const pct = participantsPct(event.checkedIn, barCapacity ?? 0)
                  const deletable = canDeleteEvent(event)
                  const cellBorder = index === paged.length - 1 ? '' : 'border-b border-[#f2f4f8]'
                  return (
                    <tr
                      key={event.id}
                      onClick={() => navigate(`/events/${event.id}`)}
                      {...rowActivationProps(() => navigate(`/events/${event.id}`))}
                      className="cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f7f9fc] focus-visible:bg-[#f7f9fc] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0d9488]"
                    >
                      <td className={`px-[22px] py-4 align-middle text-[13.5px] font-bold text-[#12284a] ${cellBorder}`}>
                        {event.program}
                      </td>
                      <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>
                        <Pill bg={typeColor.bg} text={typeColor.text}>
                          {event.eventType}
                        </Pill>
                      </td>
                      <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>
                        <div className="font-semibold text-[#12284a]">{event.dateLabel}</div>
                        <div className="mt-0.5 text-[12.5px] text-[#9aa6ba]">{event.timeLabel}</div>
                      </td>
                      <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>
                        {event.location}
                      </td>
                      <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>
                        <div className="flex min-w-[110px] flex-col gap-1.5">
                          <span className="text-[13px] font-bold text-[#12284a]">
                            {barCapacity !== null ? `${event.checkedIn} / ${barCapacity}` : event.checkedIn}
                          </span>
                          {barCapacity !== null && (
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#eef1f6]">
                              <div className="h-full rounded-full bg-[#2f6fed]" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>
                        <Pill bg={statusColor.bg} text={statusColor.text}>
                          {event.status}
                        </Pill>
                      </td>
                      <td className={`px-[22px] py-4 align-middle ${cellBorder}`}>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/events/${event.id}/edit`)
                            }}
                            aria-label={`Edit ${event.program}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] border border-[#e2e6ee] bg-white text-[#7c8aa0] cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] hover:bg-[#f2f5fa] hover:text-[#12284a]"
                          >
                            <PencilIcon size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (deletable) setDeleteTarget(event)
                            }}
                            disabled={!deletable}
                            aria-label={`Delete ${event.program}`}
                            title={!deletable ? deleteDisabledReason(event) : undefined}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-[9px] border [transition:background-color_150ms_ease,color_150ms_ease,opacity_150ms_ease] ${
                              deletable
                                ? 'cursor-pointer border-[#e2e6ee] bg-white text-[#7c8aa0] hover:bg-[#fde8e8] hover:text-[#d1453d]'
                                : 'cursor-not-allowed border-[#e2e6ee] bg-white text-[#c3ccdb] opacity-70'
                            }`}
                          >
                            <TrashIcon size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="hidden flex-col gap-3 max-[701px]:flex">
            {paged.map((event) => {
              const typeColor = getEventTypeColor(event.eventType)
              const statusColor = STATUS_COLORS[event.status]
              const barCapacity = effectiveCapacity(event, totalStudents)
              const pct = participantsPct(event.checkedIn, barCapacity ?? 0)
              const deletable = canDeleteEvent(event)
              return (
                <div
                  key={event.id}
                  onClick={() => navigate(`/events/${event.id}`)}
                  {...rowActivationProps(() => navigate(`/events/${event.id}`))}
                  className="flex cursor-pointer flex-col gap-2.5 rounded-2xl bg-white p-[18px] shadow-[0_2px_10px_rgba(15,40,74,0.05)] [transition:translate_150ms_ease,box-shadow_150ms_ease] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(15,40,74,0.09)] focus-visible:outline-2 focus-visible:outline-[#0d9488]"
                >
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="text-[15px] font-bold text-[#12284a]">{event.program}</span>
                    <Pill bg={statusColor.bg} text={statusColor.text}>
                      {event.status}
                    </Pill>
                  </div>
                  <Pill bg={typeColor.bg} text={typeColor.text}>
                    {event.eventType}
                  </Pill>
                  <div className="flex items-center gap-1.5 text-[13px] text-[#56617a]">
                    {event.dateLabel} &middot; {event.timeLabel}
                  </div>
                  <div className="flex items-center gap-1.5 text-[13px] text-[#56617a]">
                    <PinIcon size={14} />
                    {event.location}
                  </div>
                  <div className="flex min-w-[110px] flex-col gap-1.5">
                    <span className="text-[13px] font-bold text-[#12284a]">{formatCheckedInLabel(event, totalStudents)}</span>
                    {barCapacity !== null && (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#eef1f6]">
                        <div className="h-full rounded-full bg-[#2f6fed]" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 border-t border-[#f2f4f8] pt-2.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/events/${event.id}/edit`)
                      }}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border border-[#e2e6ee] bg-white px-3 py-2 text-[12.5px] font-bold text-[#56617a] cursor-pointer"
                    >
                      <PencilIcon size={13} />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (deletable) setDeleteTarget(event)
                      }}
                      disabled={!deletable}
                      title={!deletable ? deleteDisabledReason(event) : undefined}
                      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border px-3 py-2 text-[12.5px] font-bold ${
                        deletable
                          ? 'cursor-pointer border-[#f8c9c9] bg-white text-[#d1453d]'
                          : 'cursor-not-allowed border-[#e2e6ee] bg-white text-[#c3ccdb] opacity-70'
                      }`}
                    >
                      <TrashIcon size={13} />
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#7c8aa0] max-[701px]:justify-center max-[701px]:text-center">
            <span>
              Showing {rangeStart}–{rangeEnd} of {sorted.length}
            </span>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
                className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-[#e2e6ee] bg-white text-[#12284a] cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] hover:not-disabled:bg-[#f2f5fa] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeftIcon size={16} />
              </button>

              {getPageItems(currentPage, totalPages).map((item, index) =>
                typeof item === 'number' ? (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPage(item)}
                    aria-current={item === currentPage ? 'page' : undefined}
                    aria-label={`Page ${item}`}
                    className={`inline-flex h-[34px] min-w-[34px] items-center justify-center rounded-[9px] border px-1.5 text-[13px] font-semibold cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] ${
                      item === currentPage
                        ? 'border-[#12284a] bg-[#12284a] font-bold text-white hover:bg-[#12284a]'
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
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
                className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-[#e2e6ee] bg-white text-[#12284a] cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] hover:not-disabled:bg-[#f2f5fa] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRightIcon size={16} />
              </button>
            </div>
          </div>
        </>
      )}

      <DeleteEventDialog
        event={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(id) => setEvents((prev) => prev.filter((e) => e.id !== id))}
      />
    </div>
  )
}
