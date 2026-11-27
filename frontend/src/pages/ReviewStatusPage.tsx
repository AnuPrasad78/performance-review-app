import { useEffect, useMemo, useState } from 'react'
import { useDelaySkeleton } from '../hooks/useDelaySkeleton'
import { Card } from '../components/atoms/Card'
import { Skeleton } from '../components/atoms/Skeleton'
import { TableSkeleton } from '../components/molecules/TableSkeleton'
import { ReviewStatusBoard } from '../components/organisms/ReviewStatusBoard'
import { TableQueryControls, type TableFilterSpec } from '../components/molecules/TableQueryControls'
import { ReviewDownloadsButton } from '../components/molecules/ReviewDownloadsButton'
import { AdminTemplate } from '../components/templates/AdminTemplate'
import { useCompletedReviews } from '../hooks/useCompletedReviews'
import { type ProfileReviewActions } from '../hooks/useProfileReview'
import {
  fetchEmployeeFacets,
  fetchEmployeeEvaluation,
  fetchReviewBoard,
  fetchReviewStatusCsvExport,
} from '../lib/api'
import { appliedFilters } from '../lib/exportFilters'
import { saveTableExport, type ExportFormat } from '../lib/tableExport'
import { rosterTotal } from '../lib/reviewStatusStore'
import { saveReviewPdf } from '../lib/reviewDownloads'
import { COMPLETION_FILTERS, type CompletionFilter } from '../lib/reviewStatusStore'
import { useAdminStore } from '../state/AdminContext'
import type {
  RosterFacets,
  RosterQuery,
  RosterSortField,
  ReviewBoardPage,
} from '../lib/types'

/** The board reads twice, once per scope, against the same endpoint
    (GET /api/evaluations): the pie card's query — search and dropdown verbs
    only, no status word, not paged — feeds the tiles and the pie, while the
    table's composed query feeds its rows, funnels, and pager. A filter
    narrows exactly the card it lives in; each toolbar owns its words. */
interface PieQuery {
  designation?: string
  businessUnit?: string
  businessPartner?: string
}

interface TableQuery extends RosterQuery {
  status: CompletionFilter
  page: number
}

interface BoardState {
  pieBoard: ReviewBoardPage | null
  tableBoard: ReviewBoardPage | null
  error: string | null
}

const EMPTY_PIE_QUERY: PieQuery = {}

/** The table opens on All: no filter word merges the lifecycle stages, so
    the unfiltered read is the honest first view. */
const EMPTY_TABLE_QUERY: TableQuery = { status: 'all', page: 1 }

/** The dropdown spec both toolbars render (the same list shape for each of
    their own scopes); the values are served whole-roster by the facets
    endpoint once per mount. */
const FILTER_KEYS: readonly {
  key: 'designation' | 'businessUnit' | 'businessPartner'
  facet: 'designations' | 'businessUnits' | 'businessPartners'
  label: string
}[] = [
  { key: 'designation', facet: 'designations', label: 'Designation' },
  { key: 'businessUnit', facet: 'businessUnits', label: 'Business unit' },
  { key: 'businessPartner', facet: 'businessPartners', label: 'Business partner' },
]

const withAny = (label: string, values: string[] | null) => [
  { value: '', label },
  ...(values ?? []).map((value) => ({ value, label: value })),
]

