import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from '../icons/NavIcons'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  // 'default' fits a short confirmation or a read-only profile; 'lg' gives a modal with its own
  // search box and scrollable results room to breathe (see LiveMonitorView's manual check-in) —
  // wider, and with more padding around the content.
  size?: 'default' | 'lg'
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

const PANEL_SIZE_CLASSES = {
  default: 'max-w-[440px] p-7 max-[561px]:p-[22px]',
  lg: 'max-w-[560px] p-9 max-[561px]:p-6',
}

export function Modal({ open, onClose, children, size = 'default' }: ModalProps) {
  const [rendered, setRendered] = useState(open)
  const [visible, setVisible] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  const panelRef = useRef<HTMLDivElement>(null)
  // Where focus was before the modal opened — restored on close so, e.g., dismissing a delete
  // confirmation lands keyboard focus back on the row's own Delete button, not the document body.
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setRendered(true)
    } else {
      setVisible(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    return () => cancelAnimationFrame(raf)
  }, [open])

  // Moves focus into the panel the moment it opens and restores it to whatever had focus
  // beforehand on close. Without this, Tab/Enter have nothing of the modal's own to land on —
  // focus stays wherever it was on the page behind it, which reads as the modal not responding to
  // the keyboard at all. Prefers the first focusable element among the modal's own content over
  // its generic Close button (which is first in DOM order but rarely the useful default — a
  // search field or a dialog's Cancel button is), falling back to Close only when content has
  // nothing focusable of its own. A field that set its own `autoFocus` already got focus by the
  // time this runs, so this is a no-op for it rather than a fight over which element wins.
  useEffect(() => {
    if (!open) return
    lastFocusedRef.current = document.activeElement as HTMLElement | null
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      if (panel.contains(document.activeElement) && document.activeElement !== panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      const first = focusable.find((el) => !el.hasAttribute('data-modal-close')) ?? focusable[0]
      ;(first ?? panel).focus()
    })
    return () => {
      cancelAnimationFrame(raf)
      lastFocusedRef.current?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      // Keeps Tab cycling within the modal's own controls rather than escaping into the page
      // behind it, which is still technically focusable while covered.
      if (e.key === 'Tab') {
        const panel = panelRef.current
        if (!panel) return
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  function handlePanelTransitionEnd() {
    if (!open) setRendered(false)
  }

  if (!rendered) return null

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-5 [transition:background-color_200ms_ease,backdrop-filter_200ms_ease] ${
        visible ? 'bg-[rgba(10,20,38,0.45)] backdrop-blur-[6px]' : 'bg-[rgba(10,20,38,0)] backdrop-blur-none'
      }`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative max-h-[80vh] w-full overflow-y-auto rounded-[18px] bg-white shadow-[0_20px_50px_rgba(15,40,74,0.25)] [transition:opacity_200ms_ease,scale_200ms_ease] max-[561px]:max-w-full focus:outline-none ${PANEL_SIZE_CLASSES[size]} ${
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
        onTransitionEnd={handlePanelTransitionEnd}
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          data-modal-close
          className="absolute top-4 right-4 inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border-none bg-transparent text-[#9aa6ba] cursor-pointer [transition:background-color_150ms_ease,color_150ms_ease] hover:bg-[#f2f5fa] hover:text-[#56617a]"
          onClick={onClose}
          aria-label="Close"
        >
          <XIcon size={16} />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  )
}
