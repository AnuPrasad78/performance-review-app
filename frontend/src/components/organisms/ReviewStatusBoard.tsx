import type { ReactNode } from 'react'
import { Card } from '../atoms/Card'
import { DataTable, type DataTableColumn } from '../molecules/DataTable'
import { Pager } from '../molecules/Pager'
import { PieChart } from '../molecules/PieChart'
import { ReviewStatusPill } from '../molecules/ReviewStatusPill'
import { StatTile } from '../molecules/StatTile'
import { REVIEW_STATUS_LABELS } from '../../lib/selfEvaluationStore'
import { displayCounts, type EmployeeReviewStatus } from '../../lib/reviewStatusStore'
import type { RawReviewStatus, ReviewStatus } from '../../lib/types'

const STATUS_ORDER: readonly ReviewStatus[] = ['not_started', 'in_progress', 'submitted']

/** Theme signal tokens on white; submitted wears `--teal-deep` (not the pill pair's
    blue) because validated in a pie next to in-progress blue. */
const STATUS_COLORS: Record<ReviewStatus, string> = {
  not_started: 'var(--ink-3)',
  in_progress: 'var(--blue)',
  submitted: 'var(--teal-deep)',
}

const columns: readonly DataTableColumn<EmployeeReviewStatus>[] = [
  { key: 'name', header: 'Name', cell: (entry) => entry.employee.name },
  { key: 'email', header: 'Email', cell: (entry) => entry.employee.email, hideOnMobile: true },
  { key: 'org', header: 'Org', cell: (entry) => entry.employee.org, hideOnMobile: true },
  {
    key: 'reportingManager',
    header: 'Reporting manager',
    cell: (entry) => entry.employee.reportingManager,
    hideOnMobile: true,
  },
  { key: 'status', header: 'Form status', cell: (entry) => <ReviewStatusPill status={entry.status} /> },
]

function percentOf(count: number, total: number): string {
  return total === 0 ? '0.0' : ((count / total) * 100).toFixed(1)
}

export interface ReviewStatusBoardProps {
  /** This page's rows (server-sliced); distribution numbers come from the
      server's whole-roster counts, never from client-side re-counting. */
  entries: readonly EmployeeReviewStatus[]
  statusCounts: Partial<Record<RawReviewStatus, number>>
  /** Rows matching the current server filter. */
  total: number
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  /** The page's composed search/filter/sort controls, slotted into the
      table toolbar — the status noun they carry replaced the chips row. */
  tableControls?: ReactNode
}

export function ReviewStatusBoard({
  entries,
  statusCounts,
  total,
  page,
  pageCount,
  onPageChange,
  tableControls,
}: ReviewStatusBoardProps) {
  const counts = displayCounts(statusCounts)
  const rosterTotal = counts.not_started + counts.in_progress + counts.submitted
  const completed = counts.submitted

  return (
    <>
      <div className="stat-board">
        <div className="tiles">
          <StatTile
            label="Total employees"
            value={String(rosterTotal)}
            note="Roster for this cycle"
            icon="users"
          />
          <StatTile
            label="Completed"
            value={String(completed)}
            note={`${percentOf(completed, rosterTotal)}% completion`}
            noteTone="positive"
            icon="circle-check"
            iconTone="positive"
          />
          <StatTile
            label="In progress"
            value={String(counts.in_progress)}
            note={`${percentOf(counts.in_progress, rosterTotal)}% of employees`}
            icon="clock"
          />
          <StatTile
            label="Not started"
            value={String(counts.not_started)}
            note={`${percentOf(counts.not_started, rosterTotal)}% of employees`}
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
      <Card
        caption={`Employees · ${total} of ${rosterTotal}`}
        captionAccent
      >
        {tableControls !== null && tableControls !== undefined ? (
          <div className="table-toolbar">{tableControls}</div>
        ) : null}
        <DataTable
          columns={columns}
          rows={entries}
          rowKey={(entry) => entry.employee.email}
          emptyMessage={
            rosterTotal === 0
              ? 'No employees loaded. Upload a roster CSV on the Employee data upload page.'
              : total === 0
                ? 'No employees match this filter.'
                : 'No employees on this page.'
          }
        />
        <Pager page={page} pageCount={pageCount} onPage={onPageChange} />
      </Card>
    </>
  )
}