export function ReviewStatusPage() {
  const [state, setState] = useState<BoardState>({
    pieBoard: null,
    tableBoard: null,
    error: null,
  })
  // Per-scope in-flight flags: each read announces its own loading moment so
  // the pie and the grid can veil the stale numbers while the new ones travel.
  const [pieBusy, setPieBusy] = useState(true)
  const [tableBusy, setTableBusy] = useState(true)
  const [pieQuery, setPieQuery] = useState<PieQuery>(EMPTY_PIE_QUERY)
  const [tableQuery, setTableQuery] = useState<TableQuery>(EMPTY_TABLE_QUERY)
  /** Placeholder bands wait 180ms before showing — fast answers never flash. */
  const boardSkeletonVisible = useDelaySkeleton(
    (state.pieBoard === null || state.tableBoard === null) && state.error === null,
  )
  const [facets, setFacets] = useState<RosterFacets | null>(null)
  const { notify } = useAdminStore()
  const { pieBoard, tableBoard, error } = state
  const completedReviews = useCompletedReviews(tableQuery)

  /** The bulk ZIP of completed review PDFs under the composed table query —
      the page turns the shared hook's failure word into the toast. */
  async function downloadCompletedZips(): Promise<void> {
    const result = await completedReviews.download()
    if (!result.ok) notify('error', result.detail)
  }

  /** The board's export: the server renders every employee row the
      composed query matches — search, filters, and sort riding along, never
      just this page's slice — and the chosen format and the filter-named
      file are built from that CSV. */
  async function exportReviewStatus(format: ExportFormat): Promise<void> {
    const result = await fetchReviewStatusCsvExport(tableQuery)
    if (!result.ok) {
      notify('error', result.detail)
      return
    }
    await saveTableExport(result.blob, format, {
      base: 'review-status',
      title: 'Review status',
      filters: appliedFilters(tableQuery),
    })
  }

  /** One employee's review document: the page reads and saves a single
      profile card's PDF through the shared review downloads seam; the card
      shows the download only when the row's pill reads a past-submission
      stage (self_evaluation_completed on, whatever the manager phase). */
  const reviewActions = useMemo<ProfileReviewActions>(
    () => ({
      download: async (employee) => {
        const result = await fetchEmployeeEvaluation(employee.employeeId)
        if (result.ok) {
          saveReviewPdf(result.data)
          return
        }
        notify('error', result.detail)
      },
    }),
    [notify],
  )

  // The filter dropdowns serve whole-roster values once; they never change
  // with either query, so they fetch only on mount.
  useEffect(() => {
    let cancelled = false
    void fetchEmployeeFacets().then((result) => {
      if (!cancelled && result.ok) setFacets(result.facets)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Each scope's effect rides its own query's content, not its identity: a
  // select that re-sets the same word must not re-fetch either read.
  useEffect(() => {
    let cancelled = false
    setPieBusy(true)
    void fetchReviewBoard({ ...pieQuery, status: 'all', page: 1 }).then((result) => {
      if (cancelled) return
      setPieBusy(false)
      if (result.ok) {
        setState((current) => ({ ...current, pieBoard: result.board, error: null }))
      } else {
        setState((current) => ({ ...current, error: result.detail }))
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps — the fetch keys off
    // the serialized query; a new object with identical content must re-fetch
    // exactly nothing.
  }, [JSON.stringify(pieQuery)])

  useEffect(() => {
    let cancelled = false
    setTableBusy(true)
    void fetchReviewBoard(tableQuery).then((result) => {
      if (cancelled) return
      setTableBusy(false)
      if (result.ok) {
        setState((current) => ({ ...current, tableBoard: result.board, error: null }))
      } else {
        setState((current) => ({ ...current, error: result.detail }))
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps — the fetch keys off
    // the serialized query; a new object with identical content must re-fetch
    // exactly nothing.
  }, [JSON.stringify(tableQuery)])

  const pageCount =
    tableBoard === null ? 1 : Math.max(1, Math.ceil(tableBoard.total / tableBoard.pageSize))

  // The table's row set shrank under this page: land on the last page the
  // server still holds instead of showing an empty grid.
  useEffect(() => {
    if (pageCount > 0 && tableQuery.page > pageCount) {
      setTableQuery((current) => ({ ...current, page: pageCount }))
    }
  }, [pageCount, tableQuery.page])

  /** Any non-page word moves the table read back to the first page — the
      server answers a different question now. */
  function updateTableQuery(patch: Omit<Partial<TableQuery>, 'page'>): void {
    setTableQuery((current) => ({ ...current, ...patch, page: 1 }))
  }

  /** Filter keys are this page's own spec authorship (TableFilterSpec.key);
      a blank choice means "any" and drops the word from the query. */
  function chooseTableFilter(key: string, value: string): void {
    updateTableQuery({ [key]: value || undefined } as Omit<Partial<TableQuery>, 'page'>)
  }

  /** The pie card's toolbar owns only its own words; the table's query never
      hears them. */
  function updatePieQuery(patch: Partial<PieQuery>): void {
    setPieQuery((current) => ({ ...current, ...patch }))
  }

  function choosePieFilter(key: string, value: string): void {
    updatePieQuery({ [key]: value || undefined })
  }

  /** The column headers carry sorting: a first click sorts ascending, a
      second reverses; a new column starts over at ascending. It flips on the
      queued state, not the last render's — two quick clicks must still see
      the first's order. */
  function chooseSort(sortKey: string): void {
    setTableQuery((current) => ({
      ...current,
      sortBy: sortKey as RosterSortField,
      sortOrder: current.sortBy === sortKey && current.sortOrder === 'asc' ? 'desc' : 'asc',
      page: 1,
    }))
  }

  const buildFilters = (query: Partial<RosterQuery>): readonly TableFilterSpec[] =>
    FILTER_KEYS.map((spec) => ({
      key: spec.key,
      label: spec.label,
      options: withAny('Any', facets !== null ? facets[spec.facet] : null),
      value: query[spec.key] ?? '',
    }))

  return (
    <AdminTemplate
      eyebrow="Admin · Reviews"
      title="Performance Review Progress"
      lead="Track every employee's review progress for this cycle. Search, filter, and sort employees using Search & Filter."
    >
      {error !== null ? (
        <p style={{ color: 'var(--red-deep)' }}>{error}</p>
      ) : pieBoard === null || tableBoard === null ? (
        <Card captionAccent>
          <div role="status" aria-label="Loading the review board">
            <span className="sr-only">Loading the review board.</span>
            {boardSkeletonVisible ? (
              <>
                <div className="stat-board board-skeleton">
                  <div className="tiles">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div className="tile board-skeleton__tile" key={index}>
                        <Skeleton height="10px" width="40%" />
                        <Skeleton height="26px" width="34%" />
                        <Skeleton height="11px" width="72%" />
                      </div>
                    ))}
                  </div>
                  <div className="board-skeleton__pie">
                    <Skeleton circle height="128px" width="128px" />
                    <div className="board-skeleton__legend">
                      <Skeleton height="10px" width="96px" />
                      <Skeleton height="10px" width="80px" />
                      <Skeleton height="10px" width="104px" />
                    </div>
                  </div>
                </div>
                <TableSkeleton
                  columns={[
                    { weight: 2.4 },
                    { weight: 2.8, desktopOnly: true },
                    { weight: 1.4, desktopOnly: true },
                    { weight: 2.2, desktopOnly: true },
                    { weight: 2.6, desktopOnly: true },
                    { weight: 1.8, desktopOnly: true },
                  ]}
                />
              </>
            ) : null}
          </div>
        </Card>
      ) : (
        <ReviewStatusBoard
          pieCounts={pieBoard.statusCounts}
          pieBusy={pieBusy}
          entries={tableBoard.reviews}
          total={tableBoard.total}
          tableRosterTotal={rosterTotal(tableBoard.statusCounts)}
          tableBusy={tableBusy}
          page={tableQuery.page}
          pageCount={pageCount}
          onPageChange={(page) => setTableQuery((current) => ({ ...current, page }))}
          onExport={exportReviewStatus}
          sort={{
            sortBy: tableQuery.sortBy ?? 'employeeName',
            sortOrder: tableQuery.sortOrder ?? 'asc',
            onChange: chooseSort,
          }}
          // The pie card speaks: its toolbar's words tailor the tiles and
          // pie, and the status word stays out by construction — the pie's
          // query has no status.
          pieControls={
            <TableQueryControls
              filters={buildFilters(pieQuery)}
              onFilterChange={choosePieFilter}
              onClear={() => setPieQuery(EMPTY_PIE_QUERY)}
            />
          }
          tableControls={
            <TableQueryControls
              search={tableQuery.search ?? ''}
              onSearchChange={(search) => updateTableQuery({ search: search || undefined })}
              filters={buildFilters(tableQuery)}
              onFilterChange={chooseTableFilter}
              onClear={() => setTableQuery(EMPTY_TABLE_QUERY)}
            />
          }
          statusFilter={{
            value: tableQuery.status,
            options: COMPLETION_FILTERS,
            onChange: (status) => updateTableQuery({ status: status as CompletionFilter }),
          }}
          tableActions={
            <ReviewDownloadsButton
              count={completedReviews.count}
              busy={completedReviews.busy}
              onDownload={() => void downloadCompletedZips()}
            />
          }
          review={reviewActions}
        />
      )}
    </AdminTemplate>
  )
}
