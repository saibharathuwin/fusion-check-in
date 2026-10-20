import type { ReactNode } from 'react'
import { ChevronRightIcon } from '../icons/NavIcons'

interface StatCardProps {
  icon: ReactNode
  count: number
  label: string
  description: string
  theme: 'blue' | 'purple'
  onClick?: () => void
}

const THEME_CLASSES: Record<StatCardProps['theme'], { card: string; icon: string; chevron: string }> = {
  blue: { card: 'bg-[#e9f2fe]', icon: 'bg-[#d6e7fc] text-[#2f6fed]', chevron: 'text-[#2f6fed]' },
  purple: { card: 'bg-[#f1edfd]', icon: 'bg-[#e4dbfb] text-[#8b5cf6]', chevron: 'text-[#8b5cf6]' },
}

export function StatCard({ icon, count, label, description, theme, onClick }: StatCardProps) {
  const t = THEME_CLASSES[theme]
  return (
    <button
      type="button"
      className={`flex flex-1 items-center gap-[18px] rounded-[18px] border-none px-[26px] py-6 text-left font-[inherit] cursor-pointer [transition:translate_150ms_ease,box-shadow_150ms_ease] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(15,40,74,0.08)] ${t.card}`}
      onClick={onClick}
    >
      <div className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full ${t.icon}`}>{icon}</div>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-[30px] leading-[1.1] font-extrabold text-[#12284a]">{count}</span>
        <span className="text-[15px] font-bold text-[#12284a]">{label}</span>
        <span className="text-[13px] text-[#7c8aa0]">{description}</span>
      </div>
      <span className={`shrink-0 ${t.chevron}`}>
        <ChevronRightIcon size={20} />
      </span>
    </button>
  )
}
