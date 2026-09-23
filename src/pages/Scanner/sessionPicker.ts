import { fetchEvents, type EventItem } from '../Events/eventsData'
import { getSessionsForEvent, ensureDefaultSession, type EventSession } from '../../data/sessionsData'

export interface ScannableEvent {
  event: EventItem
  sessions: EventSession[]
}

// Only events that are actually happening (or about to) make sense to scan into — a Completed
// event has nothing left to check people into. A session is still required (every check-in
// references one), but an event doesn't need to have created one explicitly: if it has none yet,
// ensureDefaultSession() builds one from the event's own schedule on the spot, so a simple
// single-day event is always scannable without extra setup.
export async function getScannableEvents(): Promise<ScannableEvent[]> {
  const events = await fetchEvents()
  const active = events.filter((e) => e.status === 'Active' || e.status === 'Upcoming')

  const entries = await Promise.all(
    active.map(async (event) => {
      const existing = await getSessionsForEvent(event.id)
      const sessions = existing.length > 0 ? existing : await ensureDefaultSession(event)
      return { event, sessions }
    }),
  )

  return entries.filter((entry) => entry.sessions.length > 0).sort((a, b) => a.event.startDate.localeCompare(b.event.startDate))
}
