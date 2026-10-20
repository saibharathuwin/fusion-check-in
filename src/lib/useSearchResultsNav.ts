import { useState, type KeyboardEvent } from 'react'

// Shared by every "type to search, pick one from a list of results" UI (Pass Tools' Find a Student,
// the Live Monitor / Live Check-ins manual check-in search) — before this, each was a plain list of
// <button>s with no way to move a highlight with the keyboard at all, unlike TypeaheadInput/
// ProgramAutocomplete's comboboxes, which already had this. Spread the returned handlers onto the
// search <input>'s onKeyDown and each result's onMouseEnter/highlighted state for the same
// ArrowUp/ArrowDown-to-move, Enter-to-pick, hover-syncs-highlight behavior everywhere.
export function useSearchResultsNav<T>(results: T[], onSelect: (item: T) => void) {
  const [highlighted, setHighlighted] = useState(-1)

  // Whenever the result set changes (a new keystroke re-ran the search, producing a new array),
  // drop back to "nothing highlighted yet" — same convention TypeaheadInput uses, and the same
  // React-recommended way to do it: adjusted synchronously during render, not in an effect, so
  // there's no extra render where a stale/out-of-range index is still visible first.
  //
  // Compared by content, not by reference (`results !== lastResults`) — a caller that falls back
  // to an inline `[] `when nothing's been searched yet (e.g. `data?.results ?? []`) hands this a
  // brand new array every render even though nothing actually changed. Comparing by reference made
  // that "change" fire on every render forever — React's infinite-render guard then crashed the
  // whole app with no error boundary to catch it. Content comparison makes the reset genuinely
  // idempotent once the results stop actually changing.
  const [lastResults, setLastResults] = useState(results)
  const resultsChanged = results.length !== lastResults.length || results.some((r, i) => r !== lastResults[i])
  if (resultsChanged) {
    setLastResults(results)
    setHighlighted(-1)
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((i) => (i + 1 >= results.length ? 0 : i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((i) => (i <= 0 ? results.length - 1 : i - 1))
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault()
      onSelect(results[highlighted])
    }
  }

  return { highlighted, setHighlighted, handleKeyDown }
}
