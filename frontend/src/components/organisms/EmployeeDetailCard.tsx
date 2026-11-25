import { Modal } from '../molecules/Modal'
import { SegmentedFilter } from '../molecules/SegmentedFilter'
import { Button } from '../atoms/Button'
import { EMPLOYEE_FIELD_TITLES } from '../../lib/employeeTitles'
import { ROSTER_CSV } from '../../lib/rosterCsv'
import type { Employee, EmployeeStatus, FormStatus } from '../../lib/types'

/** The profile popup carries the whole roster record; the identity block
    already shows name and email, so the grid opens with the review's form
    status (the ask the row itself never carries), holds the roster fields in
    the roster CSV's column order, and closes with the status field — the one
    cell that may carry its own Active/Inactive toggle. */
const PROFILE_FIELDS: ReadonlyArray<keyof Employee> = ROSTER_CSV.filter(
  ({ field }) => field !== 'name' && field !== 'email' && field !== 'status',
).map(({ field }) => field)

const FORM_STATUS_LABELS: Record<FormStatus, string> = {
  pending: 'Pending',
  completed: 'Completed',
}

const STATUS_OPTIONS: ReadonlyArray<{ value: EmployeeStatus; label: string }> = [
  { value: 'Active', label: 'Active' },
  { value: 'Inactive', label: 'Inactive' },
]

export interface EmployeeDetailCardProps {
  employee: Employee
  onClose: () => void
  /** The review's form status as the page read it — null while unread or
      where no read is wired, rendering the em dash. */
  formStatus?: FormStatus | null
  /** The download-seam pair the owning organism wires when the card may
      serve its review PDF: shown only while the review is completed. */
  reviewCompleted?: boolean
  onDownloadReview?: () => void
  reviewBusy?: boolean
  /** The employment-status seam: when wired, the Status cell carries the
      Active/Inactive chip pair instead of the bare word. */
  onSetStatus?: (status: EmployeeStatus) => void
  statusBusy?: boolean
}

export function EmployeeDetailCard({
  employee,
  onClose,
  formStatus = null,
  reviewCompleted = false,
  onDownloadReview,
  reviewBusy = false,
  onSetStatus,
  statusBusy = false,
}: EmployeeDetailCardProps) {
  return (
    <Modal open label={`More about ${employee.name}`} onClose={onClose}>
      <div className="modal__body">
        <p className="eyebrow">More about</p>
        <h3 className="profile__name">{employee.name}</h3>
        <span className="profile__email muted">{employee.email}</span>
        <div className="details-grid employee-detail-grid">
          <div className="field">
            <span className="field__label">Form status</span>
            <span className="employee-detail__value">
              {formStatus === null ? '—' : FORM_STATUS_LABELS[formStatus]}
            </span>
          </div>
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
            {onSetStatus !== undefined ? (
              <div className="employee-detail__status">
                <SegmentedFilter
                  options={STATUS_OPTIONS}
                  value={employee.status}
                  onChange={onSetStatus}
                  ariaLabel={`${employee.name}'s employment status`}
                  disabled={statusBusy}
                />
              </div>
            ) : (
              <span className="employee-detail__value">{employee.status}</span>
            )}
          </div>
        </div>
      </div>
      <div className="modal__actions">
        {reviewCompleted && onDownloadReview !== undefined ? (
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
