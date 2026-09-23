import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { Pill } from '../../components/Pill/Pill'
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, PinIcon, ChartIcon, PencilIcon, TrashIcon } from '../../components/icons/NavIcons'
import { STATUS_COLORS, getEventTypeColor } from '../Events/pillColors'
import { DeleteEventDialog } from '../Events/DeleteEventDialog'
import { formatCheckedInLabel, canDeleteEvent, deleteDisabledReason, type EventItem } from '../Events/eventsData'
import { countAllStudents } from '../StudentDirectory/studentDirectoryData'
import type { EventDetailContext } from './EventDetailLayout'

const CARD_ENABLED =
  'flex items-center gap-4 rounded-[18px] bg-white px-6 py-[22px] text-inherit no-underline shadow-[0_2px_10px_rgba(15,40,74,0.05)] [transition:translate_150ms_ease,box-shadow_150ms_ease] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,40,74,0.1)]'

const CARD_ICON_BASE = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full'

function analysisSubtitle(event: EventDetailContext['event'], totalStudents: number | null): string {
  if (event.status === 'Upcoming') {
    return event.capacity > 0 ? `Capacity: ${event.capacity}` : 'Open registration'
  }
  if (event.status === 'Active') {
    return formatCheckedInLabel(event, totalStudents)
  }
  return event.capacity > 0 ? `${Math.round((event.checkedIn / event.capacity) * 100)}% attendance` : `${event.checkedIn} attended`
}

export function EventOverview() {
  const { event } = useOutletContext<EventDetailContext>()
  const navigate = useNavigate()
  const typeColor = getEventTypeColor(event.eventType)
  const statusColor = STATUS_COLORS[event.status]
  const [deleteTarget, setDeleteTarget] = useState<EventItem | null>(null)
  const deletable = canDeleteEvent(event)

  // The live student count, used as the effective capacity for an Open-registration event in
  // place of a hardcoded number or an "∞" placeholder.
  const [totalStudents, setTotalStudents] = useState<number | null>(null)
  useEffect(() => {
    countAllStudents().then(setTotalStudents)
  }, [])

  return (
    <div className="flex flex-col gap-[22px]">
      <Link
        to="/events/all"
        className="inline-flex w-fit items-center gap-1 text-[13.5px] font-semibold text-[#7c8aa0] no-underline [transition:color_150ms_ease] hover:text-[#2f6fed]"
      >
        <ChevronLeftIcon size={16} />
        Back to Events
      </Link>

      <div className="flex flex-col gap-4 rounded-[20px] bg-white px-8 py-7 shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[701px]:rounded-2xl max-[701px]:px-5 max-[701px]:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3.5">
          <div className="flex flex-wrap items-center gap-3.5">
            <h1 className="m-0 text-[26px] font-extrabold text-[#12284a] max-[701px]:text-[22px]">{event.program}</h1>
            <Pill bg={statusColor.bg} text={statusColor.text}>
              {event.status}
            </Pill>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate(`/events/${event.id}/edit`)}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e2e6ee] bg-white px-4 py-2.5 text-[13px] font-bold text-[#56617a] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f2f5fa]"
            >
              <PencilIcon size={14} />
              Edit
            </button>
            <button
              type="button"
              onClick={() => deletable && setDeleteTarget(event)}
              disabled={!deletable}
              title={!deletable ? deleteDisabledReason(event) : undefined}
              className={`inline-flex items-center gap-1.5 rounded-[10px] border px-4 py-2.5 text-[13px] font-bold [transition:background-color_150ms_ease,opacity_150ms_ease] ${
                deletable
                  ? 'cursor-pointer border-[#f8c9c9] bg-white text-[#d1453d] hover:bg-[#fde8e8]'
                  : 'cursor-not-allowed border-[#e2e6ee] bg-white text-[#c3ccdb] opacity-70'
              }`}
            >
              <TrashIcon size={14} />
              Delete
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-5 max-[701px]:gap-3">
          <Pill bg={typeColor.bg} text={typeColor.text}>
            {event.eventType}
          </Pill>
          <span className="inline-flex items-center gap-1.5 text-[13.5px] text-[#56617a]">
            <span className="shrink-0 text-[#9aa6ba]">
              <CalendarIcon size={15} />
            </span>
            {event.dateLabel} &middot; {event.timeLabel}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[13.5px] text-[#56617a]">
            <span className="shrink-0 text-[#9aa6ba]">
              <PinIcon size={15} />
            </span>
            {event.location}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[13.5px] text-[#56617a]">
            {formatCheckedInLabel(event, totalStudents)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[18px]">
        <Link to={`/events/${event.id}/analysis`} target="_blank" rel="noopener noreferrer" className={CARD_ENABLED}>
          <div className={`${CARD_ICON_BASE} bg-[#eef1f6] text-[#56617a]`}>
            <ChartIcon size={20} />
          </div>
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold text-[#12284a]">Analysis</span>
            <span className="text-[13px] text-[#7c8aa0]">{analysisSubtitle(event, totalStudents)}</span>
          </div>
          <span className="shrink-0 text-[#9aa6ba]">
            <ChevronRightIcon size={18} />
          </span>
        </Link>
      </div>

      <DeleteEventDialog event={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={() => navigate('/events/all')} />
    </div>
  )
}
