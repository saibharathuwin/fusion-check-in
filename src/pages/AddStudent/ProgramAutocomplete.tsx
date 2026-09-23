import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

interface ProgramAutocompleteProps {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  disabled: boolean
  hasError: boolean
  id: string
}

const OPTION_CLASSES =
  'block w-full rounded-lg border-none bg-transparent px-[10px] py-[9px] text-left text-[13.5px] text-[#33415c] cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] hover:bg-[#f0fdfa] hover:text-[#0d9488]'

// A sentinel that can never collide with a real program name — marks the "Other (type manually)"
// row's slot in the combined keyboard-nav list (see navValues below).
const OTHER_NAV_VALUE = '\u0000__other__'

// A solid, high-contrast fill (not a faint tint) for the keyboard-highlighted row — matches how a
// native <select>'s own focused option looks, so it's unmistakable regardless of monitor/lighting.
const HIGHLIGHT_STYLE = { backgroundColor: '#0d9488', color: '#ffffff' }

export function ProgramAutocomplete({ value, onChange, suggestions, disabled, hasError, id }: ProgramAutocompleteProps) {
  const [open, setOpen] = useState(false)
  // -1 means nothing is keyboard-highlighted (matches TypeaheadInput's convention) — Enter then
  // falls through to the form's own submit/next-field behavior instead of picking anything.
  const [highlighted, setHighlighted] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase()
    if (!query) return suggestions
    return suggestions.filter((s) => s.toLowerCase().includes(query))
  }, [suggestions, value])

  const exactMatch = suggestions.some((s) => s.toLowerCase() === value.trim().toLowerCase())
  const showCreateHint = value.trim().length > 0 && !exactMatch

  // Every keyboard-navigable row, "Other (type manually)" always last — arrow keys and Enter both
  // work off this one list rather than juggling separate index spaces per row type.
  const navValues = useMemo(() => [...filtered, OTHER_NAV_VALUE], [filtered])

  const navKey = `${open}|${navValues.join('\u0000')}`
  const [lastNavKey, setLastNavKey] = useState(navKey)
  if (navKey !== lastNavKey) {
    setLastNavKey(navKey)
    setHighlighted(-1)
  }

  useEffect(() => {
    if (highlighted >= 0) optionRefs.current[highlighted]?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  function handlePickOther() {
    onChange('')
    setOpen(true)
    inputRef.current?.focus()
  }

  function selectHighlighted(index: number) {
    if (navValues[index] === OTHER_NAV_VALUE) {
      handlePickOther()
    } else {
      onChange(navValues[index])
      setOpen(false)
    }
  }

  function handleBlur() {
    setOpen(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open || navValues.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((i) => (i + 1 >= navValues.length ? 0 : i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((i) => (i <= 0 ? navValues.length - 1 : i - 1))
    } else if (e.key === 'Enter' && highlighted >= 0) {
      // Only intercept Enter once something's actually highlighted — otherwise it falls through
      // to the form's normal submit behavior, exactly like a plain text field.
      e.preventDefault()
      selectHighlighted(highlighted)
    }
  }

  // Clicking a suggestion normally blurs the input first (mousedown shifts focus before the
  // click event fires), which used to race a setTimeout-delayed close against the click actually
  // landing — a real, unhurried click easily took longer than that delay, so the dropdown closed
  // (unmounting the button) before its click ever registered, leaving the field empty. Blocking
  // mousedown's default focus-shift here means the input never blurs from these clicks at all, so
  // there's no race to lose regardless of how long the press takes.
  function preventBlur(e: React.MouseEvent) {
    e.preventDefault()
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        className={`w-full box-border rounded-[10px] border px-3.5 py-3 bg-[#f7f9fc] text-sm text-[#12284a] placeholder:text-[#9aa6ba] [transition:border-color_150ms_ease,background-color_150ms_ease] focus:border-[#0d9488] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,148,136,0.12)] focus:outline-none disabled:cursor-not-allowed disabled:text-[#b7c0d1] ${
          hasError ? 'border-[#e05252]' : 'border-[#e2e6ee]'
        }`}
        value={value}
        disabled={disabled}
        placeholder={disabled ? 'Pick a faculty first' : 'Search or type a program...'}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-activedescendant={highlighted >= 0 ? `${id}-option-${highlighted}` : undefined}
        aria-invalid={hasError}
        aria-describedby={hasError ? `${id}-error` : undefined}
      />

      {open && !disabled && (
        <div className="absolute top-[calc(100%+6px)] right-0 left-0 z-20 max-h-[180px] overflow-y-auto rounded-xl border border-[#eef1f6] bg-white p-2 shadow-[0_12px_28px_rgba(15,40,74,0.16)]">
          {filtered.length > 0 ? (
            <ul role="listbox" className="m-0 flex list-none flex-col gap-0.5 p-0">
              {filtered.map((option, index) => (
                <li key={option} role="presentation">
                  <button
                    id={`${id}-option-${index}`}
                    ref={(el) => {
                      optionRefs.current[index] = el
                    }}
                    role="option"
                    aria-selected={index === highlighted}
                    type="button"
                    className={OPTION_CLASSES}
                    // Inline style, not a conditional Tailwind class — OPTION_CLASSES already sets
                    // bg-transparent/text-[#33415c], and Tailwind's compiled stylesheet order (not
                    // the order classes appear in this string) decides which same-property class
                    // wins when both are present, which silently made the highlight invisible.
                    // Inline style always wins the cascade, so this can't recur.
                    style={index === highlighted ? HIGHLIGHT_STYLE : undefined}
                    onMouseDown={preventBlur}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => selectHighlighted(index)}
                  >
                    {option}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 px-[10px] py-[9px] text-[13px] text-[#9aa6ba]">No matches for this faculty &amp; level yet.</p>
          )}

          <div className="mt-1 border-t border-[#eef1f6] pt-1">
            <button
              id={`${id}-option-${filtered.length}`}
              ref={(el) => {
                optionRefs.current[filtered.length] = el
              }}
              role="option"
              aria-selected={filtered.length === highlighted}
              type="button"
              className="block w-full rounded-lg border-none bg-transparent px-[10px] py-[9px] text-left text-[13.5px] text-[#7c8aa0] italic cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] hover:bg-[#f0fdfa] hover:text-[#0d9488]"
              style={filtered.length === highlighted ? HIGHLIGHT_STYLE : undefined}
              onMouseDown={preventBlur}
              onMouseEnter={() => setHighlighted(filtered.length)}
              onClick={handlePickOther}
            >
              Other (type manually)
            </button>
          </div>

          {showCreateHint && (
            <p className="mt-1.5 mb-0 border-t border-[#eef1f6] px-[10px] pt-2 text-xs font-semibold text-[#0d9488]">
              Using &ldquo;{value.trim()}&rdquo; as a new program
            </p>
          )}
        </div>
      )}
    </div>
  )
}
