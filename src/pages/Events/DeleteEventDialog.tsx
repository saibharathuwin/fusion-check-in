import { useEffect, useState } from 'react'
import { Modal } from '../../components/Modal/Modal'
import { deleteEvent, getEventDeleteImpact, EventDeleteBlockedError, type EventDeleteImpact, type EventItem } from './eventsData'

interface DeleteEventDialogProps {
  event: EventItem | null
  onClose: () => void
  onDeleted: (id: string) => void
}

// Keyed by event.id in the parent so switching targets (or reopening after an error) always
// starts from fresh state, instead of reaching for effect-based resets.
function DeleteEventDialogContent({ event, onClose, onDeleted }: { event: EventItem; onClose: () => void; onDeleted: (id: string) => void }) {
  const [impact, setImpact] = useState<EventDeleteImpact | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getEventDeleteImpact(event.id).then(setImpact)
  }, [event.id])

  async function handleConfirm() {
    setDeleting(true)
    setError('')
    try {
      await deleteEvent(event.id)
      onDeleted(event.id)
      onClose()
    } catch (err) {
      setDeleting(false)
      if (err instanceof EventDeleteBlockedError) {
        setError(
          `${err.message} Check-in history isn't removed automatically — switch this event's status to Completed instead, or contact an administrator if it really needs to go.`,
        )
      } else {
        setError('Something went wrong deleting this event. Please try again.')
      }
    }
  }

  const blocked = (impact?.checkInCount ?? 0) > 0

  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-lg font-extrabold text-[#12284a]">Delete this event?</h2>

      {!impact ? (
        <p className="m-0 text-sm text-[#56617a]">Checking related records&hellip;</p>
      ) : blocked ? (
        <p className="m-0 text-sm text-[#d1453d]">
          <strong>{event.program}</strong> has {impact.checkInCount} recorded check-in{impact.checkInCount === 1 ? '' : 's'} and
          can&rsquo;t be deleted. Check-in history isn&rsquo;t removed automatically &mdash; switch this event&rsquo;s status to
          Completed instead, or contact an administrator if it really needs to go.
        </p>
      ) : (
        <p className="m-0 text-sm text-[#56617a]">
          This permanently deletes <strong>{event.program}</strong>
          {impact.sessionCount > 0 && `, its ${impact.sessionCount} check-in session${impact.sessionCount === 1 ? '' : 's'}`}
          {impact.enrollmentCount > 0 && `, and ${impact.enrollmentCount} student enrollment${impact.enrollmentCount === 1 ? '' : 's'}`}
          . This can&rsquo;t be undone.
        </p>
      )}

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
          {blocked ? 'Close' : 'Cancel'}
        </button>
        {!blocked && (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!impact || deleting}
            className="rounded-[10px] border-none bg-[#d1453d] px-5 py-2.5 text-[13.5px] font-bold text-white cursor-pointer [transition:background-color_150ms_ease,opacity_150ms_ease] hover:not-disabled:bg-[#b93a33] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete event'}
          </button>
        )}
      </div>
    </div>
  )
}

export function DeleteEventDialog({ event, onClose, onDeleted }: DeleteEventDialogProps) {
  // Keeps rendering the last real event while the modal fades out (event goes null right away on
  // close), so the dialog's content doesn't vanish mid-animation — same pattern Modal.tsx itself
  // uses for its own open/rendered/visible state.
  const [displayEvent, setDisplayEvent] = useState<EventItem | null>(event)
  if (event && event !== displayEvent) setDisplayEvent(event)

  return (
    <Modal open={!!event} onClose={onClose}>
      {displayEvent && <DeleteEventDialogContent key={displayEvent.id} event={displayEvent} onClose={onClose} onDeleted={onDeleted} />}
    </Modal>
  )
}
