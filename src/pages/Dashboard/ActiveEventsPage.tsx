import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarIcon, PinIcon } from '../../components/icons/NavIcons'
import { Pill } from '../../components/Pill/Pill'
import { STATUS_COLORS, getEventTypeColor } from '../Events/pillColors'
import { fetchEvents, type EventItem } from '../Events/eventsData'

const EMPTY_STATE_CLASSES =
  'flex flex-col items-center gap-2 rounded-[18px] bg-white px-5 py-[60px] text-center shadow-[0_2px_10px_rgba(15,40,74,0.05)]'

// The Dashboard's "Active Events" stat card links here — a simple, unfiltered view of just the
// events currently running, without Events.tsx's full filter bar/pagination.
export function ActiveEventsPage() {
  const [events, setEvents] = useState<EventItem[] | null>(null)

  useEffect(() => {
    fetchEvents().then((all) => setEvents(all.filter((e) => e.status === 'Active')))
  }, [])

  return (
    <div className="flex flex-col gap-[22px]">
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,280px))] gap-4">
          {events.map((event) => {
            const typeColor = getEventTypeColor(event.eventType)
            const statusColor = STATUS_COLORS[event.status]
            return (
              <Link
                key={event.id}
                to={`/events/${event.id}`}
                className="flex flex-col gap-3 rounded-[20px] bg-white p-5 text-inherit no-underline shadow-[0_2px_10px_rgba(15,40,74,0.05)] [transition:translate_200ms_cubic-bezier(0.25,0.1,0.25,1),box-shadow_200ms_cubic-bezier(0.25,0.1,0.25,1)] hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(15,40,74,0.1)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Pill bg={statusColor.bg} text={statusColor.text}>
                    {event.status}
                  </Pill>
                  <Pill bg={typeColor.bg} text={typeColor.text}>
                    {event.eventType}
                  </Pill>
                </div>

                <span className="line-clamp-2 text-[16px] font-bold text-[#12284a]">{event.program}</span>

                <div className="flex flex-col gap-1.5 text-[13px] text-[#56617a]">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarIcon size={14} />
                    {event.dateLabel} &middot; {event.timeLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <PinIcon size={14} />
                    <span className="truncate">{event.location}</span>
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
