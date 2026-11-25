import { useEffect, useState } from 'react'
import { ReviewStatusBoard } from '../components/organisms/ReviewStatusBoard'
import { TableQueryControls, type TableFilterSpec } from '../components/molecules/TableQueryControls'
import { AdminTemplate } from '../components/templates/AdminTemplate'
import { fetchEmployeeFacets, fetchReviewBoard } from '../lib/api'
import { COMPLETION_FILTERS, type CompletionFilter } from '../lib/reviewStatusStore'
import type { RosterFacets, RosterQuery, RosterSortField, ReviewBoardPage, SortOrder } from '../lib/types'

interface BoardQuery extends RosterQuery {
  status: CompletionFilter
  page: number
}

interface BoardState {
  query: BoardQuery
  board: ReviewBoardPage | null
  error: string | null
}

const EMPTY_QUERY: BoardQuery = { status: 'pending', page: 1 }

/** Sort labels reuse the table's column words; values are the wire words the
    backend whitelists — `status` orders by the server's workflow rank. */
const SORT_FIELDS: readonly { value: RosterSortField | 'status'; label: string }[] = [
  { value: 'employeeName', label: 'Name' },
  { value: 'email', label: 'Email' },
  { value: 'org', label: 'Org' },
  { value: 'reportingManager', label: 'Reporting manager' },
  { value: 'status', label: 'Form status' },
]

const withAny = (label: string, values: string[] | null) => [
  { value: '', label },
  ...(values ?? []).map((value) => ({ value, label: value })),
]

/** The board's data arrives as one backend answer per composed query: the
    page slice plus the whole-roster distribution for the tiles and pie —
    the roster never loads whole on the client. */
export function ReviewStatusPage() {
  const [state, setState] = useState<BoardState>({ query: EMPTY_QUERY, board: null, error: null })
  const [facets, setFacets] = useState<RosterFacets | null>(null)
  const { query, board, error } = state

  // The filter dropdowns serve whole-roster values once; they never change
  // with the query, so they fetch only on mount.
  useEffect(() => {
    let cancelled = false
    void fetchEmployeeFacets().then((result) => {
      if (!cancelled && result.ok) setFacets(result.facets)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // The effect rides the query's content, not its object identity: a select
  // that re-sets the same word must not re-fetch.
  useEffect(() => {
    let cancelled = false
    void fetchReviewBoard(query).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setState((current) => ({ ...current, board: result.board, error: null }))
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
  }, [JSON.stringify(query)])

  const pageCount =
    board === null ? 1 : Math.max(1, Math.ceil(board.total / board.pageSize))

  // The query's row set shrank under this page: land on the last page the
  // server still holds instead of showing an empty grid.
  useEffect(() => {
    if (pageCount > 0 && query.page > pageCount) {
      setState((current) => ({ ...current, query: { ...current.query, page: pageCount } }))
    }
  }, [pageCount, query.page])

  /** Any non-page word moves the read back to the first page — the server
      answers a different question now. */
  function updateQuery(patch: Omit<Partial<BoardQuery>, 'page'>): void {
    setState((current) => ({ ...current, query: { ...current.query, ...patch, page: 1 } }))
  }

  /** Filter keys are this page's own spec authorship (TableFilterSpec.key);
      a blank choice means "any" and drops the word from the query. */
  function chooseFilter(key: string, value: string): void {
    updateQuery({ [key]: value || undefined } as Omit<Partial<BoardQuery>, 'page'>)
  }

  const filters: readonly TableFilterSpec[] = [
    {
      key: 'status',
      label: 'Form status',
      options: COMPLETION_FILTERS,
      value: query.status,
    },
    {
      key: 'designation',
      label: 'Designation',
      options: withAny('Any', facets?.designations ?? null),
      value: query.designation ?? '',
    },
    {
      key: 'location',
      label: 'Location',
      options: withAny('Any', facets?.locations ?? null),
      value: query.location ?? '',
    },
    {
      key: 'org',
      label: 'Org',
      options: withAny('Any', facets?.orgs ?? null),
      value: query.org ?? '',
    },
  ]

  return (
    <AdminTemplate
      eyebrow="Admin · Reviews"
      title="Review form status"
      lead="Completion status of every employee's review form for this cycle. Search, filter and sort the roster from Search & filter."
    >
      {error !== null ? (
        <p style={{ color: 'var(--red-deep)' }}>{error}</p>
      ) : board === null ? (
        <p className="mono muted" style={{ fontSize: '11px' }}>
          LOADING ROSTER…
        </p>
      ) : (
        <ReviewStatusBoard
          entries={board.reviews}
          statusCounts={board.statusCounts}
          total={board.total}
          page={query.page}
          pageCount={pageCount}
          onPageChange={(page) => setState((current) => ({ ...current, query: { ...current.query, page } }))}
          tableControls={
            <TableQueryControls
              search={query.search ?? ''}
              onSearchChange={(search) => updateQuery({ search: search || undefined })}
              filters={filters}
              onFilterChange={chooseFilter}
              sortFields={SORT_FIELDS}
              sortField={query.sortBy ?? 'employeeName'}
              sortOrder={query.sortOrder ?? 'asc'}
              onSortFieldChange={(sortBy) => updateQuery({ sortBy: sortBy as RosterSortField })}
              onSortOrderChange={(orderBy) => updateQuery({ sortOrder: orderBy as SortOrder })}
              onClear={() => setState((current) => ({ ...current, query: EMPTY_QUERY }))}
            />
          }
        />
      )}
    </AdminTemplate>
  )
}
