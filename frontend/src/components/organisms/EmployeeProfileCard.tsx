import { Card } from '../atoms/Card'
import { Input } from '../atoms/Input'
import type { SelfEvaluationEmployee, SelfEvaluationEmployeeField } from '../../lib/types'

export interface EmployeeProfileCardProps {
  employee: SelfEvaluationEmployee
  readOnly: boolean
  /** Only an editable render edits; the backend owns this data when present. */
  onChange?: (field: SelfEvaluationEmployeeField, value: string) => void
}

interface ProfileField {
  key: SelfEvaluationEmployeeField
  label: string
  value: string
}

function initialsOf(name: string): string {
  const tokens = name.split(/\s+/).filter((token) => token !== '')
  const initials = tokens.slice(0, 2).map((token) => token.charAt(0))
  return initials.join('').toUpperCase()
}

export function EmployeeProfileCard({ employee, readOnly, onChange }: EmployeeProfileCardProps) {
  const fields: readonly ProfileField[] = [
    { key: 'name', label: 'Name', value: employee.name },
    { key: 'employeeId', label: 'Employee ID', value: employee.employeeId },
    { key: 'designation', label: 'Designation', value: employee.designation },
    { key: 'location', label: 'Location', value: employee.location },
    { key: 'org', label: 'Org', value: employee.org },
    { key: 'project', label: 'Project', value: employee.project },
    { key: 'reportingManager', label: 'Reporting manager', value: employee.reportingManager },
    { key: 'deliveryManager', label: 'Delivery manager', value: employee.deliveryManager },
    { key: 'deliveryHead', label: 'Delivery head', value: employee.deliveryHead },
  ]

  return (
    <Card>
      <div className="profile">
        <span className="avatar avatar--lg" aria-hidden="true">
          {initialsOf(employee.name)}
        </span>
        <div className="profile__identity">
          <h3 className="profile__name">{employee.name}</h3>
          <span className="profile__email muted">{employee.email}</span>
        </div>
      </div>
      <div className="details-grid">
        {fields.map((field) => (
          <div key={field.key} className="field">
            <label className="field__label" htmlFor={`detail-${field.key}`}>
              {field.label}
            </label>
            <Input
              id={`detail-${field.key}`}
              value={field.value}
              readOnly={readOnly}
              onChange={(event) => onChange?.(field.key, event.target.value)}
            />
          </div>
        ))}
      </div>
    </Card>
  )
}
