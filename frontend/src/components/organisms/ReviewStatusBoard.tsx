import { useMemo, useState, type ReactNode } from 'react'
import { Card } from '../atoms/Card'
import { DataTable, type DataTableColumn, type DataTableSort } from '../molecules/DataTable'
import { ColumnFilterMenu, type FilterMenuControl } from '../molecules/ColumnFilterMenu'
import { ExportMenuButton } from '../molecules/ExportMenuButton'
import type { ExportFormat } from '../../lib/tableExport'
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
  /** The page's export in the chosen format: every employee row the
      composed query matches, never just the page slice. */
  onExport: (format: ExportFormat) => Promise<void>
  /** The profile card's review-download seam, keyed to the selected row's
      employee; a row opened for it reveals the card. */
  review?: ProfileReviewActions
  /** Click-to-sort headers; the keys are this page's wire sort words. */
  sort?: DataTableSort
  /** Evaluation-status narrowing, chosen at its own column header — the
      table query's status word. */
  statusFilter?: FilterMenuControl
}

const blankOr = (value: string): ReactNode =>
  value === '' ? <span className="table__blank">-</span> : value

/** The upload CSV's fields the board did not already show, appended after
    its own columns so those keep their place; every one sorts. */
const ROSTER_TAIL_COLUMNS: readonly DataTableColumn<EmployeeReviewStatus>[] = [
  { key: 'employeeId', header: 'Employee ID', sortKey: 'employeeId', hideOnMobile: true, cell: (entry) => entry.employee.employeeId },
  { key: 'designation', header: 'Designation', sortKey: 'designation', hideOnMobile: true, cell: (entry) => blankOr(entry.employee.designation) },
  { key: 'businessUnit', header: 'Business unit', sortKey: 'businessUnit', hideOnMobile: true, cell: (entry) => blankOr(entry.employee.businessUnit) },
  { key: 'project', header: 'Current account / project', sortKey: 'project', hideOnMobile: true, cell: (entry) => blankOr(entry.employee.project) },
  { key: 'deliveryHead', header: 'Delivery head', sortKey: 'deliveryHead', hideOnMobile: true, cell: (entry) => blankOr(entry.employee.deliveryHead) },
  { key: 'deliveryManager', header: 'Delivery manager', sortKey: 'deliveryManager', hideOnMobile: true, cell: (entry) => blankOr(entry.employee.deliveryManager) },
  { key: 'businessPartner', header: 'Business partner', sortKey: 'businessPartner', hideOnMobile: true, cell: (entry) => blankOr(entry.employee.businessPartner) },
  { key: 'employmentStatus', header: 'Status', sortKey: 'employmentStatus', hideOnMobile: true, cell: (entry) => entry.employee.status },
  {
    key: 'joiningDate',
    header: 'Date of joining',
    sortKey: 'joiningDate',
    hideOnMobile: true,
    cell: (entry) => (entry.employee.joiningDate === '' ? blankOr('') : formatIsoDate(entry.employee.joiningDate)),
  },
]

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
  onExport,
  review,
  sort,
  statusFilter,
}: ReviewStatusBoardProps) {
  const counts = pieCounts
  const roster = rosterTotal(counts)
  // Each self-evaluation tile is exactly the pie slice of the same name, so
  // a tile and its slice can never disagree; manager-phase words show in
  // the pie alone.
  const notStarted = counts.not_started ?? 0
  const inProgress = counts.self_evaluation_in_progress ?? 0
  const completed = counts.self_evaluation_completed ?? 0
  const [selected, setSelected] = useState<EmployeeReviewStatus | null>(null)
  const cardReview = useProfileReview(selected?.employee ?? null, review)

  const headerAdornments = useMemo(() => {
    const adornments: Record<string, ReactNode> = {}
    if (statusFilter !== undefined) {
      adornments.status = <ColumnFilterMenu label="Evaluation status" control={statusFilter} />
    }
    return adornments
  }, [statusFilter])

  /** Sort keys are the wire words the backend whitelists. Every column sorts
      except Email and Evaluation status; Evaluation status is the one column
      that filters, from its header funnel. */
  const columns: readonly DataTableColumn<EmployeeReviewStatus>[] = [
    {
      key: 'name',
      header: 'Name',
      sortKey: 'employeeName',
      sticky: true,
      cell: (entry) => {
        const name = entry.employee.name
        return <span title={name}>{name.length <= 16 ? name : `${name.slice(0, 16)}...`}</span>
      },
    },
    { key: 'email', header: 'Email', cell: (entry) => entry.employee.email, hideOnMobile: true },
    { key: 'status', header: 'Evaluation status', cell: (entry) => <ReviewStatusPill status={entry.status} /> },
    {
      key: 'submittedAt',
      header: 'Submitted date',
      sortKey: 'submittedAt',
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
    // The rest of the roster upload's fields, in the CSV's own order.
    ...ROSTER_TAIL_COLUMNS,
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
            label="Self-evaluation completed"
            value={String(completed)}
            note={`${percentOf(completed, roster)}% completion`}
            noteTone="positive"
            icon="circle-check"
            iconTone="positive"
          />
          <StatTile
            label="Self-evaluation in progress"
            value={String(inProgress)}
            note={`${percentOf(inProgress, roster)}% of employees`}
            icon="clock"
          />
          <StatTile
            label="Self-evaluation not started"
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
          <ExportMenuButton
          label="Download status"
          note="Downloads include only the employees matching the search and filters currently applied."
          onExport={onExport}
        />
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
