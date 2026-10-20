import { sessionWindowStatus, type EventSession } from './sessionsData'

export interface SessionDay {
  date: string
  sessions: EventSession[]
  isToday: boolean
  // True once every session that day has closed — these are tucked behind "View earlier days".
  allClosed: boolean
}

export function localDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function groupSessionsByDay(sessions: EventSession[], now: Date): SessionDay[] {
  const today = localDateKey(now)
  const byDate = new Map<string, EventSession[]>()
  for (const s of [...sessions].sort((a, b) => `${a.date}T${a.openTime}`.localeCompare(`${b.date}T${b.openTime}`))) {
    byDate.set(s.date, [...(byDate.get(s.date) ?? []), s])
  }
  return [...byDate.entries()].map(([date, daySessions]) => ({
    date,
    sessions: daySessions,
    isToday: date === today,
    allClosed: daySessions.every((s) => sessionWindowStatus(s, now) === 'closed'),
  }))
}

export function splitDays(days: SessionDay[]): { current: SessionDay[]; completed: SessionDay[] } {
  return {
    current: days.filter((d) => !d.allClosed),
    completed: days.filter((d) => d.allClosed),
  }
}
