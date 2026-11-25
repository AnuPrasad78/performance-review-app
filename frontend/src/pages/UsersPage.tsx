import { useEffect, useState } from 'react'
import { useEmployees } from '../hooks/useEmployees'
import { UsersTableCard } from '../components/organisms/UsersTableCard'
import { TableQueryControls, type TableFilterSpec } from '../components/molecules/TableQueryControls'
import { AdminTemplate } from '../components/templates/AdminTemplate'
import { useAdminStore } from '../state/AdminContext'
import { fetchEmployeeFacets, fetchRosterCsvExport } from '../lib/api'
import { saveCsvBlob } from '../lib/csvDownload'
import { COMPLETION_FILTERS } from '../lib/reviewStatusStore'
import type { RosterFacets, RosterQuery, RosterSortField, SortOrder } from '../lib/types'

type UsersQuery = RosterQuery & { page: number }

const EMPTY_QUERY: UsersQuery = { page: 1 }

/** Sort dropdown labels reuse the table's column words; values are the wire
    words the backend whitelists. */
const SORT_FIELDS: readonly { value: RosterSortField; label: string }[] = [
  { value: 'employeeName', label: 'Name' },
  { value: 'employeeId', label: 'Employee ID' },
  { value: 'email', label: 'Email' },
  { value: 'designation', label: 'Designation' },
  { value: 'location', label: 'Location' },
  { value: 'reportingManager', label: 'Reporting manager' },
  { value: 'employmentStatus', label: 'Status' },
]

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

  const filters: readonly TableFilterSpec[] = [
    {
      key: 'status',
      label: 'Form status',
      options: COMPLETION_FILTERS,
      value: query.status ?? 'all',
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
    {
      key: 'businessUnit',
      label: 'Business unit',
      options: withAny('Any', facets?.businessUnits ?? null),
      value: query.businessUnit ?? '',
    },
    {
      key: 'reportingManager',
      label: 'Reporting manager',
      options: withAny('Any', facets?.reportingManagers ?? null),
      value: query.reportingManager ?? '',
    },
    {
      key: 'employmentStatus',
      label: 'Status',
      options: withAny('Any', facets?.employmentStatuses ?? null),
      value: query.employmentStatus ?? '',
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
