import type { ReactNode } from 'react'
import { getInitials, getAvatarTheme, STATUS_COLORS, type Student, type AvatarTheme } from '../../pages/StudentDirectory/studentDirectoryData'

const AVATAR_THEME_CLASSES: Record<AvatarTheme, string> = {
  blue: 'bg-[#d6e7fc] text-[#2f6fed]',
  green: 'bg-[#d3f1e2] text-[#12a35c]',
  teal: 'bg-[#ccfbf1] text-[#0d9488]',
  purple: 'bg-[#e4dbfb] text-[#8b5cf6]',
  amber: 'bg-[#fff3d6] text-[#b3790a]',
  pink: 'bg-[#fde7f1] text-[#d13d82]',
}

interface StudentCardProps {
  student: Student
  onClick: () => void
  // Extra content specific to the calling list — e.g. a check-in time or a "late by" note — shown
  // below the student's own details, separated by a divider so it doesn't read as part of their
  // profile.
  trailing?: ReactNode
}

// The same card the Student Directory shows on mobile — reused here (and there) so every place a
// student appears as a tappable summary looks identical, and opens the same profile modal.
export function StudentCard({ student, onClick, trailing }: StudentCardProps) {
  return (
    <button
      type="button"
      className="box-border flex w-full flex-col items-start gap-2.5 rounded-2xl bg-white p-[18px] text-left font-[inherit] cursor-pointer shadow-[0_2px_10px_rgba(15,40,74,0.05)] [transition:translate_150ms_ease,box-shadow_150ms_ease] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(15,40,74,0.09)]"
      onClick={onClick}
    >
      <div className="flex w-full items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${AVATAR_THEME_CLASSES[getAvatarTheme(student.id)]}`}
          >
            {getInitials(student.fullName)}
          </div>
          <div className="flex flex-col">
            <span className="text-[15px] font-bold text-[#12284a]">{student.fullName}</span>
            <span className="text-[12px] font-semibold text-[#9aa6ba]">{student.id}</span>
          </div>
        </div>
        <span
          className="inline-flex shrink-0 items-center rounded-full px-2.5 py-[3px] text-[11px] font-bold"
          style={{ background: STATUS_COLORS[student.status].bg, color: STATUS_COLORS[student.status].text }}
        >
          {student.status}
        </span>
      </div>
      <div className="text-[13px] text-[#56617a]">{student.email}</div>
      <div className="text-[13px] text-[#56617a]">
        {student.faculty} &middot; {student.program}
      </div>
      <div className="text-[13px] text-[#56617a]">
        {student.level} &middot; {student.year}
      </div>
      {trailing && <div className="mt-1 w-full border-t border-[#f2f4f8] pt-2.5">{trailing}</div>}
    </button>
  )
}
