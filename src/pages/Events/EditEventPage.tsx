import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchEventById, type EventItem } from './eventsData'
import { getSessionsForEvent, type EventSession } from '../../data/sessionsData'
import { EventForm } from './EventForm'

export function EditEventPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [event, setEvent] = useState<EventItem | null>(null)
  const [sessions, setSessions] = useState<EventSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchEventById(id ?? ''), getSessionsForEvent(id ?? '')]).then(([eventResult, sessionsResult]) => {
      if (cancelled) return
      setEvent(eventResult)
      setSessions(sessionsResult)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [id])

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

  return (
    <EventForm
      mode="edit"
      initialEvent={event}
      initialSessions={sessions}
      onCancel={() => navigate(`/events/${event.id}`)}
      onSaved={(saved) => navigate(`/events/${saved.id}`)}
    />
  )
}
