import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, SettingsIcon, LogOutIcon } from '../icons/NavIcons'
import { openInNewTabWithSession } from '../../lib/newTabSession'

interface TopbarProps {
  name: string
  initials: string
  role: string
  onLogout: () => void
}

export function Topbar({ name, initials, role, onLogout }: TopbarProps) {
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

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent py-1.5 pr-2.5 pl-1.5 [transition:background-color_200ms_ease] hover:bg-[#f7f9fc]"
      >
        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#1d1d1f] text-[13px] font-bold text-white">
          {initials}
        </div>
        <div className="flex flex-col items-start leading-[1.25]">
          <span className="text-[13.5px] font-bold text-[#12284a]">{name}</span>
          <span className="text-[11.5px] text-[#9aa6ba]">{role}</span>
        </div>
        <span className={`text-[#9aa6ba] [transition:transform_150ms_ease] ${open ? 'rotate-180' : ''}`}>
          <ChevronDownIcon size={16} />
        </span>
      </button>

      {open && (
        <div className="absolute top-[calc(100%+8px)] right-0 z-30 min-w-[200px] overflow-hidden rounded-xl border border-[#eef1f6] bg-white shadow-[0_12px_28px_rgba(15,40,74,0.16)]">
          <div className="border-b border-[#eef1f6] px-4 py-3">
            <span className="block text-[13.5px] font-bold text-[#12284a]">{name}</span>
            <span className="block text-[12px] text-[#9aa6ba]">{role}</span>
          </div>
          {/* target="_blank" stays as a fallback for middle-click/Ctrl+click (their own native
              "open in background tab" gesture) and for older browsers/no-JS — see
              openInNewTabWithSession's own comment for why a plain click is instead handled in
              JS via window.open(), which is what actually makes this land signed in when "Stay
              signed in" is unchecked (confirmed: a plain target="_blank" click alone doesn't
              reliably carry a sessionStorage-based session into the new tab, particularly in
              Incognito). */}
          <a
            href="/settings"
            target="_blank"
            onClick={(e) => {
              setOpen(false)
              openInNewTabWithSession(e, '/settings')
            }}
            className="flex w-full items-center gap-2.5 border-none bg-transparent px-4 py-3 text-left text-[13.5px] font-semibold text-[#33415c] no-underline cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f2f5fa]"
          >
            <SettingsIcon size={15} />
            Settings
          </a>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
            className="flex w-full items-center gap-2.5 border-none bg-transparent px-4 py-3 text-left text-[13.5px] font-semibold text-[#d1453d] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#fde8e8]"
          >
            <LogOutIcon size={15} />
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
