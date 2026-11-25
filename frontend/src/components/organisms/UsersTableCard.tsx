import { useMemo, useState, type ReactNode } from 'react'
import { Card } from '../atoms/Card'
import { Button } from '../atoms/Button'
import { DataTable, type DataTableColumn, type DataTableSort } from '../molecules/DataTable'
import { ColumnFilterMenu, type FilterMenuControl } from '../molecules/ColumnFilterMenu'
import { Pager } from '../molecules/Pager'
import { EmployeeDetailCard } from './EmployeeDetailCard'
import type { Employee } from '../../lib/types'

export interface UsersTableCardProps {
  employees: readonly Employee[]
  page: number
  pageCount: number
  onPage: (page: number) => void
  /** Empty state next move: a filtered no-match reads differently from an
      unloaded roster — the page, which owns the query, picks it. */
  emptyMessage: string
  /** The export: the server's CSV of every employee the composed query
      matches — owned by the page (data fetching lives there), awaited here
      so the button reflects the pending download. */
  onDownloadCsv: () => Promise<void>
  /** The page's composed search/filter controls, slotted into the toolbar
      beside Download CSV — the organism renders, never owns, them. */
  tableControls?: ReactNode
  /** Click-to-sort headers; the keys are this page's wire sort words. */
  sort?: DataTableSort
  /** One funnel control per filtered column, keyed by the column key. */
  columnFilters?: Readonly<Record<string, FilterMenuControl>>
}

/** Sort keys are the wire words the backend whitelists. */
const columns: readonly DataTableColumn<Employee>[] = [
  { key: 'name', header: 'Name', sortKey: 'employeeName', cell: (employee) => employee.name },
  { key: 'employeeId', header: 'Employee ID', sortKey: 'employeeId', cell: (employee) => employee.employeeId, hideOnMobile: true },
  { key: 'email', header: 'Email', sortKey: 'email', cell: (employee) => employee.email },
  { key: 'designation', header: 'Designation', sortKey: 'designation', cell: (employee) => employee.designation, hideOnMobile: true },
  { key: 'location', header: 'Location', sortKey: 'location', cell: (employee) => employee.location, hideOnMobile: true },
  {
    key: 'reportingManager',
    header: 'Reporting manager',
    sortKey: 'reportingManager',
    cell: (employee) => employee.reportingManager,
    hideOnMobile: true,
  },
  { key: 'status', header: 'Status', sortKey: 'employmentStatus', cell: (employee) => employee.status, hideOnMobile: true },
]

export function UsersTableCard({
  employees,
  page,
  pageCount,
  onPage,
  emptyMessage,
  onDownloadCsv,
  tableControls,
  sort,
  columnFilters,
}: UsersTableCardProps) {
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const selected: Employee | null =
    selectedEmail === null
      ? null
      : (employees.find((employee) => employee.email === selectedEmail) ?? null)

  async function downloadRoster(): Promise<void> {
    setDownloading(true)
    try {
      await onDownloadCsv()
    } finally {
      setDownloading(false)
    }
  }

  const headerAdornments = useMemo(() => {
    if (columnFilters === undefined) return undefined
    const adornments: Record<string, ReactNode> = {}
    for (const [key, control] of Object.entries(columnFilters)) {
      adornments[key] = <ColumnFilterMenu label={columns.find((c) => c.key === key)?.header ?? key} control={control} />
    }
    return adornments
  }, [columnFilters])
  return (
    <Card caption={`Roster · ${employees.length} ${employees.length === 1 ? 'employee' : 'employees'}`} captionAccent>
      <div className="table-toolbar">
        <Button variant="ghost" size="sm" onClick={() => void downloadRoster()} disabled={downloading}>
          Download CSV
        </Button>
        {tableControls ?? null}
      </div>
      <DataTable
        columns={columns}
        rows={employees}
        rowKey={(employee) => employee.email}
        sort={sort}
        headerAdornments={headerAdornments}
        emptyMessage={emptyMessage}
        onRowClick={(employee) => setSelectedEmail(employee.email)}
        activeRowKey={selected?.email ?? null}
      />
      <Pager page={page} pageCount={pageCount} onPage={onPage} />
      {selected !== null ? <EmployeeDetailCard employee={selected} onClose={() => setSelectedEmail(null)} /> : null}
    </Card>
  )
}
