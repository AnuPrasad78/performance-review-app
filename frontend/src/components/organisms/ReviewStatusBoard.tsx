import { useMemo, useState, type ReactNode } from 'react'
import { Card } from '../atoms/Card'
import { DataTable, type DataTableColumn, type DataTableSort } from '../molecules/DataTable'
import { ColumnFilterMenu, type FilterMenuControl } from '../molecules/ColumnFilterMenu'
import { Pager } from '../molecules/Pager'
import { PieChart } from '../molecules/PieChart'
import { ReviewStatusPill } from '../molecules/ReviewStatusPill'
import { StatTile } from '../molecules/StatTile'
import { EmployeeDetailCard } from './EmployeeDetailCard'
import { useProfileReview, type ProfileReviewActions } from '../../hooks/useProfileReview'
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
  /** The page's composed search/filter controls, slotted into the table
      toolbar — the status noun they carry replaced the chips row. */
  tableControls?: ReactNode
  /** The bulk completed-reviews trigger, built by the page, slotted after
      the Search & filter anchor. */
  tableActions?: ReactNode
  /** The profile card's review-download seam, keyed to the selected row's
      employee; a row opened for it reveals the card. */
  review?: ProfileReviewActions
  /** Click-to-sort headers; the keys are this page's wire sort words. */
  sort?: DataTableSort
  /** Status, location, and reporting-manager narrowing, chosen at their own
      column headers instead of the toolbar pop-up. */
  statusFilter?: FilterMenuControl
  orgFilter?: FilterMenuControl
  locationFilter?: FilterMenuControl
  managerFilter?: FilterMenuControl
}

export function ReviewStatusBoard({
  entries,
  statusCounts,
  total,
  page,
  pageCount,
  onPageChange,
  tableControls,
  tableActions,
  review,
  sort,
  statusFilter,
  orgFilter,
  locationFilter,
  managerFilter,
}: ReviewStatusBoardProps) {
  const counts = displayCounts(statusCounts)
  const rosterTotal = counts.not_started + counts.in_progress + counts.submitted
  const completed = counts.submitted
  const [selected, setSelected] = useState<EmployeeReviewStatus | null>(null)
  const cardReview = useProfileReview(selected?.employee ?? null, review)

  const headerAdornments = useMemo(() => {
    const adornments: Record<string, ReactNode> = {}
    if (statusFilter !== undefined) {
      adornments.status = <ColumnFilterMenu label="Form status" control={statusFilter} />
    }
    if (orgFilter !== undefined) {
      adornments.org = <ColumnFilterMenu label="Org" control={orgFilter} />
    }
    if (locationFilter !== undefined) {
      adornments.location = <ColumnFilterMenu label="Location" control={locationFilter} />
    }
    if (managerFilter !== undefined) {
      adornments.reportingManager = <ColumnFilterMenu label="Reporting manager" control={managerFilter} />
    }
    return adornments
  }, [statusFilter, orgFilter, locationFilter, managerFilter])

  /** Sort keys are the wire words the backend whitelists; `status` orders by
      the server's workflow rank. */
  const columns: readonly DataTableColumn<EmployeeReviewStatus>[] = [
    { key: 'name', header: 'Name', sortKey: 'employeeName', cell: (entry) => entry.employee.name },
    { key: 'email', header: 'Email', sortKey: 'email', cell: (entry) => entry.employee.email, hideOnMobile: true },
    { key: 'org', header: 'Org', sortKey: 'org', cell: (entry) => entry.employee.org, hideOnMobile: true },
    {
      key: 'location',
      header: 'Location',
      sortKey: 'location',
      cell: (entry) => entry.employee.location,
      hideOnMobile: true,
    },
    {
      key: 'reportingManager',
      header: 'Reporting manager',
      sortKey: 'reportingManager',
      cell: (entry) => entry.employee.reportingManager,
      hideOnMobile: true,
    },
    { key: 'status', header: 'Form status', sortKey: 'status', cell: (entry) => <ReviewStatusPill status={entry.status} /> },
  ]

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
        <Card caption="Review status" captionAccent>
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
        {tableControls !== null && tableControls !== undefined || tableActions ? (
          <div className="table-toolbar">
            {tableControls}
            {tableActions}
          </div>
        ) : null}
        <DataTable
          columns={columns}
          rows={entries}
          rowKey={(entry) => entry.employee.email}
          sort={sort}
          headerAdornments={headerAdornments}
          onRowClick={review !== undefined ? (entry) => setSelected(entry) : undefined}
          activeRowKey={review !== undefined ? (selected?.employee.email ?? null) : null}
          emptyMessage={
            rosterTotal === 0
              ? 'No employees loaded. Upload a roster CSV on the Employee data upload page.'
              : total === 0
                ? 'No employees match this filter.'
                : 'No employees on this page.'
          }
        />
        <Pager page={page} pageCount={pageCount} onPage={onPageChange} />
        {selected !== null && review !== undefined ? (
          <EmployeeDetailCard
            employee={selected.employee}
            onClose={() => setSelected(null)}
            formStatus={selected.status === 'submitted' ? 'completed' : 'pending'}
            reviewCompleted={selected.status === 'submitted'}
            onDownloadReview={() => void cardReview.onDownloadReview()}
            reviewBusy={cardReview.reviewBusy}
          />
        ) : null}
      </Card>
    </>
  )
}
