import { useEffect, useState } from 'react'
import { useEmployees } from '../hooks/useEmployees'
import { UsersTableCard } from '../components/organisms/UsersTableCard'
import { AdminTemplate } from '../components/templates/AdminTemplate'

export function UsersPage() {
  const [page, setPage] = useState(1)
  const roster = useEmployees(page)
  const pageCount = Math.max(1, Math.ceil(roster.total / roster.pageSize))

  // The roster shrank under this page (an import removed rows): land on the
  // last page the server still holds instead of showing an empty grid.
  useEffect(() => {
    if (roster.total > 0 && page > pageCount) setPage(pageCount)
  }, [page, pageCount, roster.total])

  return (
    <AdminTemplate
      eyebrow="Admin · Users"
      title="Employees"
      lead="The roster for this review cycle, loaded from the API — CSV uploads write here too."
    >
      {roster.error !== null ? (
        <p style={{ color: 'var(--red-deep)' }}>{roster.error}</p>
      ) : roster.loading ? (
        <p className="mono muted" style={{ fontSize: '11px' }}>
          LOADING ROSTER…
        </p>
      ) : (
        <UsersTableCard
          employees={roster.employees}
          page={page}
          pageCount={pageCount}
          onPage={setPage}
        />
      )}
    </AdminTemplate>
  )
}
