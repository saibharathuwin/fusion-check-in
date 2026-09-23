import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { rowActivationProps } from '../../lib/rowActivation'
import { SearchIcon, RefreshIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../../components/icons/NavIcons'
import { StudentCard } from '../../components/StudentCard/StudentCard'
import { FACULTIES, YEARS, LEVELS, type StudentLevel } from '../AddStudent/addStudentData'
import {
  fetchStudents,
  countAllStudents,
  getInitials,
  getAvatarTheme,
  STATUS_OPTIONS,
  STATUS_COLORS,
  type Student,
  type StudentStatus,
  type AvatarTheme,
} from './studentDirectoryData'
import { StudentProfileModal } from './StudentProfileModal'

const PAGE_SIZE = 10

const AVATAR_THEME_CLASSES: Record<AvatarTheme, string> = {
  blue: 'bg-[#d6e7fc] text-[#2f6fed]',
  green: 'bg-[#d3f1e2] text-[#12a35c]',
  teal: 'bg-[#ccfbf1] text-[#0d9488]',
  purple: 'bg-[#e4dbfb] text-[#8b5cf6]',
  amber: 'bg-[#fff3d6] text-[#b3790a]',
  pink: 'bg-[#fde7f1] text-[#d13d82]',
}

const FILTER_SELECT_CLASSES =
  'w-full rounded-[10px] border border-[#e2e6ee] bg-white px-3 py-[10px] text-[13.5px] font-semibold text-[#12284a] cursor-pointer [transition:border-color_150ms_ease] hover:border-[#c7d0e0] focus:border-[#0d9488] focus:outline-none'

const RESET_BTN_CLASSES =
  'inline-flex items-center gap-[7px] self-end rounded-[10px] border border-[#ccfbf1] bg-[#e5faf7] px-4 py-[10px] text-[13.5px] font-bold text-[#0d9488] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#ccfbf1] h-[41px]'

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-[150px] flex-col gap-[7px] max-[701px]:min-w-full max-[901px]:min-w-[47%] max-[901px]:flex-1">
      <span className="text-[11px] font-bold tracking-[0.6px] text-[#9aa6ba] uppercase">{label}</span>
      {children}
    </div>
  )
}

type PageItem = number | 'ellipsis-start' | 'ellipsis-end'

function getPageItems(current: number, total: number): PageItem[] {
  const siblingCount = 1
  const windowSize = siblingCount * 2 + 5 // first + last + current + siblings + both ellipses' worth of slack

  if (total <= windowSize) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const leftSibling = Math.max(current - siblingCount, 1)
  const rightSibling = Math.min(current + siblingCount, total)
  const showLeftEllipsis = leftSibling > 2
  const showRightEllipsis = rightSibling < total - 1

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftRange = Array.from({ length: 3 + siblingCount * 2 }, (_, i) => i + 1)
    return [...leftRange, 'ellipsis-end', total]
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    const rightCount = 3 + siblingCount * 2
    const rightRange = Array.from({ length: rightCount }, (_, i) => total - rightCount + i + 1)
    return [1, 'ellipsis-start', ...rightRange]
  }

  const middleRange = Array.from({ length: rightSibling - leftSibling + 1 }, (_, i) => leftSibling + i)
  return [1, 'ellipsis-start', ...middleRange, 'ellipsis-end', total]
}

