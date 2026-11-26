import type { Employee } from './types'

/** The exact roster CSV contract (see POST /api/employees/import): header
    order, wire field per column, and the empty cells an export must keep so
    a download round-trips through the upload. Internal table columns only —
    nothing from the employees row beyond the roster's 14 fields. */
export const ROSTER_CSV: ReadonlyArray<{ header: string; field: keyof Employee }> = [
  { header: 'Employee Name', field: 'name' },
  { header: 'Employee ID', field: 'employeeId' },
  { header: 'Email', field: 'email' },
  { header: 'Designation', field: 'designation' },
  { header: 'Location', field: 'location' },
  { header: 'Org', field: 'org' },
  { header: 'Business Unit', field: 'businessUnit' },
  { header: 'Current Account / Project', field: 'project' },
  { header: 'Delivery Head', field: 'deliveryHead' },
  { header: 'Delivery Manager', field: 'deliveryManager' },
  { header: 'Business Partner', field: 'businessPartner' },
  { header: 'Reporting Manager', field: 'reportingManager' },
  { header: 'Status', field: 'status' },
  { header: 'Date of Joining', field: 'joiningDate' },
]

export const ROSTER_CSV_HEADERS: readonly string[] = ROSTER_CSV.map(({ header }) => header)

/** One employee as a CSV row in the contract's column order. */
export function employeeCsvRow(employee: Employee): readonly string[] {
  return ROSTER_CSV.map(({ field }) => employee[field])
}
