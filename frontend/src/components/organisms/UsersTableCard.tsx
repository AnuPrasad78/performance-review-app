import { useEffect, useState, type ReactNode } from 'react'
import { Card } from '../atoms/Card'
import { Button } from '../atoms/Button'
import { DataTable, type DataTableColumn, type DataTableSort } from '../molecules/DataTable'
import { ColumnFilterMenu, type FilterMenuControl } from '../molecules/ColumnFilterMenu'
import { ExportMenuButton } from '../molecules/ExportMenuButton'
import type { ExportFormat } from '../../lib/tableExport'
import { Modal } from '../molecules/Modal'
import { Pager } from '../molecules/Pager'
import { EmployeeDetailCard } from './EmployeeDetailCard'
import { useProfileReview, type ProfileReviewActions } from '../../hooks/useProfileReview'
import type {
  Employee,
  EmployeePatch,
  EmployeePatchResult,
  EmployeeStatus,
} from '../../lib/types'

export interface UsersTableCardProps {
  employees: readonly Employee[]
  page: number
  pageCount: number
  onPage: (page: number) => void
  /** Empty state next move: a filtered no-match reads differently from an
      unloaded roster — the page, which owns the query, picks it. */
  emptyMessage: string
  /** The export in the chosen format, of every employee the composed query
      matches — owned by the page (data fetching lives there), awaited here
      so the button reflects the pending download. */
  onExport: (format: ExportFormat) => Promise<void>
  /** The page's composed search/filter controls, slotted into the toolbar
      beside the export menu — the organism renders, never owns, them. */
  tableControls?: ReactNode
  /** The profile card's review-download seam: the page's read + save for one
      employee's PDF. Omitted where the review is out of the card's reach. */
  review?: ProfileReviewActions
  /** The status column's Active/Inactive flip: the page patches the stored
      row (and re-reads the roster); awaited here so the row's pair reflects
      the pending move. */
  onSetStatus?: (employee: Employee, status: EmployeeStatus) => Promise<void>
  /** The profile card's field-save seam: the page patches the stored row
      (and re-reads the roster); the returned row re-keys the card when the
      save moved Employee ID or email. */
  onSaveEmployee?: (employee: Employee, patch: EmployeePatch) => Promise<EmployeePatchResult>
  /** The save as the page awaits it — the card disables its actions with it. */
  saveBusy?: boolean
  /** Click-to-sort headers; the keys are this page's wire sort words. */
  sort?: DataTableSort
  /** One funnel control per filtered column, keyed by the column key. */
  columnFilters?: Readonly<Record<string, FilterMenuControl>>
}

