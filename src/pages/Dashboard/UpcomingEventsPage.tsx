import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, ClockIcon, PlusIcon } from '../../components/icons/NavIcons'
import { Pill } from '../../components/Pill/Pill'
import { fetchEvents, type EventItem } from '../Events/eventsData'

const EMPTY_STATE_CLASSES =
  'flex flex-col items-center gap-2 rounded-[18px] bg-white px-5 py-16 text-center shadow-[0_2px_10px_rgba(15,40,74,0.05)]'

// "Today" / "Tomorrow" / "In 3 days" for anything happening soon — a nice-to-have glance, not
// shown for anything further out since the date label already covers that.
function relativeDayLabel(startDate: string): string | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${startDate}T00:00:00`)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`
  return null
}

// The Dashboard's "Upcoming Events" stat card links here — deliberately just name/date/time per
// spec, not the full Events.tsx table with its filters, types, and pagination.
export function UpcomingEventsPage() {
  const [events, setEvents] = useState<EventItem[] | null>(null)

  useEffect(() => {
    fetchEvents().then((all) => setEvents(all.filter((e) => e.status === 'Upcoming')))
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

      <div>
        <h1 className="m-0 mb-1 text-[26px] font-extrabold text-[#12284a] max-[701px]:text-[22px]">Upcoming Events</h1>
        <p className="m-0 text-sm text-[#7c8aa0]">
          {events === null
            ? 'Loading your calendar…'
            : events.length === 0
              ? 'Nothing scheduled yet.'
              : `${events.length} event${events.length === 1 ? '' : 's'} on the calendar`}
        </p>
      </div>

      {events === null ? (
        <div className={EMPTY_STATE_CLASSES}>
          <p className="m-0 text-sm text-[#7c8aa0]">Loading&hellip;</p>
        </div>
      ) : events.length === 0 ? (
        <div className={EMPTY_STATE_CLASSES}>
          <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-[#eaf2fe] text-[#2f6fed]">
            <CalendarIcon size={26} />
          </div>
          <p className="m-0 mt-2 text-[15px] font-bold text-[#12284a]">No upcoming events</p>
          <p className="m-0 text-sm text-[#7c8aa0]">New events will show up here as soon as they&apos;re scheduled.</p>
          <Link
            to="/events/new"
            className="mt-2 inline-flex items-center gap-1.5 rounded-[10px] border-none bg-[linear-gradient(120deg,#0d9488,#14b8a6)] px-5 py-2.5 text-[13.5px] font-bold text-white no-underline cursor-pointer [transition:transform_150ms_ease] hover:-translate-y-0.5"
          >
            <PlusIcon size={14} />
            Create event
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((event) => {
            const relative = relativeDayLabel(event.startDate)
            return (
              <Link
                key={event.id}
                to={`/events/${event.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl bg-white px-6 py-5 text-inherit no-underline shadow-[0_2px_10px_rgba(15,40,74,0.05)] [transition:translate_150ms_ease,box-shadow_150ms_ease] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,40,74,0.1)] max-[560px]:flex-col max-[560px]:items-stretch max-[560px]:gap-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#eaf2fe] text-[#2f6fed]">
                    <CalendarIcon size={20} />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-[15.5px] font-bold text-[#12284a]">{event.program}</span>
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-[#7c8aa0]">
                      <ClockIcon size={13} />
                      {event.dateLabel} &middot; {event.timeLabel}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5 max-[560px]:justify-between max-[560px]:pl-16">
                  {relative && (
                    <Pill bg="#eaf2fe" text="#2f6fed">
                      {relative}
                    </Pill>
                  )}
                  <span className="shrink-0 text-[#9aa6ba]">
                    <ChevronRightIcon size={18} />
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
