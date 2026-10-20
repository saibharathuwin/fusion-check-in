import { useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { Pill } from '../../components/Pill/Pill'
import { ChevronLeftIcon, CalendarIcon, PinIcon, ChartIcon, PeopleIcon, DownloadIcon, PencilIcon, TrashIcon } from '../../components/icons/NavIcons'
import { STATUS_COLORS, getEventTypeColor } from '../Events/pillColors'
import { DeleteEventDialog } from '../Events/DeleteEventDialog'
import { canDeleteEvent, deleteDisabledReason, type EventItem } from '../Events/eventsData'
import type { EventDetailContext } from './EventDetailLayout'
import { openInNewTabWithSession } from '../../lib/newTabSession'
import { downloadAllPasses, downloadBlob, zipFileName } from './downloadAllPasses'

const CARD_ENABLED =
  'flex flex-col gap-3 rounded-[20px] bg-white p-5 text-inherit no-underline shadow-[0_2px_10px_rgba(15,40,74,0.05)] [transition:translate_200ms_cubic-bezier(0.25,0.1,0.25,1),box-shadow_200ms_cubic-bezier(0.25,0.1,0.25,1)] hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(15,40,74,0.1)]'

const CARD_ICON_BASE = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full'

export function EventOverview() {
  const { event } = useOutletContext<EventDetailContext>()
  const navigate = useNavigate()
  const typeColor = getEventTypeColor(event.eventType)
  const statusColor = STATUS_COLORS[event.status]
  const [deleteTarget, setDeleteTarget] = useState<EventItem | null>(null)
  const deletable = canDeleteEvent(event)

  const [passProgress, setPassProgress] = useState<{ done: number; total: number } | null>(null)
  const [passMessage, setPassMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const downloadingPasses = passProgress !== null

  async function handleDownloadAllPasses() {
    setPassMessage(null)
    setPassProgress({ done: 0, total: 0 })
    try {
      const result = await downloadAllPasses(event.id, (done, total) => setPassProgress({ done, total }))
      downloadBlob(result.zipBlob, zipFileName(event.program))
      const issuedNote = result.issuedCount > 0 ? ` (issued ${result.issuedCount} new pass${result.issuedCount === 1 ? '' : 'es'})` : ''
      if (result.skipped.length > 0) {
        setPassMessage({
          text: `Downloaded ${result.includedCount} of ${result.totalCount} passes${issuedNote}. Skipped: ${result.skipped.map((s) => s.name).join(', ')}.`,
          isError: false,
        })
      } else {
        setPassMessage({ text: `Downloaded all ${result.includedCount} passes${issuedNote}.`, isError: false })
      }
    } catch {
      setPassMessage({ text: "Couldn't build the ZIP file. Please try again.", isError: true })
    } finally {
      setPassProgress(null)
    }
  }


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
            <h1 className="m-0 text-[26px] font-extrabold text-[#1d1d1f] max-[701px]:text-[22px]">{event.program}</h1>
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
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,280px))] gap-4">
        {/* See Topbar.tsx's Settings link for how a session stored in sessionStorage survives
            opening this in a new tab. */}
        <Link
          to={`/events/${event.id}/analysis`}
          target="_blank"
          onClick={(e) => openInNewTabWithSession(e, `/events/${event.id}/analysis`)}
          className={CARD_ENABLED}
        >
          <div className={`${CARD_ICON_BASE} bg-[#eef1f6] text-[#56617a]`}>
            <ChartIcon size={20} />
          </div>
          <span className="text-[15px] font-bold text-[#12284a]">Analysis</span>
        </Link>

        {event.registrationType === 'Invite-only' && (
          <Link to={`/events/${event.id}/invitees`} className={CARD_ENABLED}>
            <div className={`${CARD_ICON_BASE} bg-[#fff8e1] text-[#a0740f]`}>
              <PeopleIcon size={20} />
            </div>
            <span className="text-[15px] font-bold text-[#12284a]">Invitees</span>
            <span className="text-[13px] text-[#7c8aa0]">Add or drop students</span>
          </Link>
        )}

        {event.registrationType === 'Invite-only' && (
          <button
            type="button"
            onClick={handleDownloadAllPasses}
            disabled={downloadingPasses}
            className={`${CARD_ENABLED} cursor-pointer border-none text-left disabled:cursor-not-allowed disabled:opacity-70`}
          >
            <div className={`${CARD_ICON_BASE} bg-[#e3edff] text-[#2f6fed]`}>
              <DownloadIcon size={20} />
            </div>
            <span className="text-[15px] font-bold text-[#12284a]">Download Passes</span>
            <span className="text-[13px] text-[#7c8aa0]">
              {passProgress
                ? passProgress.total > 0
                  ? `Generating ${passProgress.done} of ${passProgress.total}…`
                  : 'Starting…'
                : 'All invited students, as one ZIP'}
            </span>
          </button>
        )}
      </div>

      {passMessage && (
        <p
          className={`m-0 text-[13.5px] font-semibold ${passMessage.isError ? 'text-[#d1453d]' : 'text-[#0f766e]'}`}
          role={passMessage.isError ? 'alert' : 'status'}
        >
          {passMessage.text}
        </p>
      )}

      <DeleteEventDialog event={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={() => navigate('/events/all')} />
    </div>
  )
}
