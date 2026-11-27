import { useEffect, useId, useState } from 'react'
import { Button } from '../atoms/Button'
import { Icon } from '../atoms/Icon'
import { EXPORT_FORMATS, type ExportFormat } from '../../lib/tableExport'

export interface ExportMenuButtonProps {
  label: string
  /** Stated in the menu (and as the trigger's description) so the admin
      knows what the file will contain before choosing a format. */
  note: string
  /** The page's export for the chosen format; awaited so the trigger shows
      the pending download. Failures surface through the page's toast. */
  onExport: (format: ExportFormat) => Promise<void>
}

/** The admin tables' download trigger: one button opening a format menu
    (CSV, Excel, PDF) headed by a note about what the export covers. */
export function ExportMenuButton({ label, note, onExport }: ExportMenuButtonProps) {
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const noteId = useId()

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open])

  async function choose(format: ExportFormat): Promise<void> {
    setOpen(false)
    setExporting(true)
    try {
      await onExport(format)
    } finally {
      setExporting(false)
    }
  }

  return (
    <span className="export-menu">
      <Button
        variant="ghost"
        size="sm"
        busy={exporting}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-describedby={noteId}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
        <Icon name="chevron-down" size={12} />
      </Button>
      <span id={noteId} className="sr-only">
        {note}
      </span>
      {open ? (
        <>
          <div
            className="popover-backdrop"
            role="presentation"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div className="export-menu__panel" role="menu" aria-label={`${label} formats`}>
            <p className="export-menu__note">
              <Icon name="info" size={14} />
              <span>{note}</span>
            </p>
            {EXPORT_FORMATS.map(({ format, label: formatLabel }) => (
              <button
                key={format}
                type="button"
                role="menuitem"
                className="export-menu__option"
                onClick={() => void choose(format)}
              >
                {formatLabel}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </span>
  )
}
