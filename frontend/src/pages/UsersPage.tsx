import { useEffect, useMemo, useState } from 'react'
import { useEmployees } from '../hooks/useEmployees'
import { useCompletedReviews } from '../hooks/useCompletedReviews'
import { useDelaySkeleton } from '../hooks/useDelaySkeleton'
import { Card } from '../components/atoms/Card'
import { Skeleton } from '../components/atoms/Skeleton'
import { TableSkeleton } from '../components/molecules/TableSkeleton'
import { UsersTableCard } from '../components/organisms/UsersTableCard'
import { TableQueryControls, type TableFilterSpec } from '../components/molecules/TableQueryControls'
import { ReviewDownloadsButton } from '../components/molecules/ReviewDownloadsButton'
import { AdminTemplate } from '../components/templates/AdminTemplate'
import { useAdminStore } from '../state/AdminContext'
import {
  fetchEmployeeEvaluation,
  fetchEmployeeFacets,
  fetchEmployeeFormStatus,
  fetchRosterCsvExport,
  patchEmployeeStatus,
} from '../lib/api'
import { saveCsvBlob } from '../lib/csvDownload'
import { saveReviewPdf } from '../lib/reviewDownloads'
import { COMPLETION_FILTERS } from '../lib/reviewStatusStore'
import type { ProfileReviewActions } from '../hooks/useProfileReview'
import type {
  Employee,
  EmployeeStatus,
  RosterFacets,
  RosterQuery,
  RosterSortField,
} from '../lib/types'

type UsersQuery = RosterQuery & { page: number }

const EMPTY_QUERY: UsersQuery = { page: 1 }

/** Any-option + one entry per whole-roster value (once facets arrive). */
const withAny = (label: string, values: string[] | null) => [
  { value: '', label },
  ...(values ?? []).map((value) => ({ value, label: value })),
]

