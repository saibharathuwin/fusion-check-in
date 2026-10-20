import { Link } from 'react-router-dom'
import { ChevronRightIcon } from '../../components/icons/NavIcons'
import type { InviteePeriod } from '../../data/inviteePeriods'
import type { Student } from '../StudentDirectory/studentDirectoryData'

export interface DroppedEntry {
  student: Student
  drop: InviteePeriod
  // Already worded for display, e.g. "Entire event" or "Day 2 – Morning · Oct 6".
  fromLabel: string
}

const CARD_CLASSES =
  'flex flex-col gap-4 rounded-2xl border border-[#eef1f6] bg-white p-6 shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[641px]:p-5'

export function DroppedStudentsCard({ rows, listHref }: { rows: DroppedEntry[]; listHref: string }) {
  return (
    <section className={CARD_CLASSES} aria-labelledby="dropped-students-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="dropped-students-heading" className="m-0 text-[15px] font-extrabold text-[#0e1c3a]">
            Dropped students
          </h2>
          <p className="m-0 mt-0.5 text-[12.5px] text-[#7c8aa0]">Not expected at this session or later</p>
        </div>
        <span className="rounded-full bg-[#fff8e1] px-2.5 py-1 text-[12.5px] font-extrabold text-[#a0740f]">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <p className="m-0 rounded-[12px] bg-[#f7f9fc] px-4 py-6 text-center text-[13px] text-[#7c8aa0]">
          Nobody has been dropped for this session.
        </p>
      ) : (
        <ul
          aria-label="Dropped students"
          tabIndex={0}
          className="m-0 flex max-h-[420px] list-none flex-col gap-2 overflow-y-auto p-0 pr-1 focus-visible:outline-2 focus-visible:outline-[#0d9488]"
        >
          {rows.map(({ student, drop, fromLabel }) => (
            <li key={drop.id} className="flex flex-col gap-1 rounded-[12px] border border-[#eef1f6] bg-[#fbfcfe] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] font-bold text-[#1d1d1f]">{student.fullName}</span>
                  <span className="truncate text-[12px] text-[#7c8aa0]">{student.program}</span>
                </div>
                <span className="shrink-0 rounded-full bg-[#eef1f6] px-2.5 py-0.5 text-[11.5px] font-bold text-[#56617a]">{drop.reason}</span>
              </div>
              <span className="text-[12px] text-[#7c8aa0]">From {fromLabel}</span>
              {drop.note && <span className="text-[12px] text-[#56617a]">{drop.note}</span>}
            </li>
          ))}
        </ul>
      )}

      <Link
        to={listHref}
        className="mt-1 inline-flex w-fit items-center gap-1 text-[13px] font-bold text-[#0f766e] no-underline [transition:gap_150ms_ease] hover:gap-1.5"
      >
        See who's dropped
        <ChevronRightIcon size={14} />
      </Link>
    </section>
  )
}
