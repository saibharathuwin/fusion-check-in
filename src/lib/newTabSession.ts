import type { MouseEvent } from 'react'
import { copySessionIntoNewWindow } from './supabaseClient'

// Opens a same-origin link in a new tab with the current session copied directly into it — see
// copySessionIntoNewWindow's own comment in supabaseClient.ts for why a plain <a target="_blank">
// alone isn't reliable enough on its own (specifically in Incognito).
//
// Only takes over a plain left-click. Middle-click, Ctrl/Cmd+click, and Shift+click each have
// their own native "open in a new/background tab" meaning that would be wrong to hijack — those
// are left to the browser's own default anchor behavior, which still works fine whenever "Stay
// signed in" is checked (a localStorage-backed session needs no help crossing tabs), and is an
// accepted, narrow gap for the unchecked case on those specific gestures.
export function openInNewTabWithSession(e: MouseEvent, href: string): void {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  const newWindow = window.open(href, '_blank')
  if (newWindow) copySessionIntoNewWindow(newWindow)
}
