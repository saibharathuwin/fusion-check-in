import type { ReactNode } from 'react'

interface PillProps {
  bg: string
  text: string
  children: ReactNode
}

export function Pill({ bg, text, children }: PillProps) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-3 py-[5px] text-[12.5px] leading-[1.3] font-bold"
      style={{ background: bg, color: text }}
    >
      {children}
    </span>
  )
}
