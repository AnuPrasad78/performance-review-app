import { useEffect, useState } from 'react'
import { ReviewStatusBoard } from '../components/organisms/ReviewStatusBoard'
import { TableQueryControls, type TableFilterSpec } from '../components/molecules/TableQueryControls'
import { AdminTemplate } from '../components/templates/AdminTemplate'
import { fetchEmployeeFacets, fetchReviewBoard } from '../lib/api'
import { COMPLETION_FILTERS, type CompletionFilter } from '../lib/reviewStatusStore'
import type { RosterFacets, RosterQuery, RosterSortField, ReviewBoardPage } from '../lib/types'

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

  /** The column headers carry sorting: a first click sorts ascending, a
      second reverses; a new column starts over at ascending. It flips on the
      queued state, not the last render's — two quick clicks must still see
      the first's order. */
  function chooseSort(sortKey: string): void {
    setState((current) => ({
      ...current,
      query: {
        ...current.query,
        sortBy: sortKey as RosterSortField,
        sortOrder: current.query.sortBy === sortKey && current.query.sortOrder === 'asc' ? 'desc' : 'asc',
        page: 1,
      },
    }))
  }

  const filters: readonly TableFilterSpec[] = [
    {
      key: 'designation',
      label: 'Designation',
      options: withAny('Any', facets?.designations ?? null),
      value: query.designation ?? '',
    },
    {
      key: 'businessUnit',
      label: 'Business unit',
      options: withAny('Any', facets?.businessUnits ?? null),
      value: query.businessUnit ?? '',
    },
  ]

  return (
    <AdminTemplate
      eyebrow="Admin · Reviews"
      title="Performance Review Progress"
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
          sort={{
            sortBy: query.sortBy ?? 'employeeName',
            sortOrder: query.sortOrder ?? 'asc',
            onChange: chooseSort,
          }}
          statusFilter={{
            value: query.status,
            options: COMPLETION_FILTERS,
            onChange: (status) => updateQuery({ status: status as CompletionFilter }),
          }}
          orgFilter={{
            value: query.org ?? '',
            options: withAny('Any', facets?.orgs ?? null),
            onChange: (org) => updateQuery({ org: org || undefined }),
          }}
          locationFilter={{
            value: query.location ?? '',
            options: withAny('Any', facets?.locations ?? null),
            onChange: (location) => updateQuery({ location: location || undefined }),
          }}
          managerFilter={{
            value: query.reportingManager ?? '',
            options: withAny('Any', facets?.reportingManagers ?? null),
            onChange: (reportingManager) => updateQuery({ reportingManager: reportingManager || undefined }),
          }}
          tableControls={
            <TableQueryControls
              search={query.search ?? ''}
              onSearchChange={(search) => updateQuery({ search: search || undefined })}
              filters={filters}
              onFilterChange={chooseFilter}
              onClear={() => setState((current) => ({ ...current, query: EMPTY_QUERY }))}
            />
          }
        />
      )}
    </AdminTemplate>
  )
}
