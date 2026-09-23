import { useState, type ReactNode } from 'react'
import { Modal } from '../../components/Modal/Modal'
import { getInitials, getAvatarTheme, STATUS_COLORS, type Student, type AvatarTheme } from './studentDirectoryData'

interface StudentProfileModalProps {
  student: Student | null
  onClose: () => void
}

const AVATAR_THEME_CLASSES: Record<AvatarTheme, string> = {
  blue: 'bg-[#d6e7fc] text-[#2f6fed]',
  green: 'bg-[#d3f1e2] text-[#12a35c]',
  teal: 'bg-[#ccfbf1] text-[#0d9488]',
  purple: 'bg-[#e4dbfb] text-[#8b5cf6]',
  amber: 'bg-[#fff3d6] text-[#b3790a]',
  pink: 'bg-[#fde7f1] text-[#d13d82]',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[#f2f4f8] py-2.5 last:border-b-0">
      <dt className="text-xs font-bold tracking-[0.3px] whitespace-nowrap text-[#9aa6ba] uppercase">{label}</dt>
      <dd className="m-0 text-right text-[13.5px] font-semibold text-[#12284a]">{value}</dd>
    </div>
  )
}

export function StudentProfileModal({ student, onClose }: StudentProfileModalProps) {
  const open = student !== null
  const [displayStudent, setDisplayStudent] = useState(student)
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setDisplayStudent(student)
  }

  return (
    <Modal open={open} onClose={onClose}>
      {displayStudent && (
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div
            className={`mb-1 flex h-16 w-16 items-center justify-center rounded-full text-[22px] font-extrabold ${AVATAR_THEME_CLASSES[getAvatarTheme(displayStudent.id)]}`}
          >
            {getInitials(displayStudent.fullName)}
          </div>
          <h2 className="m-0 text-[19px] font-extrabold text-[#12284a]">{displayStudent.fullName}</h2>
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold"
            style={{
              background: STATUS_COLORS[displayStudent.status].bg,
              color: STATUS_COLORS[displayStudent.status].text,
            }}
          >
            {displayStudent.status}
          </span>

          <dl className="mt-[18px] w-full border-t border-[#eef1f6] pt-[18px] text-left">
            <Row label="Student Number" value={displayStudent.id} />
            <Row label="Email" value={displayStudent.email} />
            <Row label="Faculty" value={displayStudent.faculty} />
            <Row label="Program" value={displayStudent.program} />
            <Row label="Level" value={displayStudent.level} />
            <Row label="Year" value={displayStudent.year} />
            <Row label="Joined" value={formatDate(displayStudent.dateJoined)} />
          </dl>
        </div>
      )}
    </Modal>
  )
}
