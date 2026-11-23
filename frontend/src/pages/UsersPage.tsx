import { useEmployees } from '../hooks/useEmployees'
import { UsersTableCard } from '../components/organisms/UsersTableCard'
import { AdminTemplate } from '../components/templates/AdminTemplate'

export function UsersPage() {
  const { employees, loading, error } = useEmployees()
  return (
    <AdminTemplate
      eyebrow="Admin · Users"
      title="Employees"
      lead="The roster for this review cycle, loaded from the API — CSV uploads write here too."
    >
      {error !== null ? (
        <p style={{ color: 'var(--red-deep)' }}>{error}</p>
      ) : loading ? (
        <p className="mono muted" style={{ fontSize: '11px' }}>
          LOADING ROSTER…
        </p>
      ) : (
        <UsersTableCard employees={employees} />
      )}
    </AdminTemplate>
  )
}
