import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface ModalProps {
  open: boolean
  /** Accessible name for the overlay's dialog surface. */
  label: string
  onClose: () => void
  children: ReactNode
}

/** One overlay + one surface, the app's only popup container. Focus moves
    into the dialog while open; Escape and a backdrop click both close. */
export function Modal({ open, label, onClose, children }: ModalProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (open) {
      setEntered(false)
      const frame = window.setTimeout(() => setEntered(true), 16)
      surfaceRef.current?.focus()
      return () => clearTimeout(frame)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className={entered ? 'modal-overlay' : 'modal-overlay modal-overlay--entering'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={surfaceRef}        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="modal"
        style={{ outline: 'none' }}
      >
        <div className="modal__bar" aria-hidden="true" />
        {children}
      </div>
    </div>
  )
}
