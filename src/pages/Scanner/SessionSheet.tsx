import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircleIcon } from '../../components/icons/NavIcons'
import type { EventSession } from '../../data/sessionsData'
import { groupSessionsByDay, splitDays, type SessionDay } from '../../data/sessionDays'

const SHEET_ANIMATION_MS = 200
const DISMISS_DRAG_PX = 90
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function formatDayTile(date: string): { weekday: string; day: string; month: string } {
  const d = new Date(`${date}T00:00:00`)
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
    day: String(d.getDate()),
    month: d.toLocaleDateString('en-US', { month: 'short' }),
  }
}

interface SessionSheetProps {
  open: boolean
  sessions: EventSession[]
  autoSessionId: string | null
  // The session currently in use (manual pick, or null for auto-detect) — the draft starts here.
  appliedSessionId: string | null
  now: Date
  // Called with the chosen session id (null = auto-detect) when Done is tapped, or the sheet is
  // dismissed by tapping outside, swiping down, or Escape.
  onConfirm: (sessionId: string | null) => void
}

export function SessionSheet(props: SessionSheetProps) {
  const { open, sessions, autoSessionId, appliedSessionId, now, onConfirm } = props

  const [rendered, setRendered] = useState(open)
  const [visible, setVisible] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setRendered(true)
    else setVisible(false)
  }

  const days = groupSessionsByDay(sessions, now)
  const { current, completed } = splitDays(days)
  const appliedDay = days.find((d) => d.sessions.some((s) => s.id === appliedSessionId))

  const [draftId, setDraftId] = useState<string | null>(appliedSessionId)
  const [pickedDate, setPickedDate] = useState<string | null>(
    () => appliedDay?.date ?? days.find((d) => d.isToday)?.date ?? current[0]?.date ?? days[0]?.date ?? null,
  )
  const [showEarlier, setShowEarlier] = useState(false)
  const [dragY, setDragY] = useState(0)
  const dragStartRef = useRef<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    return () => cancelAnimationFrame(raf)
  }, [open])

  useEffect(() => {
    if (!open) return
    lastFocusedRef.current = document.activeElement as HTMLElement | null
    const raf = requestAnimationFrame(() => panelRef.current?.focus())
    return () => {
      cancelAnimationFrame(raf)
      lastFocusedRef.current?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onConfirm(draftId)
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, draftId, onConfirm])

  function handleDragStart(e: ReactPointerEvent<HTMLDivElement>) {
    dragStartRef.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleDragMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragStartRef.current === null) return
    setDragY(Math.max(0, e.clientY - dragStartRef.current))
  }

  function handleDragEnd() {
    if (dragStartRef.current === null) return
    dragStartRef.current = null
    if (dragY > DISMISS_DRAG_PX) onConfirm(draftId)
    setDragY(0)
  }

  function handlePanelTransitionEnd() {
    if (!open) setRendered(false)
  }

  if (!rendered) return null

  const visibleDays = showEarlier ? days : current
  const pickedDay = days.find((d) => d.date === pickedDate) ?? null

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-end justify-center [transition:background-color_200ms_ease] ${
        visible ? 'bg-[rgba(10,20,38,0.5)]' : 'bg-[rgba(10,20,38,0)]'
      }`}
      onClick={() => onConfirm(draftId)}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-sheet-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onTransitionEnd={handlePanelTransitionEnd}
        style={{ transform: visible ? `translateY(${dragY}px)` : 'translateY(100%)', transitionDuration: dragY ? '0ms' : `${SHEET_ANIMATION_MS}ms` }}
        className="flex max-h-[85vh] w-full max-w-[620px] flex-col gap-4 overflow-y-auto rounded-t-[22px] bg-[#132744] px-5 pt-3 pb-6 text-white shadow-[0_-12px_40px_rgba(0,0,0,0.35)] [transition-property:transform] focus:outline-none"
      >
        <div
          aria-hidden="true"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          className="mx-auto h-1.5 w-12 cursor-grab touch-none rounded-full bg-white/25"
        />

        <div className="flex flex-col gap-1">
          <h2 id="session-sheet-title" className="m-0 text-[18px] font-extrabold">
            Change session
          </h2>
          <p className="m-0 text-[13px] text-white/60">Auto-detect is on. Pick a day and session only to override it.</p>
        </div>

        {completed.length > 0 && (
          <button
            type="button"
            aria-expanded={showEarlier}
            onClick={() => setShowEarlier((v) => !v)}
            className="w-fit cursor-pointer bg-transparent p-0 text-[12.5px] font-bold text-white/60 hover:text-white focus-visible:outline-2 focus-visible:outline-[#f4b400]"
          >
            {showEarlier ? 'Hide earlier days' : `View earlier days (${completed.length} completed) →`}
          </button>
        )}

        <div role="group" aria-label="Day" className="flex gap-2 overflow-x-auto pb-1">
          {visibleDays.map((day: SessionDay) => {
            const tile = formatDayTile(day.date)
            const selected = day.date === pickedDate
            return (
              <button
                key={day.date}
                type="button"
                aria-pressed={selected}
                onClick={() => setPickedDate(day.date)}
                className={`relative flex min-w-[66px] shrink-0 flex-col items-center gap-0.5 rounded-[14px] border px-2.5 py-2.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f4b400] ${
                  day.isToday
                    ? 'border-[#f4b400] bg-[#f4b400] text-[#12284a]'
                    : selected
                      ? 'border-white/60 bg-white/15 text-white'
                      : day.allClosed
                        ? 'border-white/10 bg-white/5 text-white/45'
                        : 'border-white/15 bg-white/5 text-white'
                }`}
              >
                <span className="text-[10.5px] font-bold tracking-[0.4px] uppercase">{day.isToday ? 'Today' : tile.weekday}</span>
                <span className="text-[20px] leading-none font-extrabold">{tile.day}</span>
                <span className="text-[10.5px] font-semibold">{tile.month}</span>
                {day.allClosed && (
                  <span className="absolute top-1.5 right-1.5">
                    <CheckCircleIcon size={12} />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {pickedDay && (
          <div role="group" aria-label={`Sessions on ${pickedDay.date}`} className="flex flex-col gap-2">
            <button
              type="button"
              aria-pressed={draftId === null}
              onClick={() => setDraftId(null)}
              className={`flex w-full items-center justify-between rounded-[12px] border px-4 py-3 text-left text-[14px] font-bold cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f4b400] ${
                draftId === null ? 'border-[#f4b400] bg-[#f4b400]/15 text-white' : 'border-white/15 bg-white/5 text-white/80'
              }`}
            >
              Auto-detect
              <span className="text-[11px] font-bold text-white/50">{draftId === null ? 'In use' : ''}</span>
            </button>

            {pickedDay.sessions.map((s) => {
              const selected = draftId === s.id
              const isAuto = s.id === autoSessionId
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setDraftId(s.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-[12px] border px-4 py-3 text-left text-[14px] font-bold cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f4b400] ${
                    selected ? 'border-[#f4b400] bg-[#f4b400]/15 text-white' : 'border-white/15 bg-white/5 text-white/80'
                  }`}
                >
                  <span>{s.label}</span>
                  {isAuto && (
                    <span className="rounded-full bg-[#f4b400] px-2 py-0.5 text-[10px] font-extrabold tracking-[0.4px] text-[#12284a] uppercase">
                      Auto-detected
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => onConfirm(draftId)}
          className="mt-1 w-full rounded-[12px] bg-[#f4b400] px-5 py-3 text-[15px] font-extrabold text-[#12284a] cursor-pointer hover:brightness-95 focus-visible:outline-2 focus-visible:outline-white"
        >
          Done
        </button>
      </div>
    </div>,
    document.body,
  )
}
