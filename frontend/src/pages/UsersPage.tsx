import { useEffect, useState } from 'react'
import { useEmployees } from '../hooks/useEmployees'
import { UsersTableCard } from '../components/organisms/UsersTableCard'
import { TableQueryControls, type TableFilterSpec } from '../components/molecules/TableQueryControls'
import { AdminTemplate } from '../components/templates/AdminTemplate'
import { useAdminStore } from '../state/AdminContext'
import { fetchEmployeeFacets, fetchRosterCsvExport } from '../lib/api'
import { saveCsvBlob } from '../lib/csvDownload'
import { COMPLETION_FILTERS } from '../lib/reviewStatusStore'
import type { RosterFacets, RosterQuery, RosterSortField } from '../lib/types'

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
      lead="The roster for this review cycle, loaded from the API — CSV uploads write here too."
    >
      {roster.error !== null ? (
        <p style={{ color: 'var(--red-deep)' }}>{roster.error}</p>
      ) : !roster.loaded && roster.loading ? (
        <p className="mono muted" style={{ fontSize: '11px' }}>
          LOADING ROSTER…
        </p>
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
