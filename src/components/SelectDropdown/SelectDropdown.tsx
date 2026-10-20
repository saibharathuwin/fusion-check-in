import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CheckCircleIcon } from '../icons/NavIcons'

export interface SelectDropdownOption {
  key: string
  label: string
  // Finished items (e.g. a day whose sessions have all closed) are dimmed with a check mark.
  done?: boolean
}

interface SelectDropdownProps {
  id: string
  label: string
  options: SelectDropdownOption[]
  value: string
  onChange: (key: string) => void
  disabled?: boolean
  // Shown below the list, e.g. "Show earlier days (4 completed)" — kept out of the arrow-key order.
  footer?: { label: string; expanded: boolean; onToggle: () => void }
}

export function SelectDropdown({ id, label, options, value, onChange, disabled = false, footer }: SelectDropdownProps) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selected = options.find((o) => o.key === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => listRef.current?.focus())
    function handlePointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  function openList() {
    const index = Math.max(0, options.findIndex((o) => o.key === value))
    setHighlight(index)
    setOpen(true)
  }

  function closeList(returnFocus: boolean) {
    setOpen(false)
    if (returnFocus) buttonRef.current?.focus()
  }

  function choose(index: number) {
    const option = options[index]
    if (!option) return
    onChange(option.key)
    closeList(true)
  }

  function handleButtonKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openList()
    }
  }

  function handleListKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(options.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(0, h - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setHighlight(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setHighlight(options.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(highlight)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeList(true)
    } else if (e.key === 'Tab') {
      closeList(false)
    }
  }

  const activeId = open && options[highlight] ? `${id}-option-${highlight}` : undefined

  return (
    <div ref={containerRef} className="relative flex items-center gap-2">
      <span id={`${id}-label`} className="text-[11px] font-bold tracking-[0.5px] text-[#9aa6ba] uppercase">
        {label}
      </span>
      <button
        ref={buttonRef}
        id={`${id}-button`}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-button`}
        onClick={() => (open ? closeList(false) : openList())}
        onKeyDown={handleButtonKeyDown}
        className="inline-flex max-w-[220px] items-center gap-2 rounded-[10px] border border-[#dfe5ef] bg-white px-3 py-1.5 text-[13px] font-bold text-[#12284a] cursor-pointer [transition:border-color_150ms_ease] hover:border-[#c7d0e0] focus-visible:outline-2 focus-visible:outline-[#0d9488] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{selected?.label ?? ''}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" className="shrink-0">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-30 mt-1.5 flex min-w-[240px] flex-col rounded-[12px] border border-[#eef1f6] bg-white p-1.5 shadow-[0_12px_32px_rgba(15,40,74,0.16)]">
          <ul
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={`${id}-label`}
            aria-activedescendant={activeId}
            onKeyDown={handleListKeyDown}
            className="m-0 flex max-h-[300px] list-none flex-col gap-0.5 overflow-y-auto p-0 focus:outline-none"
          >
            {options.map((option, index) => {
              const isSelected = option.key === value
              const isHighlighted = index === highlight
              return (
                <li
                  key={option.key}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(index)}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-[13px] ${
                    isHighlighted ? 'bg-[#eef1f6]' : ''
                  } ${option.done ? 'text-[#9aa6ba]' : 'font-semibold text-[#12284a]'} ${isSelected ? 'font-bold text-[#0d9488]' : ''}`}
                >
                  <span className="truncate">{option.label}</span>
                  {option.done && <CheckCircleIcon size={13} />}
                </li>
              )
            })}
          </ul>

          {footer && (
            <button
              type="button"
              aria-expanded={footer.expanded}
              onClick={footer.onToggle}
              className="mt-1 rounded-[8px] px-3 py-2 text-left text-[12.5px] font-bold text-[#0d9488] cursor-pointer hover:bg-[#f0fdfa] focus-visible:outline-2 focus-visible:outline-[#0d9488]"
            >
              {footer.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