export function UsersTableCard({
  employees,
  page,
  pageCount,
  onPage,
  emptyMessage,
  onExport,
  tableControls,
  review,
  onSetStatus,
  onSaveEmployee,
  saveBusy = false,
  sort,
  columnFilters,
}: UsersTableCardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** The row the last save wrote back — held for the card while the roster's
      re-read is still in flight (its confirm below drops it), so a save that
      moved Employee ID or email never blinks the popup away. */
  const [savedRow, setSavedRow] = useState<Employee | null>(null)
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null)
  /** The row whose deactivation is awaiting the confirm popup — the flip
      only patches once the admin answers the dialog. */
  const [deactivationTarget, setDeactivationTarget] = useState<Employee | null>(null)
  const selected: Employee | null =
    selectedId === null
      ? null
      : (employees.find((employee) => employee.employeeId === selectedId) ??
        (savedRow?.employeeId === selectedId ? savedRow : null))
  const cardReview = useProfileReview(selected, review)

  useEffect(() => {
    if (savedRow !== null && employees.some(({ employeeId }) => employeeId === savedRow.employeeId)) {
      setSavedRow(null)
    }
  }, [employees, savedRow])

  async function setStatus(employee: Employee, status: EmployeeStatus): Promise<void> {
    if (onSetStatus === undefined) return
    setStatusBusyId(employee.employeeId)
    try {
      await onSetStatus(employee, status)
    } finally {
      setStatusBusyId(null)
    }
  }

  async function saveEmployee(
    employee: Employee,
    patch: EmployeePatch,
  ): Promise<EmployeePatchResult> {
    if (onSaveEmployee === undefined) {
      return { ok: false, detail: 'Editing is unavailable.', code: 'unavailable' }
    }
    const result = await onSaveEmployee(employee, patch)
    if (result.ok) {
      // The write may have moved the row's identity — follow the answer, or
      // the open card would fall off its row on the roster's re-read.
      setSavedRow(result.employee)
      setSelectedId(result.employee.employeeId)
    }
    return result
  }

  /** Sort keys are the wire words the backend whitelists; the Status cell is
      one button that names the current state — deactivation asks first,
      reactivation is safe to take immediately — and the click stays clear of
      the row's profile-card open. */
  const columns: readonly DataTableColumn<Employee>[] = [
    { key: 'employeeId', header: 'Employee ID', sortKey: 'employeeId', cell: (employee) => employee.employeeId, hideOnMobile: true },
    { key: 'name', header: 'Name', sortKey: 'employeeName', cell: (employee) => employee.name },
    { key: 'email', header: 'Email', sortKey: 'email', cell: (employee) => employee.email },
    { key: 'designation', header: 'Designation', sortKey: 'designation', cell: (employee) => employee.designation, hideOnMobile: true },
    { key: 'businessUnit', header: 'Business unit', sortKey: 'businessUnit', cell: (employee) => employee.businessUnit, hideOnMobile: true },
    {
      key: 'reportingManager',
      header: 'Reporting manager',
      sortKey: 'reportingManager',
      cell: (employee) => employee.reportingManager,
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'employmentStatus',
      hideOnMobile: true,
      cell:
        onSetStatus === undefined
          ? (employee) => employee.status
          : (employee) => (
              <Button
                variant={employee.status === 'Active' ? 'ghost' : 'primary'}
                size="sm"
                aria-label={`${employee.status === 'Active' ? 'Deactivate' : 'Reactivate'} ${employee.name}`}
                disabled={statusBusyId === employee.employeeId}
                onClick={(event) => {
                  event.stopPropagation()
                  if (employee.status === 'Active') {
                    setDeactivationTarget(employee)
                  } else {
                    void setStatus(employee, 'Active')
                  }
                }}
              >
                {employee.status}
              </Button>
            ),
    },
  ]

  const headerAdornments: Record<string, ReactNode> | undefined = (() => {
    if (columnFilters === undefined) return undefined
    const adornments: Record<string, ReactNode> = {}
    for (const [key, control] of Object.entries(columnFilters)) {
      adornments[key] = <ColumnFilterMenu label={columns.find((c) => c.key === key)?.header ?? key} control={control} />
    }
    return adornments
  })()
  return (
    <Card caption={`Roster · ${employees.length} ${employees.length === 1 ? 'employee' : 'employees'}`} captionAccent>
      <div className="table-toolbar">
        <ExportMenuButton
          label="Employee Master Data View"
          note="Downloads include only the employees matching the search and filters currently applied."
          onExport={onExport}
        />
        {tableControls ?? null}
      </div>
      <DataTable
        columns={columns}
        rows={employees}
        rowKey={(employee) => employee.employeeId}
        sort={sort}
        headerAdornments={headerAdornments}
        emptyMessage={emptyMessage}
        onRowClick={(employee) => setSelectedId(employee.employeeId)}
        activeRowKey={selected?.employeeId ?? null}
      />
      <Pager page={page} pageCount={pageCount} onPage={onPage} />
      {selected !== null ? (
        <EmployeeDetailCard
          employee={selected}
          onClose={() => setSelectedId(null)}
          reviewCompleted={cardReview.reviewCompleted}
          onDownloadReview={() => void cardReview.onDownloadReview()}
          reviewBusy={cardReview.reviewBusy}
          onSaveEmployee={onSaveEmployee === undefined ? undefined : (patch) => saveEmployee(selected, patch)}
          saveBusy={saveBusy}
        />
      ) : null}
      {deactivationTarget !== null ? (
        <Modal
          open
          label={`Deactivate ${deactivationTarget.name}`}
          onClose={() => setDeactivationTarget(null)}
        >
          <div className="modal__body">
            <p style={{ marginBottom: '12px' }}>
              This will hide {deactivationTarget.name} from the review roster.
            </p>
            <p style={{ color: 'var(--ink-3)' }}>Are you sure you want to deactivate the user?</p>
          </div>
          <div className="modal__actions">
            <Button variant="ghost" onClick={() => setDeactivationTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={statusBusyId === deactivationTarget.employeeId}
              onClick={() => {
                const target = deactivationTarget
                setDeactivationTarget(null)
                void setStatus(target, 'Inactive')
              }}
            >
              Deactivate
            </Button>
          </div>
        </Modal>
      ) : null}
    </Card>
  )
}
