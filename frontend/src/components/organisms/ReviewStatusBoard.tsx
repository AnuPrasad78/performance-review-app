import { useMemo, useState, type ReactNode } from 'react'
import { Card } from '../atoms/Card'
import { DataTable, type DataTableColumn, type DataTableSort } from '../molecules/DataTable'
import { ColumnFilterMenu, type FilterMenuControl } from '../molecules/ColumnFilterMenu'
import { DownloadCsvButton } from '../molecules/DownloadCsvButton'
import { Pager } from '../molecules/Pager'
import { PieChart } from '../molecules/PieChart'
import { ReviewStatusPill } from '../molecules/ReviewStatusPill'
import { StatTile } from '../molecules/StatTile'
import { EmployeeDetailCard } from './EmployeeDetailCard'
import { useProfileReview, type ProfileReviewActions } from '../../hooks/useProfileReview'
import { REVIEW_STATUS_LABELS } from '../../lib/selfEvaluationStore'
import {
  isPastSubmission,
  rosterTotal,
  REVIEW_STATUS_WORDS,
  type EmployeeReviewStatus,
} from '../../lib/reviewStatusStore'
import { formatIsoDate } from '../../lib/dates'
import type { ReviewStatus } from '../../lib/types'

const STATUS_ORDER = REVIEW_STATUS_WORDS

/** Lifecycle-order color ladder on white — each stage one shade deeper than
    the last, the final state wearing `--teal-deep` (validated next to the
    in-progress blue in the pie). The three manager-phase words currently
    carry zero rows (no endpoint writes them yet); the ladder is ready. */
const STATUS_COLORS: Record<ReviewStatus, string> = {
  not_started: 'var(--ink-3)',
  self_evaluation_in_progress: 'var(--blue)',
  self_evaluation_completed: 'var(--teal-mid)',
  in_manager_review: 'var(--teal)',
  manager_evaluation_in_progress: 'var(--band-green)',
  manager_evaluation_completed: 'var(--teal-deep)',
}

function percentOf(count: number, total: number): string {
  return total === 0 ? '0.0' : ((count / total) * 100).toFixed(1)
}

export interface ReviewStatusBoardProps {
  /** The pie card's distribution: the server's statusCounts under the pie
      toolbar's search and dropdown words — never a status word. The tiles
      and pie are exactly as filtered as their toolbar. */
  pieCounts: Partial<Record<ReviewStatus, number>>
  /** In-flight flags: while a read runs, its card veils the stale numbers. */
  pieBusy?: boolean
  tableBusy?: boolean
  /** The table's words: its own read supplies the rows, the filtered total
      under the table query (status word included), and the caption's "of M"
      — the table read's own counts, which exclude the status word. */
  entries: readonly EmployeeReviewStatus[]
  total: number
  tableRosterTotal: number
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  /** The pie card's Search & Filter — it drives the tiles and pie only. */
  pieControls?: ReactNode
  /** The table's Search & Filter and its bulk download trigger; both live
      in the table card's toolbar. */
  tableControls?: ReactNode
  tableActions?: ReactNode
  /** The page's Download CSV read: every employee row the composed query
      matches, roster columns plus the board's own two columns — awaited by
      the shared button, so the busy state lives in the molecule. */
  onDownloadCsv: () => Promise<void>
  /** The profile card's review-download seam, keyed to the selected row's
      employee; a row opened for it reveals the card. */
  review?: ProfileReviewActions
  /** Click-to-sort headers; the keys are this page's wire sort words. */
  sort?: DataTableSort
  /** Status, location, and reporting-manager narrowing, chosen at their own
      column headers — the table query's words. */
  statusFilter?: FilterMenuControl
  orgFilter?: FilterMenuControl
  locationFilter?: FilterMenuControl
  managerFilter?: FilterMenuControl
}

