import { useEffect, useRef, useState } from 'react'
import { formatTime12h, parseTimeInput, toTimeParts, fromTimeParts, HOUR_OPTIONS, MINUTE_OPTIONS, PERIOD_OPTIONS, type Period } from './timeUtils'

interface TimePickerProps {
  id: string
  value: string // 24h "HH:MM" — same format a native <input type="time"> has always used
  onChange: (value: string) => void
  disabled?: boolean
  hasError?: boolean
  title?: string
}

const ITEM_HEIGHT = 32
const VISIBLE_ITEMS = 7
const COLUMN_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS
const COLUMN_PADDING = (COLUMN_HEIGHT - ITEM_HEIGHT) / 2
const SCROLL_SETTLE_MS = 120

function inputClasses(hasError: boolean) {
  return `w-full box-border rounded-[10px] px-3.5 py-3 bg-[#f7f9fc] text-sm text-[#12284a] border [transition:border-color_150ms_ease,background-color_150ms_ease,box-shadow_150ms_ease] focus:bg-white focus:border-[#0d9488] focus:shadow-[0_0_0_3px_rgba(13,148,136,0.12)] focus:outline-none disabled:cursor-not-allowed disabled:text-[#b7c0d1] ${
    hasError ? 'border-[#e05252]!' : 'border-[#e2e6ee]'
  }`
}

interface ColumnProps<T extends string | number> {
  options: readonly T[]
  selected: T
  showSelection: boolean
  format: (option: T) => string
  onSelect: (option: T) => void
}

// One scroll-snapping column of the panel (Hour, Minute, or AM/PM). A click on an option, or
// scrolling one to rest at the centered row, both select it immediately — there's no separate
// "confirm" step, matching how a native Ant Design-style time picker column behaves. Every option
// is always selectable — any time of day is valid, so there's no disabled/greyed-out state here.
function TimeColumn<T extends string | number>({ options, selected, showSelection, format, onSelect }: ColumnProps<T>) {
  const ref = useRef<HTMLUListElement>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the column's scroll position centered on the selected value whenever it changes —
  // whether from this column's own scroll settling, a click, or the other two columns/typed text
  // changing the overall value.
  useEffect(() => {
    const index = options.indexOf(selected)
    if (index === -1 || !ref.current) return
    ref.current.scrollTop = index * ITEM_HEIGHT
  }, [selected, options])

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current)
    },
    [],
  )

  function handleScroll() {
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const index = Math.min(Math.max(Math.round(el.scrollTop / ITEM_HEIGHT), 0), options.length - 1)
      const option = options[index]
      if (option !== undefined && option !== selected) onSelect(option)
    }, SCROLL_SETTLE_MS)
  }

  return (
    <ul
      ref={ref}
      onScroll={handleScroll}
      className="m-0 flex h-full min-w-0 flex-1 list-none flex-col overflow-y-auto [-ms-overflow-style:none] [scroll-snap-type:y_mandatory] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ paddingTop: COLUMN_PADDING, paddingBottom: COLUMN_PADDING }}
    >
      {options.map((option) => {
        const isSelected = showSelection && option === selected
        return (
          <li key={option} className="shrink-0 [scroll-snap-align:center]" style={{ height: ITEM_HEIGHT }}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(option)}
              className={`flex h-full w-full cursor-pointer items-center justify-center border-none bg-transparent text-[13.5px] [transition:color_150ms_ease] ${
                isSelected ? 'font-bold text-[#0d9488]' : 'text-[#33415c] hover:text-[#0d9488]'
              }`}
            >
              {format(option)}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// Replaces the browser's native <input type="time"> with a typeable text field plus a three-column
// scrollable panel (Hour / Minute / AM-PM, Ant Design-style) — the native control's segmented
// hour/minute/AM-PM editing has real interaction quirks around the noon/midnight boundary, and its
// rigid platform-drawn UI doesn't match the rest of this app. Keeps the exact same external contract
// (a 24h "HH:MM" string in and out — see timeUtils.ts for the one place 12h/24h conversion happens)
// so every caller (event start/end time, session opens/closes) swaps in without other code changing.
// Every time of day is selectable — nothing here is ever greyed out or blocked; if a caller needs to
// reject a particular value, that's a form-validation error message, not a disabled picker option.
export function TimePicker({ id, value, onChange, disabled = false, hasError = false, title }: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(() => (value ? formatTime12h(value) : ''))
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep the displayed text in sync with the real value when it changes from outside (e.g. the
  // default session mirroring the event's own start time) — but never while the field is focused,
  // so it doesn't overwrite what the person is actively typing.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setText(value ? formatTime12h(value) : '')
    }
  }, [value])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setText(value ? formatTime12h(value) : '')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [value])

  const hasValue = !!value
  const parts = toTimeParts(value)

  function applyParts(next: Partial<{ hour12: number; minute: number; period: Period }>) {
    const nextValue = fromTimeParts({ ...parts, ...next })
    onChange(nextValue)
    setText(formatTime12h(nextValue))
  }

  function commit(raw: string) {
    const parsed = parseTimeInput(raw)
    if (parsed) {
      onChange(parsed)
      setText(formatTime12h(parsed))
    } else {
      // Couldn't make sense of it — revert to the last real value rather than storing garbage.
      setText(value ? formatTime12h(value) : '')
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={hasError}
        aria-describedby={hasError ? `${id}-error` : undefined}
        placeholder="--:-- --"
        className={inputClasses(hasError)}
        value={text}
        disabled={disabled}
        title={title}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => {
          setOpen(true)
          e.target.select()
        }}
        onBlur={() => {
          commit(text)
          setOpen(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(text)
            setOpen(false)
            inputRef.current?.blur()
          } else if (e.key === 'Escape') {
            setText(value ? formatTime12h(value) : '')
            setOpen(false)
          }
        }}
        autoComplete="off"
      />

      {open && !disabled && (
        <div
          className="absolute top-[calc(100%+6px)] left-0 z-20 flex w-[216px] overflow-hidden rounded-xl border border-[#eef1f6] bg-white shadow-[0_12px_28px_rgba(15,40,74,0.16)]"
          style={{ height: COLUMN_HEIGHT }}
        >
          {hasValue && (
            <div
              className="pointer-events-none absolute inset-x-1.5 z-0 rounded-lg bg-[#f0fdfa]"
              style={{ top: COLUMN_PADDING, height: ITEM_HEIGHT }}
            />
          )}
          {/* Positioned (z-10) so this whole group paints above the highlight band above — an
              absolutely-positioned sibling otherwise paints after non-positioned in-flow content
              regardless of DOM order, which would bury the column text under the band. */}
          <div className="relative z-10 flex h-full w-full">
            <TimeColumn
              options={HOUR_OPTIONS}
              selected={parts.hour12}
              showSelection={hasValue}
              format={(h) => String(h).padStart(2, '0')}
              onSelect={(h) => applyParts({ hour12: h })}
            />
            <div className="w-px shrink-0 bg-[#eef1f6]" />
            <TimeColumn
              options={MINUTE_OPTIONS}
              selected={parts.minute}
              showSelection={hasValue}
              format={(m) => String(m).padStart(2, '0')}
              onSelect={(m) => applyParts({ minute: m })}
            />
            <div className="w-px shrink-0 bg-[#eef1f6]" />
            <TimeColumn
              options={PERIOD_OPTIONS}
              selected={parts.period}
              showSelection={hasValue}
              format={(p) => p}
              onSelect={(p) => applyParts({ period: p })}
            />
          </div>
        </div>
      )}
    </div>
  )
}
