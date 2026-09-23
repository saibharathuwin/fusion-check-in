import { useCallback, useEffect, useState } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { fetchEventById, type EventItem } from '../Events/eventsData'

const REFRESH_INTERVAL_MS = 60_000

export interface EventDetailContext {
  event: EventItem
}

export function EventDetailLayout() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<EventItem | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    fetchEventById(id ?? '').then((result) => {
      setEvent(result)
      setLoading(false)
    })
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // Automatic-mode events recompute their status on every fetch — refresh periodically so a Live
  // event flips to Ended on its own while staff sit on this page, with no cron job needed.
  useEffect(() => {
    const interval = setInterval(load, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [load])

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[18px] bg-white px-5 py-[60px] text-center shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
        <p className="m-0 text-sm text-[#7c8aa0]">Loading&hellip;</p>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[18px] bg-white px-5 py-[60px] text-center shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
        <p className="m-0 text-sm text-[#7c8aa0]">This event couldn&apos;t be found.</p>
      </div>
    )
  }

  const context: EventDetailContext = { event }
  return <Outlet context={context} />
}
