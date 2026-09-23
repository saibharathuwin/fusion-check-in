import type { EventStatus } from './eventsData'

export const STATUS_COLORS: Record<EventStatus, { bg: string; text: string }> = {
  Upcoming: { bg: '#e3edff', text: '#2f6fed' },
  Active: { bg: '#fff3d6', text: '#b3790a' },
  Completed: { bg: '#e1f8ec', text: '#159a56' },
}

const EVENT_TYPE_PALETTE = [
  { bg: '#e3edff', text: '#2f6fed' },
  { bg: '#efe7fd', text: '#8b5cf6' },
  { bg: '#e1f8ec', text: '#159a56' },
  { bg: '#fff3d6', text: '#b3790a' },
  { bg: '#fde7f1', text: '#d13d82' },
  { bg: '#e0f7f6', text: '#0f9490' },
  { bg: '#ffe7df', text: '#d1502f' },
  { bg: '#e6e9fd', text: '#4b4fd6' },
]

export function getEventTypeColor(type: string) {
  let hash = 0
  for (let i = 0; i < type.length; i++) {
    hash = (hash * 31 + type.charCodeAt(i)) % EVENT_TYPE_PALETTE.length
  }
  return EVENT_TYPE_PALETTE[Math.abs(hash)]
}
