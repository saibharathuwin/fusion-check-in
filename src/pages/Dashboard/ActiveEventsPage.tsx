import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeftIcon, CalendarIcon, PinIcon } from '../../components/icons/NavIcons'
import { Pill } from '../../components/Pill/Pill'
import { STATUS_COLORS, getEventTypeColor } from '../Events/pillColors'
import { fetchEvents, formatCheckedInLabel, type EventItem } from '../Events/eventsData'
import { countAllStudents } from '../StudentDirectory/studentDirectoryData'

const EMPTY_STATE_CLASSES =
  'flex flex-col items-center gap-2 rounded-[18px] bg-white px-5 py-[60px] text-center shadow-[0_2px_10px_rgba(15,40,74,0.05)]'

// The Dashboard's "Active Events" stat card links here — a simple, unfiltered view of just the
// events currently running, without Events.tsx's full filter bar/pagination.
export function ActiveEventsPage() {
  const [events, setEvents] = useState<EventItem[] | null>(null)
  // The live student count, used as the effective capacity for Open-registration events.
  const [totalStudents, setTotalStudents] = useState<number | null>(null)

  useEffect(() => {
    fetchEvents().then((all) => setEvents(all.filter((e) => e.status === 'Active')))
    countAllStudents().then(setTotalStudents)
  }, [])

  return (
    <div className="flex flex-col gap-[22px]">
      <Link
        to="/"
        className="inline-flex w-fit items-center gap-1 text-[13.5px] font-semibold text-[#7c8aa0] no-underline [transition:color_150ms_ease] hover:text-[#2f6fed]"
      >
        <ChevronLeftIcon size={16} />
        Back to Dashboard
      </Link>

      <h1 className="m-0 text-[26px] font-extrabold text-[#12284a] max-[701px]:text-[22px]">Active Events</h1>

      {events === null ? (
        <div className={EMPTY_STATE_CLASSES}>
          <p className="m-0 text-sm text-[#7c8aa0]">Loading&hellip;</p>
        </div>
      ) : events.length === 0 ? (
        <div className={EMPTY_STATE_CLASSES}>
          <p className="m-0 text-sm text-[#7c8aa0]">There are no current events</p>
          <Link
            to="/events/new"
            className="mt-1 inline-flex items-center gap-1.5 rounded-[10px] border-none bg-[linear-gradient(120deg,#0d9488,#14b8a6)] px-5 py-2.5 text-[13.5px] font-bold text-white no-underline cursor-pointer [transition:transform_150ms_ease] hover:-translate-y-0.5"
          >
            + Create event
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((event) => {
            const typeColor = getEventTypeColor(event.eventType)
            const statusColor = STATUS_COLORS[event.status]
            return (
              <Link
                key={event.id}
                to={`/events/${event.id}`}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-2xl bg-white px-6 py-5 text-inherit no-underline shadow-[0_2px_10px_rgba(15,40,74,0.05)] [transition:translate_150ms_ease,box-shadow_150ms_ease] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(15,40,74,0.09)]"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[15px] font-bold text-[#12284a]">{event.program}</span>
                    <Pill bg={statusColor.bg} text={statusColor.text}>
                      {event.status}
                    </Pill>
                    <Pill bg={typeColor.bg} text={typeColor.text}>
                      {event.eventType}
                    </Pill>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-[13px] text-[#56617a]">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarIcon size={14} />
                      {event.dateLabel} &middot; {event.timeLabel}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <PinIcon size={14} />
                      {event.location}
                    </span>
                  </div>
                </div>
                <span className="text-[13px] font-semibold whitespace-nowrap text-[#56617a]">{formatCheckedInLabel(event, totalStudents)}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
