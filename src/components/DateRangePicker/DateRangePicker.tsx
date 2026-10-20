import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon } from '../icons/NavIcons'
import { DatePicker } from '../DatePicker/DatePicker'

export interface DateRange {
  from: string | null
  to: string | null
}

interface DateRangePickerProps {
  value: DateRange
  onChange: (value: DateRange) => void
}

function formatLabel(value: DateRange) {
  if (!value.from && !value.to) return 'Select dates'
  const fmt = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (value.from && value.to) return `${fmt(value.from)} – ${fmt(value.to)}`
  if (value.from) return `From ${fmt(value.from)}`
  return `Until ${fmt(value.to as string)}`
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const hasValue = Boolean(value.from || value.to)

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        className="flex w-full min-w-[160px] items-center justify-between gap-2 rounded-[10px] border border-[#e2e6ee] bg-white px-3 py-[10px] text-[13.5px] font-semibold text-[#12284a] cursor-pointer [transition:border-color_150ms_ease] hover:border-[#c7d0e0]"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={hasValue ? '' : 'font-medium text-[#7c8aa0]'}>{formatLabel(value)}</span>
        <span className="shrink-0 text-[#7c8aa0]">
          <ChevronDownIcon size={15} />
        </span>
      </button>

      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 z-40 flex w-[260px] flex-col gap-2.5 rounded-xl border border-[#eef1f6] bg-white p-3.5 shadow-[0_12px_28px_rgba(15,40,74,0.16)]">
          <div className="flex flex-col gap-1">
            <label htmlFor="date-range-from" className="text-xs font-semibold tracking-[0.4px] text-[#7c8aa0] uppercase">
              From
            </label>
            <DatePicker
              id="date-range-from"
              value={value.from ?? ''}
              onChange={(next) => onChange({ ...value, from: next || null })}
              max={value.to ?? undefined}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="date-range-to" className="text-xs font-semibold tracking-[0.4px] text-[#7c8aa0] uppercase">
              To
            </label>
            <DatePicker
              id="date-range-to"
              value={value.to ?? ''}
              onChange={(next) => onChange({ ...value, to: next || null })}
              min={value.from ?? undefined}
            />
          </div>
          {hasValue && (
            <button
              type="button"
              className="self-start border-none bg-transparent px-0 py-0.5 text-[12.5px] font-bold text-[#d1502f] cursor-pointer"
              onClick={() => onChange({ from: null, to: null })}
            >
              Clear dates
            </button>
          )}
        </div>
      )}
    </div>
  )
}
