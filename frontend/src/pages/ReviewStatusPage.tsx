import { useMemo } from 'react'
import { useAdminStore } from '../state/AdminContext'
import { ReviewStatusBoard } from '../components/organisms/ReviewStatusBoard'
import { AdminTemplate } from '../components/templates/AdminTemplate'
import { loadReviewStatuses, type EmployeeReviewStatus } from '../lib/reviewStatusStore'

export function ReviewStatusPage() {
  const { employees } = useAdminStore()
  const entries: readonly EmployeeReviewStatus[] = useMemo(() => loadReviewStatuses(employees), [employees])
  return (
    <AdminTemplate
      eyebrow="Admin · Reviews"
      title="Review form status"
      lead="Completion status of every employee's review form for this cycle. Filter the roster by pending or completed reviews."
    >
      <ReviewStatusBoard entries={entries} />
    </AdminTemplate>
  )
}
