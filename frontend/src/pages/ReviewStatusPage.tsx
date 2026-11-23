import { useMemo } from 'react'
import { useEmployees } from '../hooks/useEmployees'
import { ReviewStatusBoard } from '../components/organisms/ReviewStatusBoard'
import { AdminTemplate } from '../components/templates/AdminTemplate'
import { loadReviewStatuses, type EmployeeReviewStatus } from '../lib/reviewStatusStore'

export function ReviewStatusPage() {
  const { employees, loading, error } = useEmployees()
  const entries: readonly EmployeeReviewStatus[] = useMemo(
    () => loadReviewStatuses(employees),
    [employees],
  )
  return (
    <AdminTemplate
      eyebrow="Admin · Reviews"
      title="Review form status"
      lead="Completion status of every employee's review form for this cycle. Filter the roster by pending or completed reviews."
    >
      {error !== null ? (
        <p style={{ color: 'var(--red-deep)' }}>{error}</p>
      ) : loading ? (
        <p className="mono muted" style={{ fontSize: '11px' }}>
          LOADING ROSTER…
        </p>
      ) : (
        <ReviewStatusBoard entries={entries} />
      )}
    </AdminTemplate>
  )
}
