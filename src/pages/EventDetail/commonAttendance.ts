// Shared by LiveMonitorView whenever more than one session is in view ("All sessions" for a day,
// or "Whole event" once more than one session has started) — pulled out on its own so the
// "common people" rule has a test, not just inline logic buried in the component.

type AttendanceLike = { sessionId: string | null; student: { uuid: string } }

// Only students with a check-in in EVERY one of the given sessions — "common people", not
// "checked in to at least one of them".
export function studentsInEverySession(records: AttendanceLike[], sessionIds: string[]): Set<string> {
  if (sessionIds.length === 0) return new Set()
  const byStudent = new Map<string, Set<string>>()
  for (const r of records) {
    if (!r.sessionId || !sessionIds.includes(r.sessionId)) continue
    const set = byStudent.get(r.student.uuid) ?? new Set<string>()
    set.add(r.sessionId)
    byStudent.set(r.student.uuid, set)
  }
  const result = new Set<string>()
  for (const [uuid, ids] of byStudent) {
    if (ids.size === sessionIds.length) result.add(uuid)
  }
  return result
}

type StatusLike = { sessionId: string | null; status: 'early' | 'on-time' | 'late' }

// Early/On-time/Late when combining sessions: a person with more than one check-in has more than
// one arrival time, so there's no single status to tag them with. Averaging each session's own
// count keeps the three numbers meaningful without claiming one status applies to everybody.
export function averageStatusCounts(records: StatusLike[], sessionIds: string[]): { early: number; onTime: number; late: number } {
  if (sessionIds.length === 0) return { early: 0, onTime: 0, late: 0 }
  const perSession = sessionIds.map((id) => {
    const rows = records.filter((r) => r.sessionId === id)
    return {
      early: rows.filter((r) => r.status === 'early').length,
      onTime: rows.filter((r) => r.status === 'on-time').length,
      late: rows.filter((r) => r.status === 'late').length,
    }
  })
  const avg = (key: 'early' | 'onTime' | 'late') => Math.round(perSession.reduce((sum, c) => sum + c[key], 0) / perSession.length)
  return { early: avg('early'), onTime: avg('onTime'), late: avg('late') }
}
