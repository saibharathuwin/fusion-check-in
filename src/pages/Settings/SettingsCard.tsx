import type { ReactNode } from 'react'

interface SettingsCardProps {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}

// One "card" of settings content — a bordered white panel with its own header line, reused by
// every tab so new settings sections stay visually consistent without re-deriving the wrapper.
export function SettingsCard({ title, description, actions, children }: SettingsCardProps) {
  return (
    <div className="overflow-hidden rounded-[18px] bg-white shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-2.5 border-b border-[#eef1f6] px-[22px] py-4">
        <div>
          <h3 className="m-0 text-[15px] font-extrabold text-[#1d1d1f]">{title}</h3>
          {description && <p className="m-0 mt-1 text-[13px] text-[#6b7a94]">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
