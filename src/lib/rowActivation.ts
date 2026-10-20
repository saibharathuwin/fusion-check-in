import type { KeyboardEvent, MouseEvent } from 'react'

// Shared by every clickable table row / card that navigates or opens something on click (Events
// list, Student Directory, Full Attendee List, Who's Missing) — these aren't real <button>/<a>
// elements (a <tr> can't be one), so without this they're only reachable by mouse. Spread
// `rowActivationProps(onActivate)` onto the row/card element: it adds keyboard focus, marks it as
// activatable for assistive tech, makes Enter/Space trigger the same action a click does, and
// handles the click itself too — callers should NOT add their own separate onClick alongside this,
// since the guard below only works if this is the one place deciding whether a click "counts".
//
// The onClick guard exists because these rows also contain real, selectable text (names, IDs,
// emails) — without it, releasing a mouse-drag text selection inside the row fires a click same as
// any other, immediately opening the row's modal/navigation and destroying the selection the user
// just made. Checking window.getSelection() lets a genuine text-selection drag end in a mouseup
// without being treated as "the user meant to activate this row".
export function rowActivationProps(onActivate: () => void) {
  return {
    tabIndex: 0,
    role: 'button' as const,
    onClick: (e: MouseEvent) => {
      // Unlike the keydown case below, e.target is essentially never the bare <tr>/<div> itself for
      // a mouse click — the row has no content of its own, so the click always lands on whatever
      // cell/text/child the user actually clicked. The real question is whether it landed inside a
      // nested REAL interactive control (e.g. a row's own Edit/Delete button), which handles its
      // own click and shouldn't also activate the row underneath it.
      if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return
      if ((window.getSelection()?.toString().length ?? 0) > 0) return // just finished selecting text, not activating the row
      onActivate()
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget) return // a nested control (e.g. Edit/Delete) handles its own keys
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate()
      }
    },
  }
}
