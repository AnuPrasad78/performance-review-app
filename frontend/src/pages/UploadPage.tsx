import { useAdminStore } from '../state/AdminContext'
import { CsvImportCard } from '../components/organisms/CsvImportCard'
import { AdminTemplate } from '../components/templates/AdminTemplate'

export function UploadPage() {
  const { employees, importInFlight, importRoster } = useAdminStore()
  return (
    <AdminTemplate
      eyebrow="Admin · Upload"
      title="CSV upload"
      lead="Load employees from a roster CSV. Duplicate emails are skipped, and the roster updates on the Users page."
    >
      <CsvImportCard inFlight={importInFlight} onFileSelected={importRoster} />
      <p className="mono muted" style={{ fontSize: '11px', letterSpacing: '0.08em' }}>
        ROSTER NOW · {employees.length} {employees.length === 1 ? 'EMPLOYEE' : 'EMPLOYEES'}
      </p>
    </AdminTemplate>
  )
}
