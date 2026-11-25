import { useState } from 'react'
import { Card } from '../atoms/Card'
import { Button } from '../atoms/Button'
import { DataTable, type DataTableColumn } from '../molecules/DataTable'
import { Pager } from '../molecules/Pager'
import { EmployeeDetailCard } from './EmployeeDetailCard'
import { downloadCsv } from '../../lib/csvDownload'
import { ROSTER_CSV_HEADERS, employeeCsvRow } from '../../lib/rosterCsv'
import type { Employee } from '../../lib/types'

export interface UsersTableCardProps {
  employees: readonly Employee[]
  page: number
  pageCount: number
  onPage: (page: number) => void
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

export function UsersTableCard({ employees, page, pageCount, onPage }: UsersTableCardProps) {
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null)
  const selected: Employee | null =
    selectedEmail === null
      ? null
      : (employees.find((employee) => employee.email === selectedEmail) ?? null)

  const downloadRoster = () => {
    downloadCsv(
      'employee-roster.csv',
      ROSTER_CSV_HEADERS,
      employees.map(employeeCsvRow),
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
        onRowClick={(employee) => setSelectedEmail(employee.email)}
        activeRowKey={selected?.email ?? null}
      />
      <Pager page={page} pageCount={pageCount} onPage={onPage} />
      {selected !== null ? <EmployeeDetailCard employee={selected} onClose={() => setSelectedEmail(null)} /> : null}
    </Card>
  )
}