export function StudentDirectoryPage() {
  const [studentIdQuery, setStudentIdQuery] = useState('')
  const [nameQuery, setNameQuery] = useState('')
  const [faculty, setFaculty] = useState('All')
  const [level, setLevel] = useState<StudentLevel | 'All'>('All')
  const [year, setYear] = useState('All')
  const [status, setStatus] = useState<StudentStatus | 'All'>('All')
  const [page, setPage] = useState(1)

  const [students, setStudents] = useState<Student[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [resultKey, setResultKey] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  // The unfiltered, app-wide student count — distinguishes "the database itself is empty" (offer
  // to add the first student) from "these filters just don't match anything" (offer to reset them).
  const [allStudentsCount, setAllStudentsCount] = useState<number | null>(null)
  useEffect(() => {
    countAllStudents().then(setAllStudentsCount)
  }, [])

  const filterKey = JSON.stringify({ studentIdQuery, nameQuery, faculty, level, year, status })
  const [lastFilterKey, setLastFilterKey] = useState(filterKey)
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey)
    setPage(1)
  }

  const requestKey = JSON.stringify({ page, studentIdQuery, nameQuery, faculty, level, year, status })
  const loading = requestKey !== resultKey

  useEffect(() => {
    let cancelled = false
    fetchStudents({ page, pageSize: PAGE_SIZE, studentIdQuery, nameQuery, faculty, level, year, status }).then((result) => {
      if (cancelled) return
      setStudents(result.students)
      setTotalCount(result.totalCount)
      setResultKey(requestKey)
    })
    return () => {
      cancelled = true
    }
  }, [requestKey, page, studentIdQuery, nameQuery, faculty, level, year, status])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = (currentPage - 1) * PAGE_SIZE + students.length

  function handleReset() {
    setStudentIdQuery('')
    setNameQuery('')
    setFaculty('All')
    setLevel('All')
    setYear('All')
    setStatus('All')
  }

  return (
    <div className="box-border flex min-h-screen justify-center bg-[linear-gradient(180deg,#f4fdfc_0%,#f7f9fc_100%)] px-6 pt-14 pb-20 max-[701px]:px-4 max-[701px]:pt-9 max-[701px]:pb-15">
      <div className="flex w-full max-w-[1240px] flex-col gap-[22px]">
        <Link
          to="/students"
          className="inline-flex w-fit items-center gap-1 text-[13.5px] font-semibold text-[#7c8aa0] no-underline [transition:color_150ms_ease] hover:text-[#2f6fed]"
        >
          <ChevronLeftIcon size={16} />
          Back to Students
        </Link>

        <h1 className="m-0 text-[30px] font-extrabold text-[#12284a] max-[701px]:text-2xl">Student Directory</h1>

        <div className="flex flex-wrap items-end gap-3.5 rounded-[18px] bg-white px-[22px] py-5 shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[901px]:gap-3">
          <FilterField label="Student Name">
            <div className="flex min-w-[200px] items-center gap-2 rounded-[10px] border border-[#e2e6ee] bg-white px-3 py-[10px] text-[#7c8aa0] [transition:border-color_150ms_ease] focus-within:border-[#0d9488]">
              <SearchIcon size={16} />
              <input
                type="text"
                aria-label="Search by student name"
                placeholder="Search by student name..."
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                className="flex-1 border-none text-[13.5px] text-[#12284a] outline-none"
              />
            </div>
          </FilterField>

          <FilterField label="Student ID">
            <div className="flex min-w-[200px] items-center gap-2 rounded-[10px] border border-[#e2e6ee] bg-white px-3 py-[10px] text-[#7c8aa0] [transition:border-color_150ms_ease] focus-within:border-[#0d9488]">
              <SearchIcon size={16} />
              <input
                type="text"
                aria-label="Search by student ID"
                placeholder="Search by student ID..."
                value={studentIdQuery}
                onChange={(e) => setStudentIdQuery(e.target.value)}
                className="flex-1 border-none text-[13.5px] text-[#12284a] outline-none"
              />
            </div>
          </FilterField>

          <FilterField label="Faculty">
            <select className={FILTER_SELECT_CLASSES} value={faculty} onChange={(e) => setFaculty(e.target.value)}>
              <option value="All">All</option>
              {FACULTIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Program Level">
            <select
              className={FILTER_SELECT_CLASSES}
              value={level}
              onChange={(e) => setLevel(e.target.value as StudentLevel | 'All')}
            >
              <option value="All">All</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Year">
            <select className={FILTER_SELECT_CLASSES} value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="All">All</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Status">
            <select
              className={FILTER_SELECT_CLASSES}
              value={status}
              onChange={(e) => setStatus(e.target.value as StudentStatus | 'All')}
            >
              <option value="All">All</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FilterField>

          <button
            type="button"
            className={`${RESET_BTN_CLASSES} max-[701px]:ml-0 max-[701px]:w-full max-[701px]:justify-center max-[901px]:ml-auto`}
            onClick={handleReset}
          >
            <RefreshIcon size={15} />
            Reset
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-4 rounded-[18px] bg-white px-5 py-[60px] text-center text-sm text-[#7c8aa0] shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
            Loading students&hellip;
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-[18px] bg-white px-5 py-[60px] text-center text-sm text-[#7c8aa0] shadow-[0_2px_10px_rgba(15,40,74,0.05)]">
            {allStudentsCount === 0 ? (
              <>
                <p className="m-0">No students yet.</p>
                <Link
                  to="/students/new"
                  target="_blank"
                  className="inline-flex items-center gap-[7px] rounded-[10px] border-none bg-[linear-gradient(120deg,#0d9488,#14b8a6)] px-5 py-2.5 text-[13.5px] font-bold text-white no-underline cursor-pointer [transition:transform_150ms_ease] hover:-translate-y-0.5"
                >
                  <PlusIcon size={14} />
                  Add your first student
                </Link>
              </>
            ) : (
              <>
                <p className="m-0">No students match your filters.</p>
                <button
                  type="button"
                  className="inline-flex items-center gap-[7px] rounded-[10px] border border-[#ccfbf1] bg-[#e5faf7] px-[18px] py-[10px] text-[13.5px] font-bold text-[#0d9488] cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#ccfbf1]"
                  onClick={handleReset}
                >
                  <RefreshIcon size={15} />
                  Reset filters
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-[18px] bg-white shadow-[0_2px_10px_rgba(15,40,74,0.05)] max-[701px]:hidden">
              <table className="w-full min-w-[980px] border-collapse">
                <thead>
                  <tr>
                    <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                      Student
                    </th>
                    <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                      First Name
                    </th>
                    <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                      Last Name
                    </th>
                    <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                      Email
                    </th>
                    <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                      Faculty
                    </th>
                    <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                      Program
                    </th>
                    <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                      Level &amp; Year
                    </th>
                    <th className="border-b border-[#eef1f6] px-[22px] py-4 text-left text-xs font-bold tracking-[0.4px] whitespace-nowrap text-[#9aa6ba] uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student, index) => {
                    const cellBorder = index === students.length - 1 ? '' : 'border-b border-[#f2f4f8]'
                    return (
                      <tr
                        key={student.id}
                        onClick={() => setSelectedStudent(student)}
                        {...rowActivationProps(() => setSelectedStudent(student))}
                        className="cursor-pointer [transition:background-color_150ms_ease] hover:bg-[#f7f9fc] focus-visible:bg-[#f7f9fc] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0d9488]"
                      >
                        <td className={`px-[22px] py-4 align-middle ${cellBorder}`}>
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${AVATAR_THEME_CLASSES[getAvatarTheme(student.id)]}`}
                            >
                              {getInitials(student.fullName)}
                            </div>
                            <span className="text-[12px] font-semibold whitespace-nowrap text-[#9aa6ba]">{student.id}</span>
                          </div>
                        </td>
                        <td className={`px-[22px] py-4 align-middle text-[13.5px] font-bold whitespace-nowrap text-[#12284a] ${cellBorder}`}>
                          {student.firstName}
                        </td>
                        <td className={`px-[22px] py-4 align-middle text-[13.5px] font-bold whitespace-nowrap text-[#12284a] ${cellBorder}`}>
                          {student.lastName}
                        </td>
                        <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>{student.email}</td>
                        <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>{student.faculty}</td>
                        <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>{student.program}</td>
                        <td className={`px-[22px] py-4 align-middle text-[13.5px] text-[#33415c] ${cellBorder}`}>
                          <div className="font-semibold text-[#12284a]">{student.level}</div>
                          <div className="mt-0.5 text-[12.5px] text-[#9aa6ba]">{student.year}</div>
                        </td>
                        <td className={`px-[22px] py-4 align-middle ${cellBorder}`}>
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-bold"
                            style={{ background: STATUS_COLORS[student.status].bg, color: STATUS_COLORS[student.status].text }}
                          >
                            {student.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="hidden flex-col gap-3 max-[701px]:flex">
              {students.map((student) => (
                <StudentCard key={student.id} student={student} onClick={() => setSelectedStudent(student)} />
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#7c8aa0] max-[701px]:justify-center max-[701px]:text-center">
              <span>
                Showing {rangeStart}&ndash;{rangeEnd} of {totalCount}
              </span>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                  className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-[#e2e6ee] bg-white text-[#12284a] cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] hover:not-disabled:bg-[#f2f5fa] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeftIcon size={16} />
                </button>

                {getPageItems(currentPage, totalPages).map((item, index) =>
                  typeof item === 'number' ? (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPage(item)}
                      aria-current={item === currentPage ? 'page' : undefined}
                      aria-label={`Page ${item}`}
                      className={`inline-flex h-[34px] min-w-[34px] items-center justify-center rounded-[9px] border px-1.5 text-[13px] font-semibold cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] ${
                        item === currentPage
                          ? 'border-[#0d9488] bg-[#0d9488] font-bold text-white hover:bg-[#0d9488]'
                          : 'border-[#e2e6ee] bg-white text-[#12284a] hover:bg-[#f2f5fa]'
                      }`}
                    >
                      {item}
                    </button>
                  ) : (
                    <span
                      key={`${item}-${index}`}
                      className="inline-flex h-[34px] w-5 items-center justify-center tracking-[1px] font-bold text-[#9aa6ba]"
                    >
                      &hellip;
                    </span>
                  ),
                )}

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                  className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-[#e2e6ee] bg-white text-[#12284a] cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] hover:not-disabled:bg-[#f2f5fa] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRightIcon size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <StudentProfileModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />
    </div>
  )
}
