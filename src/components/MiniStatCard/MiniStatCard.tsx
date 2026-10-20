interface MiniStatCardProps {
  count: number
  label: string
  theme: 'blue' | 'green' | 'amber' | 'purple'
}

const THEME_CLASSES: Record<MiniStatCardProps['theme'], string> = {
  blue: 'bg-[#eaf2fe] border-[#dbe9fc]',
  green: 'bg-[#e8f8f1] border-[#d3f1e2]',
  amber: 'bg-[#fff8e1] border-[#fbedc0]',
  purple: 'bg-[#f1edfd] border-[#e4dbfb]',
}

export function MiniStatCard({ count, label, theme }: MiniStatCardProps) {
  return (
    <div
      className={`flex min-w-[140px] flex-1 flex-col gap-1 rounded-2xl border px-6 py-[22px] [transition:translate_150ms_ease,box-shadow_150ms_ease] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(15,40,74,0.07)] ${THEME_CLASSES[theme]}`}
    >
      <span className="text-[28px] leading-[1.1] font-extrabold text-[#12284a]">{count}</span>
      <span className="text-[13px] font-semibold text-[#7c8aa0]">{label}</span>
    </div>
  )
}
