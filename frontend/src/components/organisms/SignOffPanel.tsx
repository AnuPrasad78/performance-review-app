import { Card } from '../atoms/Card'
import { DataTable, type DataTableColumn } from '../molecules/DataTable'
import { formatIsoDate, todayIsoDate } from '../../lib/dates'
import type { SelfEvaluationEmployee } from '../../lib/types'

export interface SignOffPanelProps {
  employee: SelfEvaluationEmployee
  /** ISO date the app stamped on sign-off; null until a save or submit. */
  signedAt: string | null
}

interface SignoffRow {
  employee: string
  designation: string
  date: string
}

const columns: readonly DataTableColumn<SignoffRow>[] = [
  { key: 'employee', header: 'Employee', cell: (row) => row.employee },
  { key: 'designation', header: 'Designation', cell: (row) => row.designation },
  {
    key: 'date',
    header: 'Date (dd-Mmm-yyyy)',
    cell: (row) => (row.date === '' ? row.date : <span className="mono nowrap">{row.date}</span>),
  },
]

export function SignOffPanel({ employee, signedAt }: SignOffPanelProps) {
  const rows: readonly SignoffRow[] = [
    {
      employee: employee.name,
      designation: employee.designation,
      date: formatIsoDate(signedAt ?? todayIsoDate()),
    },
  ]
  return (
    <div className="signoff">
      <Card>
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={() => 'sign-off-row'}
          emptyMessage="No sign-off recorded."
        />
      </Card>
    </div>
  )
}
