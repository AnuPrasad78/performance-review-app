import { Card } from '../atoms/Card'
import { DataTable, type DataTableColumn } from '../molecules/DataTable'
import type { Employee } from '../../lib/types'

export interface UsersTableCardProps {
  employees: readonly Employee[]
}

const columns: readonly DataTableColumn<Employee>[] = [
  { key: 'name', header: 'Name', cell: (employee) => employee.name },
  { key: 'employeeId', header: 'Employee ID', cell: (employee) => employee.employeeId },
  { key: 'email', header: 'Email', cell: (employee) => employee.email },
  { key: 'designation', header: 'Designation', cell: (employee) => employee.designation },
  { key: 'location', header: 'Location', cell: (employee) => employee.location },
  { key: 'reportingManager', header: 'Reporting manager', cell: (employee) => employee.reportingManager },
  { key: 'status', header: 'Status', cell: (employee) => employee.status },
]

export function UsersTableCard({ employees }: UsersTableCardProps) {
  return (
    <Card caption={`Roster · ${employees.length} ${employees.length === 1 ? 'employee' : 'employees'}`} captionAccent>
      <DataTable
        columns={columns}
        rows={employees}
        rowKey={(employee) => employee.email}
        emptyMessage="No employees loaded. Upload a roster CSV to get started."
      />
    </Card>
  )
}