export function ReviewStatusBoard({
  pieCounts,
  pieBusy = false,
  tableBusy = false,
  entries,
  total,
  tableRosterTotal,
  page,
  pageCount,
  onPageChange,
  pieControls,
  tableControls,
  tableActions,
  onDownloadCsv,
  review,
  sort,
  statusFilter,
  orgFilter,
  locationFilter,
  managerFilter,
}: ReviewStatusBoardProps) {
  const counts = pieCounts
  const roster = rosterTotal(counts)
  const notStarted = counts.not_started ?? 0
  // "In progress" is the in-flight middle of the lifecycle: the open form,
  // its manager review, and the manager's in-flight evaluation. The two
  // *_completed words are terminal for tile purposes.
  const inProgress =
    (counts.self_evaluation_in_progress ?? 0) +
    (counts.in_manager_review ?? 0) +
    (counts.manager_evaluation_in_progress ?? 0)
  const completed = counts.manager_evaluation_completed ?? 0
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
    {
      key: 'name',
      header: 'Name',
      sortKey: 'employeeName',
      cell: (entry) => {
        const name = entry.employee.name
        return <span title={name}>{name.length <= 16 ? name : `${name.slice(0, 16)}...`}</span>
      },
    },
    { key: 'email', header: 'Email', sortKey: 'email', cell: (entry) => entry.employee.email, hideOnMobile: true },
    { key: 'status', header: 'Form status', sortKey: 'status', cell: (entry) => <ReviewStatusPill status={entry.status} /> },
    {
      key: 'submittedAt',
      header: 'Submitted date',
      cell: (entry) =>
        entry.submittedAt === null ? (
          <span className="table__blank">-</span>
        ) : (
          formatIsoDate(entry.submittedAt)
        ),
      hideOnMobile: true,
    },
    {
      key: 'reportingManager',
      header: 'Reporting manager',
      sortKey: 'reportingManager',
      cell: (entry) => entry.employee.reportingManager,
      hideOnMobile: true,
    },
    {
      key: 'location',
      header: 'Location',
      sortKey: 'location',
      cell: (entry) => entry.employee.location,
      hideOnMobile: true,
    },
    { key: 'org', header: 'Org', sortKey: 'org', cell: (entry) => entry.employee.org, hideOnMobile: true },
  ]

  return (
    <>
      <div className="stat-board">
        <div className={pieBusy ? 'tiles tiles--dimmed' : 'tiles'}>
          <StatTile
            label="Total employees"
            value={String(roster)}
            note="Roster for this cycle"
            icon="users"
          />
          <StatTile
            label="Completed"
            value={String(completed)}
            note={`${percentOf(completed, roster)}% completion`}
            noteTone="positive"
            icon="circle-check"
            iconTone="positive"
          />
          <StatTile
            label="In progress"
            value={String(inProgress)}
            note={`${percentOf(inProgress, roster)}% of employees`}
            icon="clock"
          />
          <StatTile
            label="Not started"
            value={String(notStarted)}
            note={`${percentOf(notStarted, roster)}% of employees`}
            noteTone="negative"
            icon="alert"
            iconTone="negative"
          />
        </div>
        <Card>
          <div className="pie-card__head">
            <h2 className="card__caption card__caption--accent">Review status</h2>
            {pieControls !== null && pieControls !== undefined ? (
              <div className="table-toolbar">{pieControls}</div>
            ) : null}
          </div>
          <div className="pie-card__body" aria-busy={pieBusy === true || undefined}>
            <PieChart
              data={STATUS_ORDER.map((status) => ({
                label: REVIEW_STATUS_LABELS[status],
                value: counts[status] ?? 0,
                color: STATUS_COLORS[status],
              }))}
              ariaLabel="Review completion split by status"
            />
            {pieBusy ? (
              <div className="card-loading" role="status" aria-label="Loading the status split">
                <span className="spinner spinner--teal" />
              </div>
            ) : null}
          </div>
        </Card>
      </div>
      <Card
        caption={`Employees · ${total} of ${tableRosterTotal}`}
        captionAccent
      >
        <div className="table-toolbar">
          <DownloadCsvButton onDownload={onDownloadCsv} label="Download status" />
          {tableControls}
          {tableActions}
        </div>
        <div className="table-region" aria-busy={tableBusy === true || undefined}>
          <DataTable
            columns={columns}
            rows={entries}
            rowKey={(entry) => entry.employee.email}
            sort={sort}
            headerAdornments={headerAdornments}
            onRowClick={review !== undefined ? (entry) => setSelected(entry) : undefined}
            activeRowKey={review !== undefined ? (selected?.employee.email ?? null) : null}
            emptyMessage={
              tableRosterTotal === 0
                ? 'No employees loaded. Upload a roster CSV on the Employee data upload page.'
                : total === 0
                  ? 'No employees match this filter.'
                  : 'No employees on this page.'
            }
          />
          {tableBusy ? (
            <div className="card-loading" role="status" aria-label="Loading the employee list">
              <span className="spinner spinner--teal" />
            </div>
          ) : null}
        </div>
        <Pager page={page} pageCount={pageCount} onPage={onPageChange} />
        {selected !== null && review !== undefined ? (
          <EmployeeDetailCard
            employee={selected.employee}
            onClose={() => setSelected(null)}
            // The download hinge is the past-submission bucket — a finished
            // review is downloadable from self_evaluation_completed on, not
            // only at the final word.
            formStatus={isPastSubmission(selected.status) ? 'completed' : 'pending'}
            reviewCompleted={isPastSubmission(selected.status)}
            onDownloadReview={() => void cardReview.onDownloadReview()}
            reviewBusy={cardReview.reviewBusy}
          />
        ) : null}
      </Card>
    </>
  )
}
