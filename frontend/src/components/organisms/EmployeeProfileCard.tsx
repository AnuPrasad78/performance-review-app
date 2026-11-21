import { Card } from '../atoms/Card'
import { Input } from '../atoms/Input'
import type { SelfEvaluationEmployee } from '../../lib/types'

export interface EmployeeProfileCardProps {
  employee: SelfEvaluationEmployee
}

interface ProfileField {
  key: string
  label: string
  value: string
}

function initialsOf(employee: SelfEvaluationEmployee): string {
  const first = employee.firstName.charAt(0)
  const last = employee.lastName.charAt(0)
  return (first + last).toUpperCase()
}

export function EmployeeProfileCard({ employee }: EmployeeProfileCardProps) {
  const fields: readonly ProfileField[] = [
    { key: 'name', label: 'Employee name', value: `${employee.firstName} ${employee.lastName}` },
    { key: 'id', label: 'Employee ID', value: employee.employeeId },
    { key: 'position', label: 'Position', value: employee.role },
    { key: 'department', label: 'Department', value: employee.department },
    { key: 'location', label: 'Location', value: employee.location },
    { key: 'manager', label: 'Reporting manager', value: employee.manager },
    { key: 'dm', label: 'DM', value: employee.deliveryManager },
    { key: 'dh-dp', label: 'DH/DP', value: employee.deliveryHead },
  ]

  return (
    <Card>
      <div className="profile">
        <span className="avatar avatar--lg" aria-hidden="true">
          {initialsOf(employee)}
        </span>
        <div className="profile__identity">
          <h3 className="profile__name">
            {employee.firstName} {employee.lastName}
          </h3>
          <span className="profile__email muted">{employee.email}</span>
        </div>
      </div>
      <div className="details-grid">
        {fields.map((field) => (
          <div key={field.key} className="field">
            <label className="field__label" htmlFor={`detail-${field.key}`}>
              {field.label}
            </label>
            <Input id={`detail-${field.key}`} value={field.value} readOnly />
          </div>
        ))}
      </div>
    </Card>
  )
}
