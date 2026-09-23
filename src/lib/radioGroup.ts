import type { KeyboardEvent } from 'react'

// Arrow-key movement for a "pick one of several" pill/segmented-control button group (Registration
// type, Status mode, the Events list's status filter, etc.) — the roving-tabindex pattern a native
// <input type="radio"> group gets for free: ArrowRight/ArrowDown moves to and selects the next
// option, ArrowLeft/ArrowUp the previous, Home/End jump to the first/last, wrapping at the ends.
// Pair with role="radiogroup" on the wrapper and role="radio" + aria-checked + a roving tabIndex
// (0 on the selected option, -1 on the rest — see EventForm.tsx's registrationSection for the
// concrete pattern) on each button.
export function radioGroupKeyDown(e: KeyboardEvent<HTMLButtonElement>, onSelectIndex: (index: number) => void) {
  const container = e.currentTarget.parentElement
  if (!container) return
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button:not([disabled])'))
  const currentIndex = buttons.indexOf(e.currentTarget)
  if (currentIndex === -1) return

  let nextIndex: number | null = null
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    nextIndex = (currentIndex + 1) % buttons.length
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    nextIndex = (currentIndex - 1 + buttons.length) % buttons.length
  } else if (e.key === 'Home') {
    nextIndex = 0
  } else if (e.key === 'End') {
    nextIndex = buttons.length - 1
  }

  if (nextIndex !== null) {
    e.preventDefault()
    buttons[nextIndex].focus()
    onSelectIndex(nextIndex)
  }
}
