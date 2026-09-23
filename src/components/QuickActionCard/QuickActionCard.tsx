import type { ReactNode } from 'react'
import { ChevronRightIcon } from '../icons/NavIcons'

interface QuickActionCardProps {
  icon: ReactNode
  title: string
  description: string
  theme: 'blue' | 'green'
  onClick?: () => void
  href?: string
  target?: string
}

const THEME_CLASSES: Record<QuickActionCardProps['theme'], { card: string; icon: string; chevron: string }> = {
  blue: { card: 'bg-[#eaf2fe]', icon: 'bg-[#d6e7fc] text-[#2f6fed]', chevron: 'text-[#2f6fed]' },
  green: { card: 'bg-[#e8f8f1]', icon: 'bg-[#d3f1e2] text-[#12a35c]', chevron: 'text-[#12a35c]' },
}

const BASE_CLASSES =
  'flex flex-1 items-center gap-4 rounded-2xl border-none px-[22px] py-5 text-left no-underline font-[inherit] cursor-pointer [transition:translate_150ms_ease,box-shadow_150ms_ease] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(15,40,74,0.08)]'

export function QuickActionCard({ icon, title, description, theme, onClick, href, target }: QuickActionCardProps) {
  const t = THEME_CLASSES[theme]

  const content = (
    <>
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${t.icon}`}>{icon}</div>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold text-[#12284a]">{title}</span>
        <span className="text-[13px] text-[#7c8aa0]">{description}</span>
      </div>
      <span className={`shrink-0 ${t.chevron}`}>
        <ChevronRightIcon size={20} />
      </span>
    </>
  )

  if (href) {
    return (
      <a
        href={href}
        target={target}
        rel={target === '_blank' ? 'noopener noreferrer' : undefined}
        className={`${BASE_CLASSES} ${t.card}`}
      >
        {content}
      </a>
    )
  }

  return (
    <button type="button" className={`${BASE_CLASSES} ${t.card}`} onClick={onClick}>
      {content}
    </button>
  )
}
