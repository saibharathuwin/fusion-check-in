import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { PlusIcon } from '../icons/NavIcons'

interface TypeaheadInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  hasError?: boolean
}

const OPTION_CLASSES =
  'block w-full border-none bg-transparent px-4 py-3 text-left text-[13.5px] text-[#33415c] cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] hover:bg-[#f5f6f8] focus-visible:bg-[#f5f6f8] focus:outline-none'

const CREATE_OPTION_CLASSES =
  'flex w-full items-center gap-2 border-none bg-transparent px-4 py-3 text-left text-[13.5px] font-semibold text-[#0d9488] cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] hover:bg-[#f5f6f8] focus-visible:bg-[#f5f6f8] focus:outline-none'

// A solid, high-contrast fill (not a faint tint) — the previous light-gray highlight was too close
// to the plain white background to actually read as "selected" at a glance. This matches how a
// native <select>'s own focused option looks (solid accent fill, white text), so it's unmistakable
// regardless of monitor/lighting. Inline style, not a Tailwind class — see the two option buttons
// below for why (OPTION_CLASSES' own bg-transparent/text-[#33415c] would otherwise fight it for
// the same CSS properties, decided by Tailwind's stylesheet order rather than this string's order).
const HIGHLIGHT_STYLE = { backgroundColor: '#0d9488', color: '#ffffff' }

export function TypeaheadInput({ id, value, onChange, suggestions, placeholder, hasError = false }: TypeaheadInputProps) {
  const [open, setOpen] = useState(false)
  // -1 means nothing is keyboard-highlighted (typing hasn't been followed by an arrow key yet) —
  // in that state Enter falls through to the form's own submit instead of picking anything.
  const [highlighted, setHighlighted] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
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

  // Every keyboard-navigable row in the open dropdown, in the same top-to-bottom order they're
  // rendered — the filtered suggestions, then the "Create new" row if it's showing. Arrow keys
  // and Enter both work off this one list rather than juggling two separate index spaces.
  const navValues = useMemo(() => (showCreateHint ? [...filtered, value.trim()] : filtered), [filtered, showCreateHint, value])

  // Re-aim at "nothing highlighted" whenever the option list itself changes (typing narrows it,
  // or the dropdown just opened) — an index left over from the previous list could otherwise point
  // at a completely different row. Adjusted synchronously during render (React's own recommended
  // pattern for this) rather than in an effect, so there's no extra render where a stale index is
  // still visible before the reset lands.
  const navKey = `${open}|${navValues.join('\u0000')}`
  const [lastNavKey, setLastNavKey] = useState(navKey)
  if (navKey !== lastNavKey) {
    setLastNavKey(navKey)
    setHighlighted(-1)
  }

  useEffect(() => {
    if (highlighted >= 0) optionRefs.current[highlighted]?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  function selectValue(next: string) {
    onChange(next)
    setOpen(false)
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
      selectValue(navValues[highlighted])
    }
  }

  // See ProgramAutocomplete's identical fix: blocking mousedown's default focus-shift means a
  // click on a suggestion never blurs the input at all, so there's no race between the click
  // registering and a timed close — regardless of how long the press takes.
  function preventBlur(e: React.MouseEvent) {
    e.preventDefault()
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-activedescendant={highlighted >= 0 ? `${id}-option-${highlighted}` : undefined}
        aria-invalid={hasError}
        aria-describedby={hasError ? `${id}-error` : undefined}
        className={`w-full box-border rounded-[10px] border px-3.5 py-3 bg-[#f7f9fc] text-sm text-[#12284a] placeholder:text-[#9aa6ba] [transition:border-color_150ms_ease,background-color_150ms_ease] focus:border-[#0d9488] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,148,136,0.12)] focus:outline-none ${
          hasError ? 'border-[#e05252]' : 'border-[#e2e6ee]'
        }`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(e.target.value.trim().length > 0)
        }}
        onFocus={() => value.trim().length > 0 && setOpen(true)}
        onClick={() => value.trim().length > 0 && setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />

      {open && (
        <div className="absolute top-[calc(100%+4px)] right-0 left-0 z-20 max-h-[240px] overflow-y-auto rounded-b-xl bg-white shadow-[0_10px_24px_rgba(15,40,74,0.12)]">
          {filtered.length === 0 && !showCreateHint ? (
            <p className="m-0 px-4 py-3 text-[13px] text-[#9aa6ba]">No matches found.</p>
          ) : (
            <ul role="listbox" className="m-0 flex list-none flex-col p-0">
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
                    // Inline style, not a conditional Tailwind class — OPTION_CLASSES already
                    // includes bg-transparent, and Tailwind's compiled stylesheet order (not the
                    // order classes appear in this string) decides which same-property class
                    // wins when two are both present. That silently made the highlight
                    // invisible: bg-transparent kept winning over a same-string bg-[#f5f6f8].
                    // Inline style always wins the cascade, so this can't recur.
                    style={index === highlighted ? HIGHLIGHT_STYLE : undefined}
                    onMouseDown={preventBlur}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => selectValue(option)}
                  >
                    {option}
                  </button>
                </li>
              ))}
              {showCreateHint && (
                <li role="presentation">
                  <button
                    id={`${id}-option-${filtered.length}`}
                    ref={(el) => {
                      optionRefs.current[filtered.length] = el
                    }}
                    role="option"
                    aria-selected={filtered.length === highlighted}
                    type="button"
                    className={CREATE_OPTION_CLASSES}
                    style={filtered.length === highlighted ? HIGHLIGHT_STYLE : undefined}
                    onMouseDown={preventBlur}
                    onMouseEnter={() => setHighlighted(filtered.length)}
                    onClick={() => selectValue(value.trim())}
                  >
                    <PlusIcon size={13} />
                    Create new: &ldquo;{value.trim()}&rdquo;
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
