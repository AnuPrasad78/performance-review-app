import { Card } from '../atoms/Card'
import { Input } from '../atoms/Input'
import { DataTable, type DataTableColumn } from '../molecules/DataTable'
import { formatIsoDate, todayIsoDate } from '../../lib/dates'
import type { SelfEvaluationEmployee } from '../../lib/types'

export interface SignOffPanelProps {
  employee: SelfEvaluationEmployee
  /** Confirmation checkbox state from the draft; the name/date stamp on save, not here. */
  acknowledged: boolean
  /** ISO date the app stamped on sign-off; null until a save or submit. */
  signedAt: string | null
  readOnly: boolean
  onAcknowledgeChange: (acknowledged: boolean) => void
}

const CONFIRM_STATEMENT =
  'I confirm the 2026 review discussion took place and the ratings and comments were shared with me.'

interface SignoffRow {
  employee: string
  manager: string
  date: string
}

const columns: readonly DataTableColumn<SignoffRow>[] = [
  { key: 'employee', header: 'Employee', cell: (row) => row.employee },
  { key: 'manager', header: 'Manager', cell: (row) => row.manager },
  {
    key: 'date',
    header: 'Date (dd-Mmm-yyyy)',
    cell: (row) => (row.date === '' ? row.date : <span className="mono nowrap">{row.date}</span>),
  },
]

export function SignOffPanel({
  employee,
  acknowledged,
  signedAt,
  readOnly,
  onAcknowledgeChange,
}: SignOffPanelProps) {
  const rows: readonly SignoffRow[] = [
    {
      employee: `${employee.firstName} ${employee.lastName}`,
      manager: '',
      date: formatIsoDate(signedAt ?? todayIsoDate()),
    },
  ]
  return (
    <div className="signoff">
      <label className="checkbox-row">
        <Input
          type="checkbox"
          className="checkbox"
          checked={acknowledged}
          disabled={readOnly}
          onChange={(event) => onAcknowledgeChange(event.target.checked)}
        />
        <span>{CONFIRM_STATEMENT}</span>
      </label>
      <Card>
        <DataTable rows={rows} columns={columns} rowKey={() => 'sign-off-row'} emptyMessage="No sign-off recorded." />
      </Card>
    </div>
  )
}
