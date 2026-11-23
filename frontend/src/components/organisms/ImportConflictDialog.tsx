import { useState } from 'react'
import { Button } from '../atoms/Button'
import { Modal } from '../molecules/Modal'
import { SegmentedFilter } from '../molecules/SegmentedFilter'
import type { Employee, RosterConflict } from '../../lib/types'

/** Wire field names the backend reports as changed (camelCase of
    schemas.employee.ROSTER_ATTRIBUTES), with their display titles in roster
    column order; new uploads only ever report these. */
const FIELD_TITLES: Record<string, string> = {
  name: 'Name',
  email: 'Email',
  designation: 'Designation',
  location: 'Location',
  org: 'Org',
  project: 'Current Account / Project',
  deliveryHead: 'Delivery Head',
  deliveryManager: 'Delivery Manager',
  businessPartner: 'Business Partner',
  reportingManager: 'Reporting Manager',
  status: 'Status',
}

type Decision = 'keep' | 'update'

const DECISION_OPTIONS: ReadonlyArray<{ value: Decision; label: string }> = [
  { value: 'keep', label: 'Keep' },
  { value: 'update', label: 'Update' },
]

export interface ImportConflictDialogProps {
  open: boolean
  conflicts: RosterConflict[]
  importSummary: string
  onConfirm: (updates: Employee[]) => void
  onDismiss: () => void
}

type ChangedRow = { title: string; from: string; to: string }

function changedRows(conflict: RosterConflict): ChangedRow[] {
  return Object.entries(FIELD_TITLES)
    .filter(([field]) => conflict.changedFields.includes(field))
    .map(([field, title]) => ({
      title,
      from: String(conflict.existing[field as keyof Employee]),
      to: String(conflict.incoming[field as keyof Employee]),
    }))
}

/** Stored vs incoming side by side for every collided row; the admin chooses
    per row — rows left on Keep are simply not sent, so they stay as they are. */
export function ImportConflictDialog({
  open,
  conflicts,
  importSummary,
  onConfirm,
  onDismiss,
}: ImportConflictDialogProps) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})

  const updateCount = conflicts.filter((conflict) => decisions[conflict.employeeId] === 'update').length
  const allUpdate = conflicts.length > 0 && updateCount === conflicts.length
  const decisionFor = (employeeId: string): Decision => decisions[employeeId] ?? 'keep'

  function setAll(decision: Decision): void {
    const next: Record<string, Decision> = {}
    for (const conflict of conflicts) {
      next[conflict.employeeId] = decision
    }
    setDecisions(next)
  }

  function confirm(): void {
    onConfirm(
      conflicts
        .filter((conflict) => decisionFor(conflict.employeeId) === 'update')
        .map((conflict) => conflict.incoming),
    )
  }

  return (
    <Modal open={open} label="Employees already exist" onClose={onDismiss}>
      <div className="modal__body">
        <p style={{ marginBottom: '12px' }}>{importSummary}</p>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Employee</th>
              <th scope="col">Current</th>
              <th scope="col">Incoming</th>
              <th scope="col">Decision</th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((conflict) => {
              const rows = changedRows(conflict)
              return (
                <tr key={conflict.employeeId}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{conflict.incoming.name}</div>
                    <div className="mono" style={{ color: 'var(--ink-3)', fontSize: '10.5px' }}>
                      {conflict.employeeId}
                    </div>
                  </td>
                  <td>
                    {rows.length === 0 ? (
                      <span style={{ color: 'var(--ink-3)' }}>record unchanged</span>
                    ) : (
                      rows.map((row) => (
                        <div key={row.title}>
                          <span style={{ color: 'var(--ink-2)' }}>{row.title}</span> {row.from}
                        </div>
                      ))
                    )}
                  </td>
                  <td>
                    {rows.length === 0 ? (
                      <span style={{ color: 'var(--ink-3)' }}>no field change</span>
                    ) : (
                      rows.map((row) => (
                        <div key={row.title}>
                          <span style={{ color: 'var(--ink-2)' }}>{row.title}</span>{' '}
                          <span style={{ color: 'var(--red-deep)' }}>{row.from}</span> → {row.to}
                        </div>
                      ))
                    )}
                  </td>
                  <td>
                    <SegmentedFilter
                      ariaLabel={`Decision for ${conflict.incoming.name}`}
                      value={decisionFor(conflict.employeeId)}
                      options={DECISION_OPTIONS}
                      onChange={(decision) =>
                        setDecisions((current) => ({ ...current, [conflict.employeeId]: decision }))
                      }
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p style={{ marginTop: '12px', color: 'var(--ink-3)' }}>
          {conflicts.length === 0
            ? 'Employees with the same employee ID stay exactly as they are.'
            : `${conflicts.length - updateCount} ${
                conflicts.length - updateCount === 1 ? 'row stays' : 'rows stay'
              }, ${updateCount === 1 ? '1 employee is updated' : `${updateCount} employees are updated`}.`}
        </p>
      </div>
      <div className="modal__actions">
        <Button variant="ghost" onClick={() => setAll('update')} disabled={allUpdate}>
          Update all
        </Button>
        <Button variant="ghost" onClick={onDismiss}>
          Cancel
        </Button>
        <Button variant="primary" onClick={confirm}>
          Apply changes
        </Button>
      </div>
    </Modal>
  )
}
