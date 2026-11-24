import { useMemo, useState } from 'react'
import { Card } from '../atoms/Card'
import { DataTable, type DataTableColumn } from '../molecules/DataTable'
import { PieChart } from '../molecules/PieChart'
import { ReviewStatusPill } from '../molecules/ReviewStatusPill'
import { SegmentedFilter } from '../molecules/SegmentedFilter'
import { StatTile } from '../molecules/StatTile'
import { REVIEW_STATUS_LABELS } from '../../lib/selfEvaluationStore'
import {
  COMPLETION_FILTERS,
  countReviewStatuses,
  filterEntries,
  type CompletionFilter,
  type EmployeeReviewStatus,
} from '../../lib/reviewStatusStore'
import type { ReviewStatus } from '../../lib/types'

const STATUS_ORDER: readonly ReviewStatus[] = ['not_started', 'in_progress', 'submitted', 'signed_off']

/** Theme signal tokens on white; submitted wears `--teal-deep` (not the pill pair's
    blue) because validated in a pie next to in-progress blue. */
const STATUS_COLORS: Record<ReviewStatus, string> = {
  not_started: 'var(--ink-3)',
  in_progress: 'var(--blue)',
  submitted: 'var(--teal-deep)',
  signed_off: 'var(--green)',
}

export interface ReviewStatusBoardProps {
  entries: readonly EmployeeReviewStatus[]
}

const columns: readonly DataTableColumn<EmployeeReviewStatus>[] = [
  { key: 'name', header: 'Name', cell: (entry) => entry.employee.name },
  { key: 'email', header: 'Email', cell: (entry) => entry.employee.email },
  { key: 'org', header: 'Org', cell: (entry) => entry.employee.org },
  { key: 'reportingManager', header: 'Reporting manager', cell: (entry) => entry.employee.reportingManager },
  { key: 'status', header: 'Form status', cell: (entry) => <ReviewStatusPill status={entry.status} /> },
]

function percentOf(count: number, total: number): string {
  return total === 0 ? '0.0' : ((count / total) * 100).toFixed(1)
}

export function ReviewStatusBoard({ entries }: ReviewStatusBoardProps) {
  const [filter, setFilter] = useState<CompletionFilter>('all')
  const counts = useMemo(() => countReviewStatuses(entries), [entries])
  const shown = useMemo(() => filterEntries(entries, filter), [entries, filter])
  const total = entries.length
  const completed = counts.submitted + counts.signed_off

  return (
    <>
      <div className="stat-board">
        <div className="tiles">
          <StatTile
            label="Total employees"
            value={String(total)}
            note="Roster for this cycle"
            icon="users"
          />
          <StatTile
            label="Completed"
            value={String(completed)}
            note={`${percentOf(completed, total)}% completion`}
            noteTone="positive"
            icon="circle-check"
            iconTone="positive"
          />
          <StatTile
            label="In progress"
            value={String(counts.in_progress)}
            note={`${percentOf(counts.in_progress, total)}% of employees`}
            icon="clock"
          />
          <StatTile
            label="Not started"
            value={String(counts.not_started)}
            note={`${percentOf(counts.not_started, total)}% of employees`}
            noteTone="negative"
            icon="alert"
            iconTone="negative"
          />
        </div>
        <Card caption="Completion" captionAccent>
          <PieChart
            data={STATUS_ORDER.map((status) => ({
              label: REVIEW_STATUS_LABELS[status],
              value: counts[status],
              color: STATUS_COLORS[status],
            }))}
            ariaLabel="Review completion split by status"
          />
        </Card>
      </div>
      <SegmentedFilter
        options={COMPLETION_FILTERS}
        value={filter}
        onChange={setFilter}
        ariaLabel="Filter employees by review completion"
      />
      <Card
        caption={`Employees · ${shown.length} of ${total}`}
        captionAccent
      >
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(entry) => entry.employee.email}
          emptyMessage={
            total === 0
              ? 'No employees loaded. Upload a roster CSV on the Employee data upload page.'
              : 'No employees match this filter.'
          }
        />
      </Card>
    </>
  )
}