export function UsersPage() {
  const { notify } = useAdminStore()
  const [query, setQuery] = useState<UsersQuery>(EMPTY_QUERY)
  const [facets, setFacets] = useState<RosterFacets | null>(null)
  const roster = useEmployees(query)
  /** Placeholder bands wait 180ms before showing — fast answers never flash. */
  const rosterSkeletonVisible = useDelaySkeleton(!roster.loaded && roster.loading)
  const completedReviews = useCompletedReviews(query)
  const pageCount = Math.max(1, Math.ceil(roster.total / roster.pageSize))

  /** The server exports every employee the composed query matches (not just
      this page's slice) as the roster CSV; failures surface as a toast. */
  async function downloadCsv(): Promise<void> {
    const result = await fetchRosterCsvExport(query)
    if (result.ok) {
      saveCsvBlob(result.blob, 'employee-roster.csv')
      return
    }
    notify('error', result.detail)
  }

  /** The bulk ZIP of completed review PDFs under the composed query — the
      page turns the shared hook's failure word into the toast. */
  async function downloadCompletedZips(): Promise<void> {
    const result = await completedReviews.download()
    if (!result.ok) notify('error', result.detail)
  }

  /** One employee's review document: the card's status probe asks the form
      status endpoint (a pending review answers 200, never a 409), while the
      page reads and saves the card's PDF through the shared review downloads
      seam — only reachable once the card knows the review is completed. */
  const reviewActions = useMemo<ProfileReviewActions>(
    () => ({
      load: async (employee) => {
        const result = await fetchEmployeeFormStatus(employee.employeeId)
        return result.ok ? result.formStatus : null
      },
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

  /** The card's Active/Inactive flip: the stored row patches, then the
      roster re-reads its page so the table and the open card show the new
      word. Failures say so through the toast; the row stays as it was. */
  async function setStatus(employee: Employee, status: EmployeeStatus): Promise<void> {
    const result = await patchEmployeeStatus(employee.employeeId, status)
    if (!result.ok) {
      notify('error', result.detail)
      return
    }
    roster.refresh()
  }

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

  // The roster shrank under this page (an import removed rows): land on the
  // last page the server still holds instead of showing an empty grid.
  useEffect(() => {
    if (roster.total > 0 && query.page > pageCount) {
      setQuery((current) => ({ ...current, page: pageCount }))
    }
  }, [pageCount, roster.total, query.page])

  /** Any non-page word moves the read back to the first page — the server
      answers a different question now. */
  function updateQuery(patch: Partial<RosterQuery>): void {
    setQuery((current) => ({ ...current, ...patch, page: 1 }))
  }

  /** Filter keys are this page's own spec authorship (TableFilterSpec.key);
      a blank choice means "any" and drops the word from the query. */
  function chooseFilter(key: string, value: string): void {
    updateQuery({ [key]: value || undefined } as Partial<RosterQuery>)
  }

  /** The column headers carry sorting: a first click sorts ascending, a
      second reverses; a new column starts over at ascending. It flips on the
      queued state, not the last render's — two quick clicks must still see
      the first's order. */
  function chooseSort(sortKey: string): void {
    setQuery((current) => ({
      ...current,
      sortBy: sortKey as RosterSortField,
      sortOrder: current.sortBy === sortKey && current.sortOrder === 'asc' ? 'desc' : 'asc',
      page: 1,
    }))
  }

  /** The columns that exist in the roster table narrow at their own headers:
      the key is the column's key, the value the query word it feeds. Org and
      form-status have no column, so they stay in the toolbar pop-up. */
  const columnFilters = {
    designation: {
      value: query.designation ?? '',
      options: withAny('Any', facets?.designations ?? null),
      onChange: (designation: string) => updateQuery({ designation: designation || undefined }),
    },
    location: {
      value: query.location ?? '',
      options: withAny('Any', facets?.locations ?? null),
      onChange: (location: string) => updateQuery({ location: location || undefined }),
    },
    reportingManager: {
      value: query.reportingManager ?? '',
      options: withAny('Any', facets?.reportingManagers ?? null),
      onChange: (reportingManager: string) => updateQuery({ reportingManager: reportingManager || undefined }),
    },
    status: {
      value: query.employmentStatus ?? '',
      options: withAny('Any', facets?.employmentStatuses ?? null),
      onChange: (employmentStatus: string) => updateQuery({ employmentStatus: employmentStatus || undefined }),
    },
  }

  const filters: readonly TableFilterSpec[] = [
    {
      key: 'status',
      label: 'Form status',
      options: COMPLETION_FILTERS,
      value: query.status ?? 'all',
    },
    {
      key: 'org',
      label: 'Org',
      options: withAny('Any', facets?.orgs ?? null),
      value: query.org ?? '',
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
      eyebrow="Admin · Users"
      title="Employees"
      lead="View and manage employee records for this review cycle. New employees added through CSV uploads will appear here."
    >
      {roster.error !== null ? (
        <p style={{ color: 'var(--red-deep)' }}>{roster.error}</p>
      ) : !roster.loaded && roster.loading ? (
        <Card captionAccent>
          <div role="status" aria-label="Loading the roster">
            <span className="sr-only">Loading the roster.</span>
            {rosterSkeletonVisible ? (
              <>
                <div className="skeleton-row" style={{ justifyContent: 'flex-end' }}>
                  <Skeleton height="34px" width="120px" />
                  <Skeleton height="34px" width="140px" />
                </div>
                <TableSkeleton
                  columns={[
                    { weight: 2.4 },
                    { weight: 1.6, desktopOnly: true },
                    { weight: 2.6 },
                    { weight: 2.2, desktopOnly: true },
                    { weight: 1.6, desktopOnly: true },
                    { weight: 2.4, desktopOnly: true },
                    { weight: 1.4, desktopOnly: true },
                  ]}
                />
                <div className="skeleton-row" style={{ justifyContent: 'center' }}>
                  <Skeleton height="12px" width="88px" />
                </div>
              </>
            ) : null}
          </div>
        </Card>
      ) : (
        <UsersTableCard
          employees={roster.employees}
          page={query.page}
          pageCount={pageCount}
          onPage={(page) => setQuery((current) => ({ ...current, page }))}
          emptyMessage={
            activeQueryCount(query) > 0
              ? 'No employees match this search or filter. Loosen it in Search & filter.'
              : 'No employees loaded. Upload a roster CSV to get started.'
          }
          onDownloadCsv={downloadCsv}
          tableActions={
            <ReviewDownloadsButton
              count={completedReviews.count}
              busy={completedReviews.busy}
              onDownload={() => void downloadCompletedZips()}
            />
          }
          review={reviewActions}
          onSetStatus={setStatus}
          sort={{
            sortBy: query.sortBy ?? 'employeeName',
            sortOrder: query.sortOrder ?? 'asc',
            onChange: chooseSort,
          }}
          columnFilters={columnFilters}
          tableControls={
            <TableQueryControls
              search={query.search ?? ''}
              onSearchChange={(search) => updateQuery({ search: search || undefined })}
              filters={filters}
              onFilterChange={chooseFilter}
              onClear={() => setQuery(EMPTY_QUERY)}
            />
          }
        />
      )}
    </AdminTemplate>
  )
}

/** Search + every non-blank dropdown — the trigger badge's count. The
    form-status word only counts when it narrows (All is the no-filter noun). */
function activeQueryCount(query: RosterQuery): number {
  return [
    query.search,
    query.designation,
    query.location,
    query.org,
    query.businessUnit,
    query.reportingManager,
    query.employmentStatus,
  ].filter((word) => word !== undefined && word !== '').length + (
    query.status !== undefined && query.status !== 'all' ? 1 : 0
  )
}
