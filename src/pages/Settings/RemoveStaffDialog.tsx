import { useState } from 'react'
import { Modal } from '../../components/Modal/Modal'
import { removeStaffUser, type StaffRosterRow } from './staffRosterData'

interface RemoveStaffDialogProps {
  staffMember: StaffRosterRow | null
  onClose: () => void
  onRemoved: (id: string) => void
}

function RemoveStaffDialogContent({
  staffMember,
  onClose,
  onRemoved,
}: {
  staffMember: StaffRosterRow
  onClose: () => void
  onRemoved: (id: string) => void
}) {
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    setRemoving(true)
    setError('')
    try {
      await removeStaffUser(staffMember.id)
      onRemoved(staffMember.id)
      onClose()
    } catch {
      setRemoving(false)
      setError('Something went wrong removing this account. Please try again.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-lg font-extrabold text-[#1d1d1f]">Remove this account?</h2>

      <p className="m-0 text-sm text-[#56617a]">
        This removes <strong>{staffMember.fullName}</strong>&rsquo;s ({staffMember.email}) access to this app. Their Supabase Auth
        login itself isn&rsquo;t deleted. They just won&rsquo;t be recognized as Fusion staff anymore. Any check-ins they&rsquo;ve
        already recorded are kept exactly as they are.
      </p>

      {error && (
        <div className="rounded-[10px] border border-[#f8c9c9] bg-[#fde8e8] px-3.5 py-3 text-[13px] font-semibold text-[#d1453d]">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-[10px] border-none bg-transparent px-[18px] py-2.5 text-[13.5px] font-bold text-[#7c8aa0] cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] hover:bg-[#f2f5fa] hover:text-[#56617a]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={removing}
          className="rounded-[10px] border-none bg-[#d1453d] px-5 py-2.5 text-[13.5px] font-bold text-white cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] hover:not-disabled:bg-[#b93a33] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {removing ? 'Removing…' : 'Remove access'}
        </button>
      </div>
    </div>
  )
}

export function RemoveStaffDialog({ staffMember, onClose, onRemoved }: RemoveStaffDialogProps) {
  const [displayed, setDisplayed] = useState<StaffRosterRow | null>(staffMember)
  if (staffMember && staffMember !== displayed) setDisplayed(staffMember)

  return (
    <Modal open={!!staffMember} onClose={onClose}>
      {displayed && <RemoveStaffDialogContent key={displayed.id} staffMember={displayed} onClose={onClose} onRemoved={onRemoved} />}
    </Modal>
  )
}
