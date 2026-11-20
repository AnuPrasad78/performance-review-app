import { Card } from '../atoms/Card'
import { DataTable, type DataTableColumn } from '../molecules/DataTable'
import type { Employee } from '../../lib/types'

export interface UsersTableCardProps {
  employees: readonly Employee[]
}

const columns: readonly DataTableColumn<Employee>[] = [
  {
    key: 'name',
    header: 'Name',
    cell: (employee) => `${employee.firstName} ${employee.lastName}`,
  },
  { key: 'email', header: 'Email', cell: (employee) => employee.email },
  { key: 'role', header: 'Role', cell: (employee) => employee.role },
  { key: 'department', header: 'Department', cell: (employee) => employee.department },
  { key: 'manager', header: 'Manager', cell: (employee) => employee.manager },
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
