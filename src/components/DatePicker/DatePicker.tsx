import { useEffect, useRef, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons/NavIcons'
import {
  MONTH_NAMES,
  MONTH_SHORT_NAMES,
  WEEKDAY_SHORT_NAMES,
  isoToParts,
  partsToIso,
  todayParts,
  formatDateDisplay,
  parseDateInput,
  getMonthGrid,
  compareDateParts,
  clampDay,
  decadeStart,
  type DateParts,
} from './dateUtils'

interface DatePickerProps {
  id: string
  value: string // ISO "YYYY-MM-DD" or ''
  onChange: (value: string) => void
  min?: string // ISO date — days before this are disabled
  max?: string // ISO date — days after this are disabled
  disabled?: boolean
  hasError?: boolean
  title?: string
}

type CalendarView = 'month' | 'year' | 'decade'

function inputClasses(hasError: boolean) {
  return `w-full box-border rounded-[10px] px-3.5 py-3 bg-[#f7f9fc] text-sm text-[#12284a] border [transition:border-color_150ms_ease,background-color_150ms_ease,box-shadow_150ms_ease] focus:bg-white focus:border-[#0d9488] focus:shadow-[0_0_0_3px_rgba(13,148,136,0.12)] focus:outline-none disabled:cursor-not-allowed disabled:text-[#b7c0d1] ${
    hasError ? 'border-[#e05252]!' : 'border-[#e2e6ee]'
  }`
}

function isBeforeMin(parts: DateParts, min?: string): boolean {
  if (!min) return false
  const minParts = isoToParts(min)
  return !!minParts && compareDateParts(parts, minParts) < 0
}

function isAfterMax(parts: DateParts, max?: string): boolean {
  if (!max) return false
  const maxParts = isoToParts(max)
  return !!maxParts && compareDateParts(parts, maxParts) > 0
}

// Replaces the browser's native <input type="date"> with a typeable text field plus a Month /
// Year / Decade drill-down calendar panel — the native control's platform-drawn UI varies wildly
// across browsers and doesn't match the rest of this app (see TimePicker for the exact same
// reasoning, which this mirrors closely: same external contract, an ISO string in and out).
// Click (or Enter) the header label to zoom OUT a level (Month -> Year -> Decade); click a
// month/year to zoom back IN and land on it. Keeps the exact same "type a date directly, or open a
// picker" duality TimePicker already established for time-of-day fields.
export function DatePicker({ id, value, onChange, min, max, disabled = false, hasError = false, title }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(() => (value ? formatDateDisplay(value) : ''))
  const [view, setView] = useState<CalendarView>('month')
  const [viewYear, setViewYear] = useState(() => (isoToParts(value) ?? todayParts()).year)
  const [viewMonth, setViewMonth] = useState(() => (isoToParts(value) ?? todayParts()).month)
  // The one cell with a real tabIndex (roving tabindex) — arrow keys move this and the actual DOM
  // focus together, exactly like TypeaheadInput/ProgramAutocomplete's highlighted-option index,
  // just across three different grid shapes (day/month/year) instead of one flat list.
  const [focusedParts, setFocusedParts] = useState<DateParts>(() => isoToParts(value) ?? todayParts())
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const today = todayParts()

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setText(value ? formatDateDisplay(value) : '')
    }
  }, [value])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setText(value ? formatDateDisplay(value) : '')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [value])

  // Moves real DOM focus to whichever cell focusedParts now points at, once the grid reflecting
  // it has actually rendered — covers arrow-key navigation crossing a month/year boundary, where
  // the previous cell's DOM node no longer exists in the new grid. Skipped while the text input
  // itself still has focus: focusedParts is set the moment the picker opens (so the right cell is
  // ready the first time an arrow key IS pressed), but nothing has asked to move focus into the
  // grid yet at that point — typing a date directly is just as valid a next step, and this must
  // not yank focus away from the input for that to keep working.
  useEffect(() => {
    if (!open || document.activeElement === inputRef.current) return
    const cellId = `${id}-cell-${view}-${focusedParts.year}-${focusedParts.month}-${focusedParts.day}`
    document.getElementById(cellId)?.focus()
  }, [open, view, focusedParts, id])

  function openPicker() {
    setOpen(true)
    const anchor = isoToParts(value) ?? today
    setViewYear(anchor.year)
    setViewMonth(anchor.month)
    setView('month')
    setFocusedParts(anchor)
  }

  function commit(raw: string) {
    const parsed = parseDateInput(raw)
    if (parsed) {
      onChange(parsed)
      setText(formatDateDisplay(parsed))
    } else {
      setText(value ? formatDateDisplay(value) : '')
    }
  }

  function selectDay(parts: DateParts) {
    if (isBeforeMin(parts, min) || isAfterMax(parts, max)) return
    const iso = partsToIso(parts)
    onChange(iso)
    setText(formatDateDisplay(iso))
    setOpen(false)
    inputRef.current?.blur()
  }

  function goToMonth(year: number, month: number) {
    setViewYear(year)
    setViewMonth(month)
    setView('month')
    setFocusedParts({ year, month, day: clampDay(year, month, focusedParts.day) })
  }

  function goToYear(year: number) {
    setViewYear(year)
    setView('year')
    setFocusedParts((prev) => ({ ...prev, year }))
  }

  function stepHeader(delta: number) {
    if (view === 'month') {
      let month = viewMonth + delta
      let year = viewYear
      if (month < 0) {
        month = 11
        year -= 1
      } else if (month > 11) {
        month = 0
        year += 1
      }
      setViewYear(year)
      setViewMonth(month)
      setFocusedParts({ year, month, day: clampDay(year, month, focusedParts.day) })
    } else if (view === 'year') {
      setViewYear((y) => y + delta)
      setFocusedParts((prev) => ({ ...prev, year: prev.year + delta }))
    } else {
      setViewYear((y) => y + delta * 10)
      setFocusedParts((prev) => ({ ...prev, year: prev.year + delta * 10 }))
    }
  }

  function drillOut() {
    if (view === 'month') setView('year')
    else if (view === 'year') setView('decade')
  }

  function moveFocusedDay(deltaDays: number) {
    const base = new Date(focusedParts.year, focusedParts.month, focusedParts.day + deltaDays)
    const next: DateParts = { year: base.getFullYear(), month: base.getMonth(), day: base.getDate() }
    setFocusedParts(next)
    setViewYear(next.year)
    setViewMonth(next.month)
  }

  function moveFocusedMonth(deltaMonths: number) {
    let month = focusedParts.month + deltaMonths
    let year = focusedParts.year
    while (month < 0) {
      month += 12
      year -= 1
    }
    while (month > 11) {
      month -= 12
      year += 1
    }
    const next: DateParts = { year, month, day: clampDay(year, month, focusedParts.day) }
    setFocusedParts(next)
    setViewYear(year)
  }

  function moveFocusedYear(deltaYears: number) {
    const year = focusedParts.year + deltaYears
    setFocusedParts((prev) => ({ ...prev, year }))
    setViewYear(year)
  }

  function handleGridKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false)
      setText(value ? formatDateDisplay(value) : '')
      inputRef.current?.focus()
      return
    }

    if (view === 'month') {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        moveFocusedDay(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        moveFocusedDay(1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        moveFocusedDay(-7)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        moveFocusedDay(7)
      } else if (e.key === 'PageUp') {
        e.preventDefault()
        moveFocusedMonth(e.shiftKey ? -12 : -1)
      } else if (e.key === 'PageDown') {
        e.preventDefault()
        moveFocusedMonth(e.shiftKey ? 12 : 1)
      } else if (e.key === 'Home') {
        e.preventDefault()
        moveFocusedDay(-new Date(focusedParts.year, focusedParts.month, focusedParts.day).getDay())
      } else if (e.key === 'End') {
        e.preventDefault()
        moveFocusedDay(6 - new Date(focusedParts.year, focusedParts.month, focusedParts.day).getDay())
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        selectDay(focusedParts)
      }
    } else {
      // Year view (12 months) and Decade view (12 years) share the same 4-column roving grid.
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (view === 'year') moveFocusedMonth(-1)
        else moveFocusedYear(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (view === 'year') moveFocusedMonth(1)
        else moveFocusedYear(1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (view === 'year') moveFocusedMonth(-4)
        else moveFocusedYear(-4)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (view === 'year') moveFocusedMonth(4)
        else moveFocusedYear(4)
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (view === 'year') goToMonth(focusedParts.year, focusedParts.month)
        else goToYear(focusedParts.year)
      }
    }
  }

  const headerLabel =
    view === 'month'
      ? `${MONTH_NAMES[viewMonth]} ${viewYear}`
      : view === 'year'
        ? `${viewYear}`
        : `${decadeStart(viewYear)} – ${decadeStart(viewYear) + 9}`

  const selectedParts = isoToParts(value)

  return (
    <div className="relative" ref={containerRef}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        placeholder="Select a date"
        className={inputClasses(hasError)}
        value={text}
        disabled={disabled}
        title={title}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => {
          openPicker()
          inputRef.current?.select()
        }}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(text)
            setOpen(false)
            inputRef.current?.blur()
          } else if (e.key === 'Escape') {
            setText(value ? formatDateDisplay(value) : '')
            setOpen(false)
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            // From the input, an arrow key hands keyboard control to the calendar grid rather than
            // moving anything itself — the grid's own onKeyDown (handleGridKeyDown) takes over
            // from here for all further arrow-key/Enter/Escape handling once focus lands on a cell.
            e.preventDefault()
            if (!open) openPicker()
            const cellId = `${id}-cell-${view}-${focusedParts.year}-${focusedParts.month}-${focusedParts.day}`
            document.getElementById(cellId)?.focus()
          }
        }}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-invalid={hasError}
        aria-describedby={hasError ? `${id}-error` : undefined}
        autoComplete="off"
      />

      {open && !disabled && (
        <div
          role="dialog"
          aria-label="Choose a date"
          onKeyDown={handleGridKeyDown}
          className="absolute top-[calc(100%+6px)] left-0 z-20 w-[300px] rounded-xl border border-[#eef1f6] bg-white p-3 shadow-[0_12px_28px_rgba(15,40,74,0.16)]"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label={view === 'month' ? 'Previous month' : view === 'year' ? 'Previous year' : 'Previous decade'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => stepHeader(-1)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-none bg-transparent text-[#56617a] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f2f5fa]"
            >
              <ChevronLeftIcon size={16} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={drillOut}
              disabled={view === 'decade'}
              className="rounded-lg border-none bg-transparent px-2 py-1 text-[13.5px] font-extrabold text-[#12284a] cursor-pointer [transition:background-color_150ms_ease] hover:not-disabled:bg-[#f2f5fa] disabled:cursor-default"
            >
              {headerLabel}
            </button>
            <button
              type="button"
              aria-label={view === 'month' ? 'Next month' : view === 'year' ? 'Next year' : 'Next decade'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => stepHeader(1)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-none bg-transparent text-[#56617a] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f2f5fa]"
            >
              <ChevronRightIcon size={16} />
            </button>
          </div>

          {view === 'month' && (
            <div role="grid" aria-label={`${MONTH_NAMES[viewMonth]} ${viewYear}`}>
              <div className="mb-1 grid grid-cols-7">
                {WEEKDAY_SHORT_NAMES.map((w) => (
                  <span key={w} className="flex h-7 items-center justify-center text-[11px] font-bold text-[#9aa6ba]">
                    {w}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {getMonthGrid(viewYear, viewMonth).map((cell) => {
                  const isSelected = !!selectedParts && compareDateParts(cell, selectedParts) === 0
                  const isToday = compareDateParts(cell, today) === 0
                  const cellDisabled = isBeforeMin(cell, min) || isAfterMax(cell, max)
                  const isFocusTarget = compareDateParts(cell, focusedParts) === 0
                  return (
                    <button
                      key={`${cell.year}-${cell.month}-${cell.day}`}
                      id={`${id}-cell-month-${cell.year}-${cell.month}-${cell.day}`}
                      type="button"
                      role="gridcell"
                      aria-selected={isSelected}
                      aria-current={isToday ? 'date' : undefined}
                      tabIndex={isFocusTarget ? 0 : -1}
                      disabled={cellDisabled}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectDay(cell)}
                      onFocus={() => setFocusedParts(cell)}
                      className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold [transition:background-color_150ms_ease,color_150ms_ease] disabled:cursor-not-allowed disabled:opacity-35 ${
                        isSelected
                          ? 'bg-[#0d9488] text-white'
                          : cell.inCurrentMonth
                            ? `text-[#12284a] cursor-pointer hover:not-disabled:bg-[#f0fdfa] ${isToday ? 'ring-1 ring-inset ring-[#0d9488]' : ''}`
                            : 'text-[#c3ccdb] cursor-pointer hover:not-disabled:bg-[#f7f9fc]'
                      }`}
                    >
                      {cell.day}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {view === 'year' && (
            <div role="grid" aria-label={`${viewYear}`} className="grid grid-cols-4 gap-1.5">
              {MONTH_SHORT_NAMES.map((label, month) => {
                const isSelected = !!selectedParts && selectedParts.year === viewYear && selectedParts.month === month
                const isFocusTarget = focusedParts.year === viewYear && focusedParts.month === month
                return (
                  <button
                    key={label}
                    id={`${id}-cell-year-${viewYear}-${month}-${focusedParts.day}`}
                    type="button"
                    role="gridcell"
                    aria-selected={isSelected}
                    tabIndex={isFocusTarget ? 0 : -1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => goToMonth(viewYear, month)}
                    onFocus={() => setFocusedParts((prev) => ({ ...prev, year: viewYear, month }))}
                    className={`flex h-11 items-center justify-center rounded-full text-[13px] font-semibold [transition:background-color_150ms_ease,color_150ms_ease] ${
                      isSelected ? 'bg-[#0d9488] text-white' : 'cursor-pointer text-[#12284a] hover:bg-[#f0fdfa]'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}

          {view === 'decade' && (
            <div role="grid" aria-label={headerLabel} className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: 12 }, (_, i) => decadeStart(viewYear) - 1 + i).map((year) => {
                const isEdge = year === decadeStart(viewYear) - 1 || year === decadeStart(viewYear) + 10
                const isSelected = !!selectedParts && selectedParts.year === year
                const isFocusTarget = focusedParts.year === year
                return (
                  <button
                    key={year}
                    id={`${id}-cell-decade-${year}-${focusedParts.month}-${focusedParts.day}`}
                    type="button"
                    role="gridcell"
                    aria-selected={isSelected}
                    tabIndex={isFocusTarget ? 0 : -1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => goToYear(year)}
                    onFocus={() => setFocusedParts((prev) => ({ ...prev, year }))}
                    className={`flex h-11 items-center justify-center rounded-full text-[13px] font-semibold [transition:background-color_150ms_ease,color_150ms_ease] ${
                      isSelected ? 'bg-[#0d9488] text-white' : isEdge ? 'cursor-pointer text-[#c3ccdb] hover:bg-[#f7f9fc]' : 'cursor-pointer text-[#12284a] hover:bg-[#f0fdfa]'
                    }`}
                  >
                    {year}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
