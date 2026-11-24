import { Button } from '../atoms/Button'
import { Modal } from '../molecules/Modal'
import { EMPLOYEE_FIELD_TITLES } from '../../lib/employeeTitles'
import { ROSTER_CSV } from '../../lib/rosterCsv'
import type { Employee } from '../../lib/types'

/** The profile popup carries the whole roster record; the identity block
    already shows name and email, so the grid holds the other ten in the
    roster CSV's column order. */
const PROFILE_FIELDS: ReadonlyArray<keyof Employee> = ROSTER_CSV.filter(
  ({ field }) => field !== 'name' && field !== 'email',
).map(({ field }) => field)

export interface EmployeeDetailCardProps {
  employee: Employee
  onClose: () => void
}

export function EmployeeDetailCard({ employee, onClose }: EmployeeDetailCardProps) {
  return (
    <Modal open label={`More about ${employee.name}`} onClose={onClose}>
      <div className="modal__body">
        <p className="eyebrow">More about</p>
        <h3 className="profile__name">{employee.name}</h3>
        <span className="profile__email muted">{employee.email}</span>
        <div className="details-grid employee-detail-grid">
          {PROFILE_FIELDS.map((field) => (
            <div key={field} className="field">
              <span className="field__label">{EMPLOYEE_FIELD_TITLES[field]}</span>
              <span className="employee-detail__value">
                {employee[field] === '' ? '—' : employee[field]}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="modal__actions">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  )
}
