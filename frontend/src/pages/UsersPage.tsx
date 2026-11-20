import { useAdminStore } from '../state/AdminContext'
import { UsersTableCard } from '../components/organisms/UsersTableCard'
import { AdminTemplate } from '../components/templates/AdminTemplate'

export function UsersPage() {
  const { employees } = useAdminStore()
  return (
    <AdminTemplate
      eyebrow="Admin · Users"
      title="Employees"
      lead="The roster for this review cycle, from the seed set and CSV uploads."
    >
      <UsersTableCard employees={employees} />
    </AdminTemplate>
  )
}
