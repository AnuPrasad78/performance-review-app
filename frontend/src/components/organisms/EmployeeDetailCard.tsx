import { useState } from 'react'
import { Modal } from '../molecules/Modal'
import { FormField } from '../molecules/FormField'
import { Input } from '../atoms/Input'
import { Button } from '../atoms/Button'
import { EMPLOYEE_FIELD_TITLES } from '../../lib/employeeTitles'
import { ROSTER_CSV } from '../../lib/rosterCsv'
import type {
  Employee,
  EmployeePatch,
  EmployeePatchResult,
  FormStatus,
} from '../../lib/types'

/** The profile popup carries the whole roster record; the identity block
    already shows name and email, so the grid skips those three and holds
    the rest in the roster CSV's column order with Status — the read view.
    The same fields minus Status are the edit form's inputs, in the order
    the CSV stores them. */
const PROFILE_FIELDS: ReadonlyArray<Exclude<keyof Employee, 'status'>> = ROSTER_CSV.filter(
  ({ field }) => field !== 'name' && field !== 'email' && field !== 'status',
).map(({ field }) => field) as ReadonlyArray<Exclude<keyof Employee, 'status'>>

const EDITABLE_FIELDS = [
  'employeeId',
  'name',
  'email',
  ...PROFILE_FIELDS.filter((field) => field !== 'employeeId'),
] as const satisfies readonly Exclude<keyof Employee, 'status'>[]

const FORM_STATUS_LABELS: Record<FormStatus, string> = {
  pending: 'Pending',
  completed: 'Completed',
}

export interface EmployeeDetailCardProps {
  employee: Employee
  onClose: () => void
  /** The review's form status as the owning page read it — the card shows
      the field only when the page passes it (the review board's card), so a
      roster-only popup never dabbles in the review's nouns. null renders
      the em dash of an unread probe. */
  formStatus?: FormStatus | null
  /** The download-seam pair the owning organism wires when the card may
      serve its review PDF: shown only while the review is completed. */
  reviewCompleted?: boolean
  onDownloadReview?: () => void
  reviewBusy?: boolean
  /** The admin's field-save seam: when wired, the actions carry an Edit
      button that swaps the grid for the patch form. The returned row keeps
      the form's identity changes and the caller's selection in step. */
  onSaveEmployee?: (patch: EmployeePatch) => Promise<EmployeePatchResult>
  saveBusy?: boolean
}

/** The keystrokes the form holds: an absent key reads the card's employee,
    a present key is what the admin typed — '' outranks the stored word. */
type Draft = Partial<Record<Exclude<keyof Employee, 'status'>, string>>

export function EmployeeDetailCard({
  employee,
  onClose,
  formStatus = undefined,
  reviewCompleted = false,
  onDownloadReview,
  reviewBusy = false,
  onSaveEmployee,
  saveBusy = false,
}: EmployeeDetailCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>({})

  function draftValue(field: keyof Draft): string {
    return draft[field] ?? employee[field]
  }

  const patch = changedFields()
  const dirty = Object.keys(patch).length > 0
  const editable = onSaveEmployee !== undefined && !saveBusy

  function changedFields(): EmployeePatch {
    const pending: EmployeePatch = {}
    for (const field of EDITABLE_FIELDS) {
      const typed = draft[field]
      if (typed !== undefined && typed !== employee[field]) {
        pending[field] = typed
      }
    }
    return pending
  }

  async function save(): Promise<void> {
    if (onSaveEmployee === undefined) return
    const result = await onSaveEmployee(patch)
    if (result.ok) {
      setEditing(false)
      setDraft({})
    }
  }

  function cancel(): void {
    setEditing(false)
    setDraft({})
  }

  return (
    <Modal open label={`More about ${employee.name}`} onClose={onClose}>
      <div className="modal__body">
        <p className="eyebrow">More about</p>
        <h3 className="profile__name">{employee.name}</h3>
        <span className="profile__email muted">{employee.email}</span>
        {editing ? (
          <div className="details-grid employee-detail-grid">
            {EDITABLE_FIELDS.map((field) => (
              <FormField key={field} id={`employee-edit-${field}`} label={EMPLOYEE_FIELD_TITLES[field]} required={field === 'name' || field === 'email' || field === 'employeeId'}>
                <Input
                  id={`employee-edit-${field}`}
                  type={field === 'joiningDate' ? 'date' : undefined}
                  value={draftValue(field)}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [field]: event.target.value }))
                  }
                />
              </FormField>
            ))}
          </div>
        ) : (
          <div className="details-grid employee-detail-grid">
            {formStatus !== undefined ? (
              <div className="field">
                <span className="field__label">Form status</span>
                <span className="employee-detail__value">
                  {formStatus === null ? '—' : FORM_STATUS_LABELS[formStatus]}
                </span>
              </div>
            ) : null}
            {PROFILE_FIELDS.map((field) => (
              <div key={field} className="field">
                <span className="field__label">{EMPLOYEE_FIELD_TITLES[field]}</span>
                <span className="employee-detail__value">
                  {employee[field] === '' ? '—' : employee[field]}
                </span>
              </div>
            ))}
            <div className="field">
              <span className="field__label">{EMPLOYEE_FIELD_TITLES.status}</span>
              {/* The read view states the word; the Active/Inactive pair
                  lives in the users table's Status column. */}
              <span className="employee-detail__value">{employee.status}</span>
            </div>
          </div>
        )}
      </div>
      <div className="modal__actions">
        {onSaveEmployee !== undefined && !editing ? (
          <Button size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        ) : null}
        {editing ? (
          <>
            <Button
              size="sm"
              busy={saveBusy}
              disabled={!editable || !dirty}
              onClick={() => void save()}
            >
              Save
            </Button>
            <Button variant="ghost" disabled={saveBusy} onClick={cancel}>
              Cancel
            </Button>
          </>
        ) : null}
        {reviewCompleted && onDownloadReview !== undefined && !editing ? (
          <Button size="sm" busy={reviewBusy} disabled={reviewBusy} onClick={() => onDownloadReview()}>
            Download review
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  )
}
