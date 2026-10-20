import type { KeyboardEvent } from 'react'

// Focusable, single-line field types worth advancing between on Enter — checkboxes/radios/buttons
// are deliberately excluded: Enter has its own native meaning there (toggling a checkbox is Space,
// not Enter; a button already activates on Enter), so hijacking it would be surprising rather than
// helpful.
const ADVANCEABLE_SELECTOR = [
  'input[type="text"]',
  'input[type="email"]',
  'input[type="password"]',
  'input[type="tel"]',
  'input[type="number"]',
  'input[type="search"]',
  'input:not([type])',
  'select',
]
  .map((s) => `${s}:not([disabled]):not([readonly])`)
  .join(', ')

// Shared lower-level step: finds and focuses the next advanceable field after `target` within
// `form`, returning whether it found one. Exported separately from handleEnterToAdvance so a form
// with its own extra Enter behavior (EventForm.tsx's multi-step wizard, which advances to the next
// *step* rather than submitting once a step's last field is reached) can try this first and fall
// back to its own logic only once there's genuinely no next field left to jump to.
export function focusNextAdvanceableField(form: HTMLFormElement, target: HTMLElement): boolean {
  const fields = Array.from(form.querySelectorAll<HTMLElement>(ADVANCEABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null, // skip anything hidden (e.g. a field only shown for a different mode/step)
  )
  const currentIndex = fields.indexOf(target)
  if (currentIndex === -1) return false

  const next = fields[currentIndex + 1]
  if (!next) return false

  next.focus()
  if (next instanceof HTMLInputElement) next.select()
  return true
}

// Enter-to-advance for any plain, single-column form: pressing Enter in one field moves focus to
// the next one instead of doing nothing until Tab is pressed — mirrors what every native mobile
// form and most desktop apps already do. Spread as a form's onKeyDown.
//
// Two things it deliberately leaves alone:
// - `e.defaultPrevented` — a custom combobox (TypeaheadInput, ProgramAutocomplete, TimePicker)
//   already calls preventDefault() when it consumes Enter to select its own highlighted option
//   (see those components + EventForm.tsx's handleFormKeyDown for the established convention);
//   this must never fight that, or Enter would both pick the suggestion AND jump fields.
// - A textarea, and the *last* advanceable field in the form — both fall through to whatever
//   Enter already does there (insert a newline; submit the form), rather than being hijacked.
export function handleEnterToAdvance(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== 'Enter' || e.defaultPrevented) return
  const target = e.target as HTMLElement
  if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return

  if (focusNextAdvanceableField(e.currentTarget, target)) e.preventDefault()
}
