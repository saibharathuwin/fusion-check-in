import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, LogOutIcon } from '../icons/NavIcons'

interface TopbarProps {
  name: string
  initials: string
  role: string
  onLogout: () => void
}

export function Topbar({ name, initials, role, onLogout }: TopbarProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

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
    <div className="relative flex flex-col items-end gap-1.5" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-2.5 rounded-full border-none bg-transparent p-0"
      >
        <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[#f4b400] text-[13px] font-bold text-[#0d1f39]">
          {initials}
        </div>
        <div className="flex flex-col leading-[1.3]">
          <span className="text-[14px] font-bold text-white">{name}</span>
          <span className="text-[12px] text-[#aab8cf]">{role}</span>
        </div>
        <span className={`text-[#aab8cf] [transition:transform_150ms_ease] ${open ? 'rotate-180' : ''}`}>
          <ChevronDownIcon size={16} />
        </span>
      </button>
      <span className="text-[12px] font-medium text-[#aab8cf]">{today}</span>

      {open && (
        <div className="absolute top-[calc(100%+8px)] right-0 z-30 min-w-[180px] overflow-hidden rounded-xl bg-white shadow-[0_12px_28px_rgba(15,40,74,0.16)]">
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
