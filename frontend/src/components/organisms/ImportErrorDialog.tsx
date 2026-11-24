import { Button } from '../atoms/Button'
import { Modal } from '../molecules/Modal'
import type { RosterRowError } from '../../lib/types'

export interface ImportErrorDialogProps {
  open: boolean
  detail: string
  rowErrors: RosterRowError[]
  onDismiss: () => void
}

/** Every validation failure of one upload in a single popup — the backend
    rejects the whole file, so the admin fixes all of them before re-trying. */
export function ImportErrorDialog({ open, detail, rowErrors, onDismiss }: ImportErrorDialogProps) {
  return (
    <Modal open={open} label="Import failed" onClose={onDismiss}>
      <div className="modal__body">
        <p style={{ marginBottom: '12px' }}>{detail}</p>
        {rowErrors.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Line</th>
                <th scope="col">Problem</th>
              </tr>
            </thead>
            <tbody>
              {rowErrors.map((rowError) => (
                <tr key={`${rowError.line}-${rowError.message}`}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                    {rowError.line}
                  </td>
                  <td>{rowError.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <p style={{ marginTop: '12px', color: 'var(--ink-3)' }}>
          {rowErrors.length > 0
            ? 'Nothing was changed on the Users page — fix the file and upload it again.'
            : 'Nothing was changed on the Users page.'}
        </p>
      </div>
      <div className="modal__actions">
        <Button variant="primary" onClick={onDismiss}>
          Close
        </Button>
      </div>
    </Modal>
  )
}
