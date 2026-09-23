import { Link } from 'react-router-dom'
import { ChevronLeftIcon } from '../../components/icons/NavIcons'
import { AddStudentForm } from './AddStudentForm'

export function AddStudentPage() {
  return (
    <div className="box-border flex min-h-screen justify-center bg-[linear-gradient(180deg,#f4fdfc_0%,#f7f9fc_100%)] px-6 pt-14 pb-20 max-[601px]:px-4 max-[601px]:pt-9 max-[601px]:pb-15">
      <div className="flex w-full max-w-[640px] flex-col items-center gap-[22px]">
        <Link
          to="/students"
          className="inline-flex w-fit items-center gap-1 self-start text-[13.5px] font-semibold text-[#7c8aa0] no-underline [transition:color_150ms_ease] hover:text-[#2f6fed]"
        >
          <ChevronLeftIcon size={16} />
          Back to Students
        </Link>

        <AddStudentForm />
      </div>
    </div>
  )
}
