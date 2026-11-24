import { Card } from '../atoms/Card'
import { Button } from '../atoms/Button'
import { DataTable, type DataTableColumn } from '../molecules/DataTable'
import { downloadCsv } from '../../lib/csvDownload'
import type { Employee } from '../../lib/types'

export interface UsersTableCardProps {
  employees: readonly Employee[]
}

const columns: readonly DataTableColumn<Employee>[] = [
  { key: 'name', header: 'Name', cell: (employee) => employee.name },
  { key: 'employeeId', header: 'Employee ID', cell: (employee) => employee.employeeId, hideOnMobile: true },
  { key: 'email', header: 'Email', cell: (employee) => employee.email },
  { key: 'designation', header: 'Designation', cell: (employee) => employee.designation, hideOnMobile: true },
  { key: 'location', header: 'Location', cell: (employee) => employee.location, hideOnMobile: true },
  {
    key: 'reportingManager',
    header: 'Reporting manager',
    cell: (employee) => employee.reportingManager,
    hideOnMobile: true,
  },
  { key: 'status', header: 'Status', cell: (employee) => employee.status, hideOnMobile: true },
]

export function UsersTableCard({ employees }: UsersTableCardProps) {
  const downloadRoster = () => {
    downloadCsv(
      'employee-roster.csv',
      ['Name', 'Employee ID', 'Email', 'Designation', 'Location', 'Reporting manager', 'Status'],
      employees.map((employee) => [
        employee.name,
        employee.employeeId,
        employee.email,
        employee.designation,
        employee.location,
        employee.reportingManager,
        employee.status,
      ]),
    )
  }
  return (
    <Card caption={`Roster · ${employees.length} ${employees.length === 1 ? 'employee' : 'employees'}`} captionAccent>
      <div className="table-toolbar">
        <Button variant="ghost" size="sm" onClick={downloadRoster} disabled={employees.length === 0}>
          Download CSV
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={employees}
        rowKey={(employee) => employee.email}
        emptyMessage="No employees loaded. Upload a roster CSV to get started."
      />
    </Card>
  )
}
