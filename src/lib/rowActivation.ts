import type { KeyboardEvent } from 'react'

// Shared by every clickable table row / card that navigates or opens something on click (Events
// list, Student Directory, Full Attendee List, Who's Missing) — these aren't real <button>/<a>
// elements (a <tr> can't be one), so without this they're only reachable by mouse. Spread
// `rowActivationProps(onActivate)` onto the row/card element: it adds keyboard focus, marks it as
// activatable for assistive tech, and makes Enter/Space trigger the same action a click does —
// exactly what a real button gets for free. A nested real <button> (e.g. a row's own Edit/Delete)
// keeps working exactly as before, focusable and activatable on its own, in its own Tab stop.
export function rowActivationProps(onActivate: () => void) {
  return {
    tabIndex: 0,
    role: 'button' as const,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget) return // a nested control (e.g. Edit/Delete) handles its own keys
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate()
      }
    },
  }
}
